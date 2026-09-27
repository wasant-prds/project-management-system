import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();
export function authorize(request, env) {
  const header = request.headers.authorization ?? '';
  if (!/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header) || header.length > 4096) return 401;
  const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
  if (!timingSafeEqual(digest(value), digest(`${env.OWNER_GATE_USERNAME}:${env.OWNER_GATE_PASSWORD}`))) return 401;
  if ((!['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.headers.upgrade) && request.headers.origin !== env.APP_ORIGIN) return 403;
  if (request.headers.origin && request.headers.origin !== env.APP_ORIGIN) return 403;
  return 200;
}

function reject(response, status) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (status === 401) headers['WWW-Authenticate'] = 'Basic realm="PMS owner", charset="UTF-8"';
  response.writeHead(status, headers);
  response.end(JSON.stringify({ error: { code: status === 401 ? 'OWNER_UNAUTHENTICATED' : status === 403 ? 'ACCESS_DENIED' : 'DEPENDENCY_UNAVAILABLE', message: 'ไม่สามารถเข้าถึงระบบได้' } }));
}

export function createOwnerGate(env, upstreamPort) {
  const server = http.createServer((request, response) => {
    // Exact, read-only infrastructure exception; Next returns only generic status.
    const health = request.method === 'GET' && request.url === '/api/health';
    const status = health ? 200 : authorize(request, env);
    if (status !== 200) return reject(response, status);
    const headers = { ...request.headers };
    delete headers.authorization;
    delete headers['x-middleware-subrequest'];
    delete headers['proxy-authorization'];
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url, method: request.method, headers }, (result) => {
      response.writeHead(result.statusCode, { ...result.headers, 'cache-control': 'no-store' });
      result.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) reject(response, 503); else response.destroy(); });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    const status = authorize(request, env);
    if (status !== 200) { socket.end(`HTTP/1.1 ${status} Access denied\r\nConnection: close\r\n\r\n`); return; }
    const headers = { ...request.headers };
    delete headers.authorization;
    delete headers['x-middleware-subrequest'];
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url, headers });
    upstream.on('upgrade', (result, peer, upstreamHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(result.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
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
  });
  return server;
}
