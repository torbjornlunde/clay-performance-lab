import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.ok(vercelConfig.crons.some((cron) => cron.path === '/api/leirdue/refresh-recent' && cron.schedule === '17 3 * * *'), 'cron config includes daily recent Leirdue refresh route');

const refreshRoute = readFileSync('app/api/leirdue/refresh-recent/route.ts', 'utf8');
assert.match(refreshRoute, /isAuthorizedLeirdueRefreshRequest\(request\)/, 'refresh route delegates to the shared allowlist auth helper');
assert.match(refreshRoute, /Unauthorized\./, 'refresh route rejects unauthorized calls');

const apiRoute = readFileSync('app/api/admin/leirdue/job-health/route.ts', 'utf8');
assert.match(apiRoute, /auth\.getUser\(\)/, 'admin health endpoint requires an authenticated user');
assert.match(apiRoute, /status: 401/, 'admin health endpoint rejects unauthenticated users');
assert.match(apiRoute, /canManageBetaAccess\(profile\)/, 'admin health endpoint uses existing owner/admin access model');
assert.match(apiRoute, /status: 403/, 'admin health endpoint rejects non-admin users');
assert.match(apiRoute, /leirdue_job_health/, 'admin health endpoint reads job health table');
assert.match(apiRoute, /last_alert_email_status/, 'admin health endpoint reads alert email metadata');
assert.match(apiRoute, /leirdueAlertEmailConfigStatus/, 'admin health endpoint returns safe email alert configuration status');
assert.match(apiRoute, /LEIRDUE_RECENT_REFRESH_JOB_NAME/, 'admin health endpoint filters to the recent refresh job');
assert.doesNotMatch(apiRoute, /LEIRDUE_REFRESH_SECRET|CRON_SECRET/, 'admin health endpoint does not expose cron secrets');

writeFileSync('.leirdue-health-test-tsconfig.json', JSON.stringify({
  compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], outDir: '.leirdue-health-test-build', skipLibCheck: true, rootDir: '.', baseUrl: '.', ignoreDeprecations: '6.0', types: ['node'], paths: { '@/*': ['./*'] } },
  include: ['lib/leirdue/jobHealth.ts', 'lib/leirdue/refreshAuth.ts', 'lib/leirdue/adminEmailAlerts.ts'],
}));
execSync('rm -rf .leirdue-health-test-build && npx tsc -p .leirdue-health-test-tsconfig.json', { stdio: 'inherit' });
const health = await import('../.leirdue-health-test-build/lib/leirdue/jobHealth.js');
const refreshAuth = await import('../.leirdue-health-test-build/lib/leirdue/refreshAuth.js');
const emailAlerts = await import('../.leirdue-health-test-build/lib/leirdue/adminEmailAlerts.js');
const bothSecrets = refreshAuth.configuredLeirdueRefreshSecrets({ LEIRDUE_REFRESH_SECRET: 'manual-secret', CRON_SECRET: 'vercel-cron-secret' });
assert.deepEqual(bothSecrets, ['manual-secret', 'vercel-cron-secret'], 'refresh auth allowlist keeps both configured secrets');
assert.equal(refreshAuth.isAuthorizedLeirdueRefreshRequest(new Request('https://example.test/api/leirdue/refresh-recent', { headers: { Authorization: 'Bearer vercel-cron-secret' } }), bothSecrets), true, 'Vercel CRON_SECRET bearer passes when LEIRDUE_REFRESH_SECRET is also configured');
assert.equal(refreshAuth.isAuthorizedLeirdueRefreshRequest(new Request('https://example.test/api/leirdue/refresh-recent', { headers: { Authorization: 'Bearer wrong-secret' } }), bothSecrets), false, 'wrong bearer still fails');
assert.equal(refreshAuth.isAuthorizedLeirdueRefreshRequest(new Request('https://example.test/api/leirdue/refresh-recent', { headers: { 'x-cron-secret': 'manual-secret' } }), bothSecrets), true, 'server-side x-cron-secret can use any configured secret');
const now = new Date('2026-07-12T12:00:00Z');
assert.equal(health.deriveLeirdueHealthState(null, now), 'never_run', 'no health row returns never_run');
assert.equal(health.deriveLeirdueHealthState({ status: 'failed', last_success_at: '2026-07-12T10:00:00Z' }, now), 'failed', 'failed status returns failed');
assert.equal(health.deriveLeirdueHealthState({ status: 'partial', last_success_at: '2026-07-12T10:00:00Z' }, now), 'degraded', 'partial status returns degraded');
assert.equal(health.deriveLeirdueHealthState({ status: 'success', last_success_at: '2026-07-10T23:00:00Z' }, now), 'stale', 'old last_success_at returns stale');
assert.equal(health.deriveLeirdueHealthState({ status: 'success', last_success_at: '2026-07-12T10:00:00Z' }, now), 'healthy', 'recent success returns healthy');

const baseHealthRow = { job_name: 'leirdue_refresh_recent', started_at: '2026-07-12T11:00:00Z', finished_at: '2026-07-12T11:01:00Z', status: 'failed', refreshed_count: 0, error_count: 1, last_success_at: '2026-07-11T11:00:00Z', failure_reason: 'HTTP 500', affected_scope: { year: 2026, recentWindowDays: 14, cutoff: '2026-06-28' }, updated_at: '2026-07-12T11:01:00Z', last_alert_email_sent_at: null, last_alert_email_status: null, last_alert_email_error: null, last_alert_incident_key: null, last_recovery_email_sent_at: null };
const configuredEmailEnv = { RESEND_API_KEY: 'server-only-resend-key', ADMIN_ALERT_EMAIL_TO: 'admin@example.test', ADMIN_ALERT_EMAIL_FROM: 'alerts@example.test', NEXT_PUBLIC_SITE_URL: 'https://clay.example.test' };
let sentRequests = [];
const okFetch = async (url, init) => { sentRequests.push({ url, init }); return new Response('{}', { status: 200 }); };
let failedAlert = await emailAlerts.maybeSendLeirdueHealthEmailAlert({ current: baseHealthRow, previous: null, now, env: configuredEmailEnv, fetchImpl: okFetch });
assert.equal(failedAlert.status, 'sent', 'failed refresh sends an admin email');
assert.equal(sentRequests.length, 1, 'failed refresh makes one Resend request');
assert.match(JSON.parse(sentRequests[0].init.body).text, /Job name: leirdue_refresh_recent[\s\S]*Status: failed[\s\S]*Failure reason: HTTP 500[\s\S]*Affected scope:.*2026[\s\S]*Admin health page: https:\/\/clay\.example\.test\/admin\/leirdue-health/, 'email body includes job, status, failure, affected scope, and admin path');
assert.match(sentRequests[0].init.headers.Authorization, /^Bearer server-only-resend-key$/, 'server-side email helper uses provider key only in server request header');
sentRequests = [];
const partialRow = { ...baseHealthRow, status: 'partial', refreshed_count: 12, error_count: 2, failure_reason: 'Some lists failed' };
let partialAlert = await emailAlerts.maybeSendLeirdueHealthEmailAlert({ current: partialRow, previous: null, now, env: configuredEmailEnv, fetchImpl: okFetch });
assert.equal(partialAlert.status, 'sent', 'partial/degraded refresh sends an admin email');
assert.match(JSON.parse(sentRequests[0].init.body).subject, /degraded/, 'partial alert subject says degraded');
sentRequests = [];
const previousIncident = { ...baseHealthRow, last_alert_incident_key: emailAlerts.leirdueIncidentKey(baseHealthRow), last_alert_email_sent_at: '2026-07-12T10:30:00Z' };
let rateLimited = await emailAlerts.maybeSendLeirdueHealthEmailAlert({ current: baseHealthRow, previous: previousIncident, now, env: configuredEmailEnv, fetchImpl: okFetch });
assert.equal(rateLimited.status, 'skipped_rate_limited', 'same incident within rate limit does not send repeated email');
assert.equal(sentRequests.length, 0, 'rate-limited incident does not call Resend');
const changedIncident = { ...baseHealthRow, failure_reason: 'HTTP 503' };
let changedAlert = await emailAlerts.maybeSendLeirdueHealthEmailAlert({ current: changedIncident, previous: previousIncident, now, env: configuredEmailEnv, fetchImpl: okFetch });
assert.equal(changedAlert.status, 'sent', 'changed incident key can send a new email');
const recoveryRow = { ...baseHealthRow, status: 'success', refreshed_count: 42, error_count: 0, failure_reason: null, last_success_at: '2026-07-12T12:00:00Z' };
let recoveryAlert = await emailAlerts.maybeSendLeirdueHealthEmailAlert({ current: recoveryRow, previous: baseHealthRow, now, env: configuredEmailEnv, fetchImpl: okFetch });
assert.equal(recoveryAlert.status, 'sent', 'successful refresh after failed state sends a recovery email');
const unconfiguredAlert = await emailAlerts.maybeSendLeirdueHealthEmailAlert({ current: baseHealthRow, previous: null, now, env: {}, fetchImpl: okFetch });
assert.equal(unconfiguredAlert.status, 'skipped_not_configured', 'missing email env vars does not fail refresh and records skipped/not configured status');


const uiPage = readFileSync('app/admin/leirdue-health/page.tsx', 'utf8');
assert.match(uiPage, /Leirdue refresh health/, 'admin UI renders the health page');
assert.match(uiPage, /Leirdue cache refresh needs attention/, 'admin UI renders failed/stale/degraded alert copy');
assert.match(uiPage, /Leirdue cache refresh is running as expected/, 'admin UI renders healthy state copy');
assert.match(uiPage, /last successful refresh/i, 'admin UI renders last success');
assert.match(uiPage, /last attempted refresh/i, 'admin UI renders last attempt');
assert.match(uiPage, /button secondary buttonLike/, 'cache admin link uses existing secondary button styling');
assert.match(uiPage, /leirdueHealthPage/, 'admin UI uses scoped health page theme styles');
assert.match(uiPage, /failure_reason|Failure reason/, 'admin UI renders failure reason');
assert.match(uiPage, /Last alert email status/, 'admin health page shows last alert email status');
assert.match(uiPage, /Email alerts not configured/, 'admin health page shows email alerts not configured');

const header = readFileSync('app/components/AuthHeader.tsx', 'utf8');
assert.match(header, /showBetaAdmin && <Link role="menuitem" href="\/admin\/leirdue-health"/, 'admin navigation links health only for admins');
assert.equal((header.match(/Leirdue health/g) || []).length, 1, 'normal users cannot see admin alert/status link outside admin gate');

rmSync('.leirdue-health-test-build', { recursive: true, force: true });
rmSync('.leirdue-health-test-tsconfig.json', { force: true });
console.log('Leirdue health tests passed');
