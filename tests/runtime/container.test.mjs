import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const docker = (args) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Isolated app container verification failed (diagnostics withheld)'); }
};

test('production image enforces owner gate and excludes secrets from client, responses, logs and image files',
  { skip: process.env.PMS_RUN_CONTAINER_TESTS !== '1', timeout: 60000 }, async () => {
    const image = process.env.PMS_RUNTIME_TEST_IMAGE || 'pms-issue15-validation';
    const name = `pms-issue15-app-test-${process.pid}-${Date.now()}`;
    const databaseName = `${name}-db`;
    const folder = await mkdtemp(join(tmpdir(), 'pms-app-secrets-'));
    const token = 'synthetic-container-gitlab-token'; const password = 'synthetic-container-owner-password-more-than-32';
    try {
      await writeFile(join(folder, '.env'), `APP_ENV=prod\nAPP_ORIGIN=http://localhost:3000\nRUNTIME_DOCKER=true\nPOSTGRES_HOST=127.0.0.1\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=synthetic\nPOSTGRES_DB=postgres\nOWNER_GATE_USERNAME=owner\nOWNER_GATE_PASSWORD=${password}\nGITLAB_TOKEN=${token}\nGITLAB_BASE_URL=https://gitlab.example.test\n`);
      assert.equal(docker(['image', 'inspect', image, '--format', '{{.Config.User}}']).trim(), 'nextjs');
      const start = (network) => docker(['run', '--rm', '-d', '--name', name, '--network', network, '--env-file', join(folder, '.env'), image]);
      start('none');
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try { docker(['exec', name, 'node', '-e', "const fs=require('fs');const auth='Basic '+Buffer.from(process.env.OWNER_GATE_USERNAME+':'+process.env.OWNER_GATE_PASSWORD).toString('base64');fetch('http://127.0.0.1:3000/',{headers:{authorization:auth}}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"]); ready = true; break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
      }
      assert.ok(ready);
      const code = `const fs=require('fs');const assert=require('assert/strict');const user=process.env.OWNER_GATE_USERNAME;const pass=process.env.OWNER_GATE_PASSWORD;const token=process.env.GITLAB_TOKEN;const headers={authorization:'Basic '+Buffer.from(user+':'+pass).toString('base64')};const inspect=p=>{for(const f of fs.readdirSync(p,{withFileTypes:true})){const n=p+'/'+f.name;if(f.isDirectory())inspect(n);else if(f.name.endsWith('.js')){const c=fs.readFileSync(n,'utf8');assert(!c.includes(token));assert(!c.includes(pass));}}};(async()=>{assert(!fs.existsSync('/app/.env'));assert(!fs.existsSync('/app/secrets'));const r=await fetch('http://127.0.0.1:3000/',{headers});assert.equal(r.status,200);const html=await r.text();assert(!html.includes(token));assert(!html.includes(pass));assert.equal((await fetch('http://127.0.0.1:3000/api/users')).status,401);const h=await fetch('http://127.0.0.1:3000/api/health');assert.equal(h.status,503);const body=await h.json();assert.equal(body.error,undefined);assert(body.timestamp.endsWith('+07:00'));inspect('/app/.next/static');console.log('Production runtime verified')})().catch(()=>process.exit(1));`;
      assert.match(docker(['exec', name, 'node', '-e', code]), /Production runtime verified/);
      const logs = docker(['logs', name]); assert.ok(!logs.includes(token)); assert.ok(!logs.includes(password)); assert.ok(!logs.includes('postgresql://'));
      // Positive health must also exercise Prisma in the actual production image.
      docker(['rm', '-f', name]);
      docker(['run', '--rm', '-d', '--name', databaseName, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok']);
      let databaseReady = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const timezone = docker(['exec', databaseName, 'psql', '-U', 'postgres', '-Atc', 'SHOW timezone']).trim();
          if (timezone === 'Asia/Bangkok') { databaseReady = true; break; }
        }
        catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
        if (!databaseReady) await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.ok(databaseReady);
      start(`container:${databaseName}`);
      let appReady = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try { docker(['exec', name, 'node', '-e', "const fs=require('fs');const auth='Basic '+Buffer.from(process.env.OWNER_GATE_USERNAME+':'+process.env.OWNER_GATE_PASSWORD).toString('base64');fetch('http://127.0.0.1:3000/',{headers:{authorization:auth}}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"]); appReady = true; break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
      }
      assert.ok(appReady);
      assert.match(docker(['exec', name, 'node', '-e', code.replace('assert.equal(h.status,503)', 'assert.equal(h.status,200)')]), /Production runtime verified/);
    } finally {
      try { docker(['rm', '-f', name]); } catch {}
      try { docker(['rm', '-f', databaseName]); } catch {}
      await rm(folder, { recursive: true, force: true });
    }
  });
