import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.ok(vercelConfig.crons.some((cron) => cron.path === '/api/leirdue/refresh-recent' && cron.schedule === '17 3 * * *'), 'cron config includes daily recent Leirdue refresh route');

const refreshRoute = readFileSync('app/api/leirdue/refresh-recent/route.ts', 'utf8');
assert.match(refreshRoute, /LEIRDUE_REFRESH_SECRET \|\| process\.env\.CRON_SECRET/, 'refresh route remains protected by configured secrets');
assert.match(refreshRoute, /bearer === secret \|\| request\.headers\.get\("x-cron-secret"\) === secret/, 'refresh route accepts only bearer or server header secret');
assert.match(refreshRoute, /Unauthorized\./, 'refresh route rejects unauthorized calls');

const apiRoute = readFileSync('app/api/admin/leirdue/job-health/route.ts', 'utf8');
assert.match(apiRoute, /auth\.getUser\(\)/, 'admin health endpoint requires an authenticated user');
assert.match(apiRoute, /status: 401/, 'admin health endpoint rejects unauthenticated users');
assert.match(apiRoute, /canManageBetaAccess\(profile\)/, 'admin health endpoint uses existing owner/admin access model');
assert.match(apiRoute, /status: 403/, 'admin health endpoint rejects non-admin users');
assert.match(apiRoute, /leirdue_job_health/, 'admin health endpoint reads job health table');
assert.match(apiRoute, /LEIRDUE_RECENT_REFRESH_JOB_NAME/, 'admin health endpoint filters to the recent refresh job');
assert.doesNotMatch(apiRoute, /LEIRDUE_REFRESH_SECRET|CRON_SECRET/, 'admin health endpoint does not expose cron secrets');

writeFileSync('.leirdue-health-test-tsconfig.json', JSON.stringify({
  compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], outDir: '.leirdue-health-test-build', skipLibCheck: true, rootDir: '.', baseUrl: '.', ignoreDeprecations: '6.0', paths: { '@/*': ['./*'] } },
  include: ['lib/leirdue/jobHealth.ts'],
}));
execSync('rm -rf .leirdue-health-test-build && npx tsc -p .leirdue-health-test-tsconfig.json', { stdio: 'inherit' });
const health = await import('../.leirdue-health-test-build/lib/leirdue/jobHealth.js');
const now = new Date('2026-07-12T12:00:00Z');
assert.equal(health.deriveLeirdueHealthState(null, now), 'never_run', 'no health row returns never_run');
assert.equal(health.deriveLeirdueHealthState({ status: 'failed', last_success_at: '2026-07-12T10:00:00Z' }, now), 'failed', 'failed status returns failed');
assert.equal(health.deriveLeirdueHealthState({ status: 'partial', last_success_at: '2026-07-12T10:00:00Z' }, now), 'degraded', 'partial status returns degraded');
assert.equal(health.deriveLeirdueHealthState({ status: 'success', last_success_at: '2026-07-10T23:00:00Z' }, now), 'stale', 'old last_success_at returns stale');
assert.equal(health.deriveLeirdueHealthState({ status: 'success', last_success_at: '2026-07-12T10:00:00Z' }, now), 'healthy', 'recent success returns healthy');

const uiPage = readFileSync('app/admin/leirdue-health/page.tsx', 'utf8');
assert.match(uiPage, /Leirdue refresh health/, 'admin UI renders the health page');
assert.match(uiPage, /Leirdue cache refresh needs attention/, 'admin UI renders failed/stale/degraded alert copy');
assert.match(uiPage, /Leirdue cache refresh is running as expected/, 'admin UI renders healthy state copy');
assert.match(uiPage, /last successful refresh/i, 'admin UI renders last success');
assert.match(uiPage, /last attempted refresh/i, 'admin UI renders last attempt');
assert.match(uiPage, /failure_reason|Failure reason/, 'admin UI renders failure reason');

const header = readFileSync('app/components/AuthHeader.tsx', 'utf8');
assert.match(header, /showBetaAdmin && <Link role="menuitem" href="\/admin\/leirdue-health"/, 'admin navigation links health only for admins');
assert.equal((header.match(/Leirdue health/g) || []).length, 1, 'normal users cannot see admin alert/status link outside admin gate');

rmSync('.leirdue-health-test-build', { recursive: true, force: true });
rmSync('.leirdue-health-test-tsconfig.json', { force: true });
console.log('Leirdue health tests passed');
