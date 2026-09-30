import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();
export function authorize(request, env) {
  const header = request.headers.authorization ?? '';
  if (!/^Basic [A-Z0-9+/]+={0,2}$/i.test(header) || header.length > 4096) return 401;
  const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
  if (!timingSafeEqual(digest(value), digest(`${env.OWNER_GATE_USERNAME}:${env.OWNER_GATE_PASSWORD}`))) return 401;
  if ((!['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.headers.upgrade) && request.headers.origin !== env.APP_ORIGIN) return 403;
  if (request.headers.origin && request.headers.origin !== env.APP_ORIGIN) return 403;
  return 200;
}

export function formatBangkokTimestamp(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${values.fractionalSecond}+07:00`
}

function recordOwnerAccess(audit, now, method, status) {
  audit({
    event: 'owner_access',
    outcome: status === 200 ? 'authorized' : 'rejected',
    method,
    timestamp: formatBangkokTimestamp(now()),
  })
}

function reject(response, status) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (status === 401) headers['WWW-Authenticate'] = 'Basic realm="PMS owner", charset="UTF-8"';
  response.writeHead(status, headers);
  let code = 'DEPENDENCY_UNAVAILABLE';
  if (status === 401) code = 'OWNER_UNAUTHENTICATED';
  else if (status === 403) code = 'ACCESS_DENIED';
  response.end(JSON.stringify({ error: { code, message: 'ไม่สามารถเข้าถึงระบบได้' } }));
}

function forwardedHeaders(request, internalProof) {
  const headers = { ...request.headers };
  delete headers.authorization;
  delete headers['proxy-authorization'];
  delete headers['x-middleware-subrequest'];
  delete headers['x-pms-owner-authenticated'];
  headers['x-pms-owner-proof'] = internalProof;
  return headers;
}

function forwardHttp(request, response, upstreamPort, internalProof) {
  const headers = forwardedHeaders(request, internalProof);
  const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url, method: request.method, headers }, (result) => {
    response.writeHead(result.statusCode, { ...result.headers, 'cache-control': 'no-store' });
    result.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) reject(response, 503); else response.destroy(); });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
}

function forwardUpgrade(request, socket, head, upstreamPort, internalProof) {
  const headers = forwardedHeaders(request, internalProof);
  const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url, headers });
  upstream.on('upgrade', (result, peer, upstreamHead) => {
    const serializedHeaders = Object.entries(result.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${serializedHeaders}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) peer.write(head);
    socket.pipe(peer).pipe(socket);
    peer.on('error', () => socket.destroy());
    socket.on('error', () => peer.destroy());
    socket.on('close', () => peer.destroy());
  });
  upstream.on('response', () => socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));
  upstream.on('error', () => socket.destroy());
  upstream.end();
}

export function createOwnerGate(env, upstreamPort, options = {}) {
  const internalProof = env.PMS_INTERNAL_OWNER_PROOF || randomBytes(32).toString('hex');
  const audit = options.audit ?? ((event) => console.info(JSON.stringify(event)));
  const now = options.now ?? (() => new Date());
  const server = http.createServer((request, response) => {
    // Exact, read-only infrastructure exception; Next returns only generic status.
    const health = request.method === 'GET' && request.url === '/api/health';
    const status = health ? 200 : authorize(request, env);
    if (!health) recordOwnerAccess(audit, now, request.method, status);
    if (status !== 200) return reject(response, status);
    return forwardHttp(request, response, upstreamPort, internalProof);
  });
  server.on('upgrade', (request, socket, head) => {
    const status = authorize(request, env);
    recordOwnerAccess(audit, now, request.method, status);
    if (status !== 200) {
      socket.end(`HTTP/1.1 ${status} Access denied\r\nConnection: close\r\n\r\n`);
      return;
    }
    forwardUpgrade(request, socket, head, upstreamPort, internalProof);
  });
  return server;
}
