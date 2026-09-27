import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('launcher puts child on loopback, removes owner credentials, redacts fragmented logs and shuts down', { timeout: 15000 }, async (t) => {
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const token = 'synthetic-launcher-token'; const password = 'synthetic-launcher-password-more-than-32';
  const env = { ...process.env, RUNTIME_DOCKER: 'true', APP_ENV: 'dev', TZ: 'Asia/Bangkok', PORT: '', APP_PORT: String(port),
    APP_ORIGIN: `http://localhost:${port}`, OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: password,
    GITLAB_BASE_URL: 'https://gitlab.example.test', GITLAB_TOKEN: token, DATABASE_URL: 'postgresql://test:test@127.0.0.1/test' };
  const code = "const h=require('http');process.stdout.write(process.env.GITLAB_TOKEN.slice(0,8));setTimeout(()=>console.log(process.env.GITLAB_TOKEN.slice(8)),20);h.createServer((q,r)=>r.end(JSON.stringify({host:process.env.HOSTNAME,timezone:process.env.TZ,owner:process.env.OWNER_GATE_PASSWORD??null,pid:process.pid}))).listen(Number(process.env.PORT),process.env.HOSTNAME)";
  const child = spawn(process.execPath, ['scripts/runtime-launch.mjs', process.execPath, '-e', code], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { output += chunk; });
  t.after(() => { child.kill(); if (result?.pid) { try { process.kill(result.pid); } catch {} } });
  const headers = { authorization: `Basic ${Buffer.from(`owner:${password}`).toString('base64')}` };
  let result;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/`, { headers }); if (response.ok) { result = await response.json(); break; } }
    catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(result?.pid);
  assert.deepEqual({ ...result, pid: undefined }, { host: '127.0.0.1', timezone: 'Asia/Bangkok', owner: null, pid: undefined });
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/users`)).status, 401);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(!output.includes(token)); assert.ok(!output.includes(password)); assert.match(output, /\[redacted\]/);
  const exited = once(child, 'exit'); child.kill(); await exited;
});
