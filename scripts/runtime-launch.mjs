import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig, safeRuntimeSummary } from './runtime-config.mjs';
import { databaseUrl } from './database-url.mjs';
import { createOwnerGate } from './owner-gate.mjs';

export function redact(value, env) {
  let result = value;
  for (const key of ['OWNER_GATE_USERNAME', 'OWNER_GATE_PASSWORD', 'GITLAB_TOKEN', 'NEXTAUTH_SECRET', 'DATABASE_URL', 'POSTGRES_PASSWORD']) {
    if (env[key]) result = result.split(env[key]).join('[redacted]');
  }
  return result.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]');
}

export async function launch(args = process.argv.slice(2)) {
  if (process.env.RUNTIME_DOCKER !== 'true') {
    try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot load runtime environment'); }
  }
  if (!process.env.DATABASE_URL && process.env.POSTGRES_USER) {
    process.env.DATABASE_URL = databaseUrl({ ...process.env, POSTGRES_HOST: process.env.POSTGRES_HOST || '127.0.0.1' });
  }
  const env = loadRuntimeConfig();
  if (args[0] === '--check') { console.log(JSON.stringify(safeRuntimeSummary(env))); return; }
  if (!args.length) throw new Error('Missing application command');
  const port = Number(env.PORT || env.APP_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65534) throw new Error('Invalid application port');
  const upstreamPort = port + 1;
  if (args[0] === '--dev' || args[0] === '--start') {
    args = [process.execPath, 'node_modules/next/dist/bin/next', args[0] === '--dev' ? 'dev' : 'start', '--hostname', '127.0.0.1', '--port', String(upstreamPort)];
  }
  const gate = createOwnerGate(env, upstreamPort);
  // The child never listens on the container network; only the gate does.
  const childEnv = { ...env, PORT: String(upstreamPort), HOSTNAME: '127.0.0.1' };
  // Gate credentials are unnecessary inside Next. GitLab remains server-only.
  delete childEnv.OWNER_GATE_USERNAME;
  delete childEnv.OWNER_GATE_PASSWORD;
  delete childEnv.OWNER_GATE_USERNAME_FILE;
  delete childEnv.OWNER_GATE_PASSWORD_FILE;
  const child = spawn(args[0], args.slice(1), { env: childEnv, stdio: ['inherit', 'pipe', 'pipe'] });
  if (process.send) process.send({ childPid: child.pid });
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) console.log(redact(line, env));
      if (pending.length > 65536) pending = '[oversized log omitted]';
    });
    stream.on('end', () => { if (pending) console.log(redact(pending, env)); });
  }
  child.on('error', () => { console.error('Application process unavailable'); gate.close(); process.exitCode = 1; });
  child.on('exit', (code) => { gate.close(); process.exit(code ?? 1); });
  gate.on('error', () => { console.error('Owner gate unavailable'); child.kill(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { gate.close(); child.kill(signal); });
  gate.listen(port, '0.0.0.0');
  console.log(JSON.stringify(safeRuntimeSummary(env)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  launch().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
