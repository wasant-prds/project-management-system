import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();
const SESSION_COOKIE = 'pms_owner_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW = 60 * 1000;

function basicCredentialsMatch(header, env) {
  if (typeof header !== 'string' || !/^Basic [A-Z0-9+/]+={0,2}$/i.test(header) || header.length > 8192) return false;
  const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
  return timingSafeEqual(digest(value), digest(`${env.OWNER_GATE_USERNAME}:${env.OWNER_GATE_PASSWORD}`));
}

function sessionKey(request) {
  const cookies = (request.headers.cookie ?? '').split(';');
  const token = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? digest(token).toString('hex') : null;
}

function validOrigin(request, env) {
  if ((!['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.headers.upgrade) && request.headers.origin !== env.APP_ORIGIN) return false;
  return !request.headers.origin || request.headers.origin === env.APP_ORIGIN;
}

export function authorize(request, env, sessions = new Map(), now = Date.now()) {
  const header = request.headers.authorization ?? '';
  const key = sessionKey(request);
  const expiresAt = key && sessions.get(key);
  if (!basicCredentialsMatch(header, env) && !(expiresAt && expiresAt > now)) return 401;
  return validOrigin(request, env) ? 200 : 403;
}

export function safeLoginDestination(value, origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]|%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || /^\/(?:login(?:\/|$)|api(?:\/|$)|_next(?:\/|$))/.test(url.pathname)) return '/';
    return url.pathname + url.search;
  } catch { return '/'; }
}

function sessionCookie(env, token = '') {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_DURATION / 1000 : 0}${env.APP_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}

async function readLoginBody(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new Error('Invalid login body');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) throw new Error('Invalid login body');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || Array.isArray(body) || typeof body.username !== 'string' || typeof body.password !== 'string' || /[:\s]/.test(body.username) || body.username.length > 256 || body.password.length > 4096) throw new Error('Invalid login body');
  return body;
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

function auditOrigin(value) {
  if (value === undefined) return 'missing'
  if (value === 'null') return 'opaque'
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : 'invalid'
  } catch {
    return 'invalid'
  }
}

export function ownerAccessEvent(request, status, date) {
  return {
    event: 'owner_access',
    outcome: status === 200 ? 'authorized' : 'rejected',
    method: request.method,
    status,
    origin: auditOrigin(request.headers.origin),
    timestamp: formatBangkokTimestamp(date),
  }
}

function reject(response, status) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
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
  delete headers['x-pms-owner-proof'];
  if (headers.cookie) {
    headers.cookie = headers.cookie.split(';').filter((cookie) => cookie.trim().split('=')[0] !== SESSION_COOKIE).join(';');
    if (!headers.cookie) delete headers.cookie;
  }
  if (internalProof) headers['x-pms-owner-proof'] = internalProof;
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
  // Only opaque token hashes live in memory. Sessions expire after eight hours
  // and are invalidated on logout or runtime restart; credentials never reach Next.
  const sessions = new Map();
  const loginAttempts = new Map();

  async function login(request, response) {
    if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, { Allow: 'POST' });
    if (!validOrigin(request, env)) return reject(response, 403);
    const timestamp = now().getTime();
    for (const [key, attempt] of loginAttempts) if (attempt.resetAt <= timestamp) loginAttempts.delete(key);
    const address = request.socket.remoteAddress;
    const attempt = loginAttempts.get(address) ?? { count: 0, resetAt: timestamp + LOGIN_WINDOW };
    if (attempt.count >= 10) {
      audit(ownerAccessEvent(request, 429, now()));
      return sendJson(response, 429, { error: { code: 'RATE_LIMITED', message: 'กรุณารอสักครู่แล้วลองใหม่' } }, { 'Retry-After': String(Math.max(1, Math.ceil((attempt.resetAt - timestamp) / 1000))) });
    }
    // Count before reading the body so concurrent attempts share the same limit.
    attempt.count++;
    if (!loginAttempts.has(address) && loginAttempts.size >= 1024) loginAttempts.delete(loginAttempts.keys().next().value);
    loginAttempts.set(address, attempt);
    let body;
    try { body = await readLoginBody(request); }
    catch { return sendJson(response, 400, { error: { code: 'VALIDATION_ERROR', message: 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง' } }); }
    const authorization = `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}`;
    if (!basicCredentialsMatch(authorization, env)) {
      audit(ownerAccessEvent(request, 401, now()));
      return reject(response, 401);
    }
    loginAttempts.delete(address);
    for (const [key, expiresAt] of sessions) if (expiresAt <= timestamp) sessions.delete(key);
    const previous = sessionKey(request);
    if (previous) sessions.delete(previous);
    if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    sessions.set(digest(token).toString('hex'), timestamp + SESSION_DURATION);
    audit(ownerAccessEvent(request, 200, now()));
    return sendJson(response, 200, { redirectTo: safeLoginDestination(body.next, env.APP_ORIGIN) }, { 'Set-Cookie': sessionCookie(env, token) });
  }

  const server = http.createServer((request, response) => {
    const pathname = request.url.split('?')[0];
    if (pathname === '/api/auth/login') {
      login(request, response).catch(() => { if (!response.headersSent) reject(response, 503); else response.destroy(); });
      return;
    }
    if (pathname === '/api/auth/logout') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, { Allow: 'POST' });
      if (!validOrigin(request, env)) return reject(response, 403);
      const key = sessionKey(request);
      if (key) sessions.delete(key);
      return sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie(env) });
    }
    // Exact, read-only infrastructure exception; Next returns only generic status.
    const health = request.method === 'GET' && request.url === '/api/health';
    const status = health ? 200 : authorize(request, env, sessions, now().getTime());
    const publicRead = ['GET', 'HEAD'].includes(request.method) && (pathname === '/login' || pathname.startsWith('/_next/static/') || pathname === '/favicon.ico' || pathname === '/icon.svg');
    if (publicRead) {
      if (!validOrigin(request, env)) return reject(response, 403);
      if (pathname === '/login' && status === 200) {
        const next = new URL(request.url, env.APP_ORIGIN).searchParams.get('next');
        response.writeHead(303, { Location: safeLoginDestination(next, env.APP_ORIGIN), 'Cache-Control': 'no-store' });
        return response.end();
      }
      // Public assets and the login page never receive an owner proof.
      return forwardHttp(request, response, upstreamPort);
    }
    if (!health) audit(ownerAccessEvent(request, status, now()));
    if (status === 401 && ['GET', 'HEAD'].includes(request.method) && !pathname.startsWith('/api/')) {
      response.writeHead(307, { Location: `/login?next=${encodeURIComponent(request.url)}`, 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (status !== 200) return reject(response, status);
    return forwardHttp(request, response, upstreamPort, internalProof);
  });
  server.on('upgrade', (request, socket, head) => {
    // The public login page needs hot reload during local development only.
    if (['local', 'dev'].includes(env.APP_ENV) && request.url.split('?')[0] === '/_next/webpack-hmr' && request.headers.origin === env.APP_ORIGIN) {
      forwardUpgrade(request, socket, head, upstreamPort);
      return;
    }
    const status = authorize(request, env, sessions, now().getTime());
    audit(ownerAccessEvent(request, status, now()));
    if (status !== 200) {
      socket.end(`HTTP/1.1 ${status} Access denied\r\nConnection: close\r\n\r\n`);
      return;
    }
    forwardUpgrade(request, socket, head, upstreamPort, internalProof);
  });
  return server;
}
