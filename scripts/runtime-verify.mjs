import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function verifyCompose(config) {
  for (const service of ['app', 'postgres']) {
    const value = config.services?.[service];
    if (!value || value.environment?.TZ !== 'Asia/Bangkok') throw new Error('Invalid runtime timezone');
    for (const port of value.ports ?? []) if (port.host_ip !== '127.0.0.1') throw new Error('Public host binding is forbidden');
  }
  if (!config.services.app.ports?.length) throw new Error('Missing owner gate port');
  if (!JSON.stringify(config.services.postgres.command).includes('timezone=Asia/Bangkok')) throw new Error('Missing PostgreSQL timezone');
  if (config.secrets || Object.values(config.services).some((service) => service.secrets)) throw new Error('Secret mounts are no longer supported');
  const env = config.services.app.environment;
  if (!env.OWNER_GATE_PASSWORD || !env.OWNER_GATE_USERNAME || !env.POSTGRES_PASSWORD) throw new Error('Missing secret injection');
  if (config.services.app.build?.args && Object.keys(config.services.app.build.args).some((key) => /TOKEN|PASSWORD|SECRET/i.test(key))) throw new Error('Build secret is forbidden');
  return true;
}

export function verifyRuntime(composeFile, run = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 })) {
  if (!['docker-compose.yml', 'docker-compose.uat.yml', 'docker-compose.prod.yml'].includes(composeFile)) throw new Error('Choose a supported Compose file');
  const compose = ['compose', '-f', composeFile];
  try {
    const config = JSON.parse(run([...compose, 'config', '--format', 'json']));
    verifyCompose(config);
    const app = JSON.parse(run([...compose, 'exec', '-T', 'app', 'node', 'scripts/runtime-launch.mjs', '--check']));
    if (app.timezone !== 'Asia/Bangkok' || app.ownerGate !== 'enabled') throw new Error('Runtime gate or timezone invalid');
    const timezone = run([...compose, 'exec', '-T', 'postgres', 'sh', '-c',
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SHOW timezone"']).trim();
    if (timezone !== 'Asia/Bangkok') throw new Error('Database session timezone invalid');
    return { compose: composeFile, ownerGate: 'enabled', applicationTimezone: app.timezone, postgresSessionTimezone: timezone, hostBindings: 'loopback' };
  } catch { throw new Error('Runtime verification failed; check configuration and service availability without printing secrets'); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyRuntime(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
