
export const TIMEZONE = 'Asia/Bangkok';
const sensitive = ['OWNER_GATE_USERNAME', 'OWNER_GATE_PASSWORD', 'GITLAB_TOKEN', 'NEXTAUTH_SECRET', 'DATABASE_URL'];
const invalid = (value) => !value || /^(\?+|<.*>|replace.*|change.*|dev-secret.*)$/i.test(value);

// Only the launcher imports this module. It must never be imported by React.
export function loadRuntimeConfig(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(TOKEN|SECRET|PASSWORD|DATABASE|GITLAB|OWNER_GATE)/i.test(key)) {
      throw new Error('Public credential configuration is forbidden');
    }
  }
  for (const key of sensitive) {
    if (env[`${key}_FILE`]) throw new Error('Secret files are no longer supported; configure root .env');
  }
  if (!['local', 'dev', 'uat', 'prod'].includes(env.APP_ENV)) throw new Error('Invalid APP_ENV');
  if (env.TZ && env.TZ !== TIMEZONE) throw new Error('TZ must be Asia/Bangkok');
  env.TZ = TIMEZONE;
  if (invalid(env.OWNER_GATE_USERNAME) || /[:\s]/.test(env.OWNER_GATE_USERNAME)) throw new Error('Invalid owner gate username');
  if (invalid(env.OWNER_GATE_PASSWORD) || env.OWNER_GATE_PASSWORD.length < 32 || /[\r\n]/.test(env.OWNER_GATE_PASSWORD)) throw new Error('Owner gate password must contain at least 32 characters');
  let origin;
  try { origin = new URL(env.APP_ORIGIN); } catch { throw new Error('Invalid APP_ORIGIN'); }
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
    throw new Error('APP_ORIGIN requires HTTPS or loopback HTTP');
  }
  env.APP_ORIGIN = origin.origin;
  if (Boolean(env.GITLAB_BASE_URL) !== Boolean(env.GITLAB_TOKEN)) throw new Error('GitLab URL and token must be configured together');
  if (env.GITLAB_BASE_URL) {
    let url;
    try { url = new URL(env.GITLAB_BASE_URL); } catch { throw new Error('Invalid GitLab base URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || invalid(env.GITLAB_TOKEN) || /[\r\n]/.test(env.GITLAB_TOKEN)) throw new Error('Invalid GitLab server configuration');
    env.GITLAB_BASE_URL = url.href.replace(/\/$/, '');
  }
  // libpq (operations) and Prisma (application) must both set session timezone.
  env.PGTZ = TIMEZONE;
  env.PGOPTIONS = '-c timezone=Asia/Bangkok';
  if (env.DATABASE_URL) {
    let url;
    try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid database configuration'); }
    if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('Invalid database configuration');
    url.searchParams.set('options', '--timezone=Asia/Bangkok');
    env.DATABASE_URL = url.href;
  }
  return env;
}

export function safeRuntimeSummary(env) {
  return { environment: env.APP_ENV, timezone: env.TZ, databaseSessionTimezone: env.PGTZ,
    ownerGate: 'enabled', gitlab: env.GITLAB_TOKEN ? 'configured' : 'disabled', nextBinding: 'loopback' };
}
