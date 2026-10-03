import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadRuntimeConfig, safeRuntimeSummary } from '../../scripts/runtime-config.mjs';
import { createOwnerGate } from '../../scripts/owner-gate.mjs';
import { redact } from '../../scripts/runtime-launch.mjs';
import { databaseUrl } from '../../scripts/database-url.mjs';
import { verifyRuntime, verifyCompose } from '../../scripts/runtime-verify.mjs';

const fixture = () => ({ APP_ENV: 'dev', TZ: 'Asia/Bangkok', APP_ORIGIN: 'http://localhost:3777',
  OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'synthetic-owner-password-32-characters',
  GITLAB_BASE_URL: 'https://gitlab.example.test/subpath/', GITLAB_TOKEN: 'synthetic-gitlab-token',
  DATABASE_URL: 'postgresql://test:test@localhost/test' });
const basic = (env) => `Basic ${Buffer.from(`${env.OWNER_GATE_USERNAME}:${env.OWNER_GATE_PASSWORD}`).toString('base64')}`;
const listen = async (server) => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = (server) => { server.closeAllConnections(); server.close(); };

test('PostgreSQL secrets are encoded without losing spaces, quotes or special characters', () => {
  const values = { POSTGRES_USER: 'test user', POSTGRES_PASSWORD: 'p@ss:word &\'quoted', POSTGRES_DB: 'test/db' };
  const url = new URL(databaseUrl(values));
  assert.equal(decodeURIComponent(url.password), values.POSTGRES_PASSWORD);
  assert.equal(decodeURIComponent(url.username), values.POSTGRES_USER);
  assert.equal(decodeURIComponent(url.pathname.slice(1)), values.POSTGRES_DB);
  assert.equal(url.searchParams.get('options'), '--timezone=Asia/Bangkok');
  assert.throws(() => databaseUrl({}));
});

test('runtime verification prints only safe status and rejects public bindings or failed dependencies', () => {
  const config = { services: {
    app: { ports: [{ host_ip: '127.0.0.1' }], environment: { TZ: 'Asia/Bangkok', OWNER_GATE_PASSWORD: 'synthetic-password', OWNER_GATE_USERNAME: 'owner', POSTGRES_PASSWORD: 'synthetic-db-password' } },
    postgres: { ports: [{ host_ip: '127.0.0.1' }], environment: { TZ: 'Asia/Bangkok' }, command: ['postgres', '-c', 'timezone=Asia/Bangkok'] },
  } };
  const run = (args) => args.includes('config') ? JSON.stringify(config) : args.includes('app') ? JSON.stringify({ timezone: 'Asia/Bangkok', ownerGate: 'enabled' }) : 'Asia/Bangkok\n';
  assert.equal(verifyRuntime('docker-compose.yml', run).postgresSessionTimezone, 'Asia/Bangkok');
  assert.throws(() => verifyRuntime('docker-compose.yml', () => { throw new Error('synthetic-secret'); }), /Runtime verification failed/);
  config.services.app.ports[0].host_ip = '0.0.0.0'; assert.throws(() => verifyCompose(config), /Public host binding/);
});

test('all environments enforce Bangkok without disclosing credentials', () => {
  for (const site of ['local', 'dev', 'uat', 'prod']) {
    const env = loadRuntimeConfig({ ...fixture(), APP_ENV: site });
    assert.equal(env.TZ, 'Asia/Bangkok'); assert.equal(env.PGTZ, 'Asia/Bangkok');
    assert.equal(new URL(env.DATABASE_URL).searchParams.get('options'), '--timezone=Asia/Bangkok');
    assert.equal(env.GITLAB_BASE_URL, 'https://gitlab.example.test/subpath');
    for (const key of ['OWNER_GATE_PASSWORD', 'GITLAB_TOKEN', 'DATABASE_URL']) assert.ok(!JSON.stringify(safeRuntimeSummary(env)).includes(env[key]));
  }
});

test('missing, invalid, ambiguous and public credentials fail closed', () => {
  for (const change of [
    { APP_ENV: 'other' }, { OWNER_GATE_PASSWORD: '' }, { OWNER_GATE_PASSWORD: '<replace-password>' },
    { OWNER_GATE_USERNAME: 'user:name' }, { TZ: 'UTC' }, { APP_ORIGIN: 'http://public.example.test' },
    { APP_ORIGIN: 'https://user:password@example.test' }, { GITLAB_TOKEN: '' },
    { GITLAB_BASE_URL: 'http://gitlab.example.test' }, { GITLAB_BASE_URL: 'https://user:password@example.test' },
    { GITLAB_BASE_URL: 'https://example.test?token=secret' }, { GITLAB_TOKEN: 'bad\nheader' },
    { NEXT_PUBLIC_GITLAB_TOKEN: 'must-not-be-public' }, { OWNER_GATE_PASSWORD_FILE: '/missing' }, { DATABASE_URL: 'invalid' },
  ]) assert.throws(() => loadRuntimeConfig({ ...fixture(), ...change }));
});

test('environment values preserve characters and reject removed secret-file settings', () => {
  const value = 'password with spaces &:0123456789abcdef';
  assert.equal(loadRuntimeConfig({ ...fixture(), OWNER_GATE_PASSWORD: value }).OWNER_GATE_PASSWORD, value);
  assert.throws(() => loadRuntimeConfig({ ...fixture(), GITLAB_TOKEN_FILE: '/unused' }), /no longer supported/);
  assert.equal(safeRuntimeSummary(loadRuntimeConfig({ ...fixture(), GITLAB_BASE_URL: '', GITLAB_TOKEN: '' })).gitlab, 'disabled');
});

test('real HTTP protects pages/APIs and mutations, strips credentials, rejects bypass and WebSocket abuse', async (t) => {
  const env = loadRuntimeConfig(fixture()); let requests = 0;
  const backend = http.createServer((req, res) => { requests++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ headers: req.headers })); });
  const gate = createOwnerGate(env, await listen(backend)); const port = await listen(gate);
  t.after(() => { close(gate); close(backend); }); const base = `http://127.0.0.1:${port}`;
  for (const path of ['/', '/projects', '/api/work-items', '/api/work-logs', '/_next/static/test.js', '/%61pi/users', '/api/health?bypass=1']) {
    const response = await fetch(base + path, { headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware' } });
    assert.equal(response.status, 401); assert.match(response.headers.get('www-authenticate'), /PMS owner/);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(!(await response.text()).includes(env.GITLAB_TOKEN));
  }
  assert.equal(requests, 0);
  for (const authorization of ['Bearer invalid', 'Basic !!!', 'Basic ' + Buffer.from('owner:wrong').toString('base64')]) {
    assert.equal((await fetch(base + '/api/users', { headers: { authorization } })).status, 401);
  }
  const headers = { authorization: basic(env), 'x-middleware-subrequest': 'bypass', 'proxy-authorization': 'secret' };
  const success = await fetch(base + '/api/users', { headers }); assert.equal(success.status, 200);
  const result = await success.json();
  for (const key of ['authorization', 'x-middleware-subrequest', 'proxy-authorization']) assert.equal(result.headers[key], undefined);
  const assetRequests = requests;
  const deniedFont = await fetch(base + '/_next/static/media/font.woff2', {
    headers: { ...headers, origin: 'http://127.0.0.1:3777' },
  });
  assert.equal(deniedFont.status, 403);
  assert.equal((await deniedFont.json()).error.code, 'ACCESS_DENIED');
  assert.equal(requests, assetRequests);
  const allowedFont = await fetch(base + '/_next/static/media/font.woff2', {
    headers: { ...headers, origin: env.APP_ORIGIN },
  });
  assert.equal(allowedFont.status, 200);
  assert.equal(requests, assetRequests + 1);
  const before = requests;
  for (const method of ['POST', 'PATCH', 'DELETE']) for (const origin of [undefined, 'https://attacker.example.test']) {
    assert.equal((await fetch(base + '/api/work-items', { method, headers: { ...headers, ...(origin ? { origin } : {}) } })).status, 403);
  }
  assert.equal(requests, before);
  assert.equal((await fetch(base + '/api/work-items', { method: 'POST', headers: { ...headers, origin: env.APP_ORIGIN }, body: 'test' })).status, 200);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  for (const authorization of ['', `Authorization: ${basic(env)}\r\n`]) {
    const socket = net.connect(port, '127.0.0.1'); await once(socket, 'connect');
    socket.write(`GET /_next/webpack-hmr HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n${authorization}\r\n`);
    const [data] = await once(socket, 'data'); assert.match(data.toString(), /HTTP\/1.1 (401|403)/); socket.destroy();
  }
});

test('upstream failure is a safe 503', async (t) => {
  const backend = http.createServer(); const port = await listen(backend); await new Promise((resolve) => backend.close(resolve));
  const env = loadRuntimeConfig(fixture()); const gate = createOwnerGate(env, port); const gatePort = await listen(gate); t.after(() => close(gate));
  const response = await fetch(`http://127.0.0.1:${gatePort}/api/users`, { headers: { authorization: basic(env) } });
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'DEPENDENCY_UNAVAILABLE');
});

test('CLI preflight reads root .env without printing credentials', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pms-runtime-'));
  try {
    await writeFile(join(folder, '.env'), Object.entries(fixture()).map(([key, value]) => `${key}='${value}'`).join('\n'));
    const env = { ...process.env, RUNTIME_DOCKER: 'false' };
    for (const key of Object.keys(fixture())) delete env[key];
    const script = resolve('scripts/runtime-launch.mjs');
    const result = spawnSync(process.execPath, [script, '--check'], { env, cwd: folder, encoding: 'utf8' });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.equal(JSON.parse(result.stdout).gitlab, 'configured');
    assert.ok(!result.stdout.includes(fixture().GITLAB_TOKEN));
    const denied = spawnSync(process.execPath, [script, '--check'], { env: { ...env, OWNER_GATE_PASSWORD: 'short' }, cwd: folder, encoding: 'utf8' });
    assert.equal(denied.status, 1); assert.ok(!denied.stderr.includes(fixture().GITLAB_TOKEN));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('deployment, generic health and reusable runner regressions', async () => {
  const env = fixture(); for (const key of ['GITLAB_TOKEN', 'OWNER_GATE_PASSWORD', 'DATABASE_URL']) assert.ok(!redact(`failure ${env[key]}`, env).includes(env[key]));
  const read = (path) => readFile(path, 'utf8');
  for (const path of ['docker-compose.yml', 'docker-compose.uat.yml', 'docker-compose.prod.yml']) {
    const text = await read(path); assert.match(text, /127\.0\.0\.1:.*:3000/); assert.doesNotMatch(text, /NEXTAUTH_SECRET|dev-secret/);
    if (path !== 'docker-compose.uat.yml') assert.match(text, /-c timezone=Asia\/Bangkok/);
  }
  const shared = await read('docker-compose.database.yml');
  assert.match(shared, /127\.0\.0\.1:\$\{POSTGRES_PORT/); assert.match(shared, /TZ: Asia\/Bangkok/);
  assert.match(shared, /OWNER_GATE_PASSWORD: \$\{OWNER_GATE_PASSWORD/); assert.doesNotMatch(shared, /secrets:|_FILE|RUNTIME_SECRETS_DIR/);
  assert.match(await read('.dockerignore'), /\r?\nsecrets\r?\n/); assert.match(await read('.gitignore'), /\/secrets\/\*\*\/\*\.txt/);
  assert.match(await read('Dockerfile'), /COPY scripts\/runtime-\*\.mjs scripts\/owner-gate\.mjs/);
  assert.match(await read('scripts/docker-entrypoint-app.sh'), /exec node \/app\/scripts\/runtime-launch.mjs/);
  assert.doesNotMatch(await read('app/api/health/route.ts'), /error\.message|console\.error\([^\n]*, error\)/);
  assert.equal(JSON.parse(await read('package.json')).scripts['test:runtime-security'], 'node tests/run.mjs runtime-security');
});
