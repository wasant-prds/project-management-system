import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve('.');
const enabled = process.env.PMS_RUN_HTTPS_DOCKER_TESTS === '1';

function dockerPath(value) {
  const normalized = resolve(value).replace(/\\/g, '/');
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) return normalized;
  return `/${match[1].toLowerCase()}/${match[2]}`;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    ...options,
  });
}

test('rendered nginx config passes nginx -t', { skip: !enabled }, () => {
  const certDir = join(tmpdir(), `pms-nginx-test-${process.pid}`);
  rmSync(certDir, { recursive: true, force: true });
  mkdirSync(certDir, { recursive: true });
  try {
    const issued = run('docker', [
      'run', '--rm', '--entrypoint', 'openssl',
      '-v', `${dockerPath(certDir)}:/certs`,
      'alpine/openssl:latest',
      'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1',
      '-keyout', '/certs/privkey.pem',
      '-out', '/certs/fullchain.pem',
      '-subj', '/CN=pms.example.com',
      '-addext', 'subjectAltName=DNS:pms.example.com',
    ]);
    assert.equal(issued.status, 0, issued.stderr);

    const rendered = run('docker', [
      'run', '--rm', '--entrypoint', 'sh',
      '-e', 'DOMAIN=pms.example.com',
      '-v', `${dockerPath(join(root, 'infra/nginx/nginx.conf.template'))}:/etc/nginx/nginx.conf.template:ro`,
      '-v', `${dockerPath(join(root, 'infra/nginx/cloudflare-real-ip.conf'))}:/etc/nginx/cloudflare-real-ip.conf:ro`,
      'nginx:1.28-alpine',
      '-c', "envsubst '$DOMAIN' < /etc/nginx/nginx.conf.template",
    ]);
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.match(rendered.stdout, /server_name pms\.example\.com;/);
    assert.match(rendered.stdout, /\$host\$request_uri/);
    assert.match(rendered.stdout, /\$http_authorization/);
    assert.match(rendered.stdout, /return 403/);
    assert.doesNotMatch(rendered.stdout, /\$\{DOMAIN\}/);

    const checked = run('docker', [
      'run', '--rm', '--entrypoint', 'sh',
      '-e', 'DOMAIN=pms.example.com',
      '-v', `${dockerPath(join(root, 'infra/nginx/nginx.conf.template'))}:/etc/nginx/nginx.conf.template:ro`,
      '-v', `${dockerPath(join(root, 'infra/nginx/cloudflare-real-ip.conf'))}:/etc/nginx/cloudflare-real-ip.conf:ro`,
      '-v', `${dockerPath(certDir)}:/etc/nginx/certs:ro`,
      'nginx:1.28-alpine',
      '-c', "envsubst '$DOMAIN' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -t",
    ]);
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    assert.match(`${checked.stdout}\n${checked.stderr}`, /syntax is ok/);
  } finally {
    rmSync(certDir, { recursive: true, force: true });
  }
});
