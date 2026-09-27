import { fileURLToPath } from 'node:url';

export function databaseUrl(env = process.env) {
  const secret = (name) => {
    const value = env[name];
    if (!value || /[\r\n\x00]/.test(value)) throw new Error('Invalid PostgreSQL secret');
    return encodeURIComponent(value);
  };
  const host = env.POSTGRES_HOST || 'postgres';
  const port = env.POSTGRES_PORT || '5432';
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !/^\d+$/.test(port)) throw new Error('Invalid PostgreSQL endpoint');
  return `postgresql://${secret('POSTGRES_USER')}:${secret('POSTGRES_PASSWORD')}@${host}:${port}/${secret('POSTGRES_DB')}?schema=public&connection_limit=5&pool_timeout=20&options=--timezone%3DAsia%2FBangkok`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(databaseUrl()); }
  catch { console.error('PostgreSQL secret configuration unavailable'); process.exitCode = 1; }
}
