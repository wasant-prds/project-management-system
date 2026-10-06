import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve('.');
const setup = readFileSync(join(root, 'infra/certbot/setup-https.sh'), 'utf8');
const common = readFileSync(join(root, 'infra/certbot/lib/common.sh'), 'utf8');
const template = readFileSync(join(root, 'infra/nginx/nginx.conf.template'), 'utf8');
const realip = readFileSync(join(root, 'infra/nginx/cloudflare-real-ip.conf'), 'utf8');
const compose = readFileSync(join(root, 'docker-compose.prod.yml'), 'utf8');
const database = readFileSync(join(root, 'docker-compose.database.yml'), 'utf8');
const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
const prod = readFileSync(join(root, 'scripts/docker-prod.sh'), 'utf8');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    ...options,
  });
}

test('HTTPS env allowlist excludes application secrets and does not rewrite .env', () => {
  const allowlist = common.slice(common.indexOf('case "$key" in'), common.indexOf('*) continue'));
  assert.match(allowlist, /DOMAIN \| EMAIL \| CF_API_TOKEN \| CF_ZONE_ID \| APP_ORIGIN \| APP_ENV \| APP_PORT/);
  assert.doesNotMatch(allowlist, /POSTGRES_PASSWORD|OWNER_GATE_PASSWORD|GITLAB_TOKEN|DATABASE_URL/);
  assert.doesNotMatch(`${setup}\n${common}`, />\s*\.env|>>\s*\.env/);
  assert.match(common, /--keep-until-expiring/);
  assert.match(setup, /renew_main/);
  assert.match(common, /certificate ไม่เปลี่ยน จึงไม่ reload nginx/);
  assert.match(common, /ไม่แก้ \.env/);
});

test('nginx template terminates TLS and forwards owner-gate headers', () => {
  const logFormat = template.slice(template.indexOf('log_format'), template.indexOf('access_log'));
  assert.equal(logFormat.toLowerCase().includes('authorization'), false);
  assert.equal((template.match(/location \/\.well-known\/acme-challenge\//g) || []).length, 2);
  assert.match(template, /ssl_protocols\s+TLSv1\.2 TLSv1\.3/);
  assert.match(template, /Strict-Transport-Security/);
  assert.match(template, /limit_req zone=pms_general burst=40 nodelay/);
  assert.match(template, /rate=10r\/s/);
  assert.equal((template.match(/if \(\$pms_cloudflare_client = 0\) \{\s*return 403;/g) || []).length, 2);
  assert.doesNotMatch(template, /deny all/);
  assert.match(template, /return 301 https:\/\/\$host\$request_uri/);
  assert.match(template, /proxy_set_header Host \$host;/);
  assert.match(template, /proxy_set_header Origin \$http_origin;/);
  assert.match(template, /proxy_set_header Authorization \$http_authorization;/);
  assert.match(template, /proxy_set_header Upgrade \$http_upgrade;/);
  assert.match(template, /proxy_set_header Connection \$connection_upgrade;/);
  assert.match(template, /server app:3000 resolve;/);
});

test('production compose keeps the app on loopback and publishes nginx only in the https profile', () => {
  assert.match(compose, /profiles: \["https"\]/);
  assert.match(compose, /container_name: pms-nginx-prod/);
  assert.match(compose, /"80:80"/);
  assert.match(compose, /"443:443"/);
  assert.match(compose, /127\.0\.0\.1:\$\{APP_PORT:-3000\}:3000/);
  assert.match(database, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5437\}:5432/);
  assert.match(compose, /nginx:1\.28-alpine/);
  assert.match(ignore, /\/infra\/nginx\/certs\/\*/);
  assert.match(ignore, /\/infra\/certbot\/conf\/\*/);
  assert.match(common, /--no-deps/);
  assert.match(common, /require_root/);
  assert.match(common, /renew\s+\\\s+--cert-name "\$CERT_NAME"/);
  assert.match(common, /--cert-name "\$name"/);
  assert.doesNotMatch(common, /crontab/);
  assert.doesNotMatch(common, /CRON_TZ/);
  assert.match(common, /off \| flexible \| full \| strict/);
  assert.match(common, /geo \\\$realip_remote_addr \\\$pms_cloudflare_client/);
  assert.match(common, /curl_args=\(-q /);
  assert.match(common, /-H "@\$\{header_file\}"/);
  assert.doesNotMatch(common, /header = "Authorization/);
  assert.match(common, /cfk_\*/);
  assert.match(realip, /geo \$realip_remote_addr \$pms_cloudflare_client/);
  assert.match(realip, /set_real_ip_from /);
  assert.doesNotMatch(realip, /^\s*(allow|deny)\s/m);
  assert.match(setup, /require_root/);
  assert.match(setup, /restore_original_ssl_mode/);
  assert.match(setup, /relax_ssl_for_issuance/);
  assert.match(setup, /ensure_hostname_strict_rule/);
  assert.match(setup, /remove_hostname_strict_rule/);
  assert.match(setup, /refuse_staging_over_production/);
  assert.match(setup, /delete_staging_lineage/);
  assert.doesNotMatch(setup, /cf_set_ssl_mode/);
  assert.match(prod, /fullchain\.pem/);
  assert.match(prod, /privkey\.pem/);
  assert.match(prod, /compose_up up -d/);
  assert.match(prod, /compose_up --profile backup up -d/);
});

test('allowlist loader ignores other secrets and syncs a certificate only when it changes', () => {
  const script = 'tests/runtime/https-certificate-behavior.sh';
  const host = run('bash', [script], { timeout: 30000 });
  assert.equal(host.status, 0, `${host.stdout || ''}\n${host.stderr || ''}`);
  assert.match(host.stdout, /OK/);
});
