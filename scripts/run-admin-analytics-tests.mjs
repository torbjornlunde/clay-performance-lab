import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const migration = readFileSync('supabase/migrations/20260712150000_admin_analytics_events.sql', 'utf8');
assert.match(migration, /create table if not exists public\.analytics_events/i, 'migration creates analytics_events');
for (const column of ['user_id uuid null references auth.users(id) on delete set null','event_name text not null','occurred_at timestamptz not null default now()','metadata jsonb not null default']) assert.match(migration, new RegExp(column.replace(/[().]/g, '\\$&'), 'i'), `migration includes ${column}`);
for (const index of ['occurred_at desc','event_name','user_id','feature']) assert.match(migration, new RegExp(index, 'i'), `migration indexes ${index}`);
assert.match(migration, /enable row level security/i, 'RLS enabled');
assert.match(migration, /analytics_events_insert_own[\s\S]*auth\.uid\(\) = user_id/i, 'own insert policy exists');
assert.match(migration, /analytics_events_admin_select[\s\S]*public\.is_access_admin\(\)/i, 'admin read policy uses existing access model');
assert.match(migration, /revoke all on public\.analytics_events from anon/i, 'no public access');

const route = readFileSync('app/api/admin/analytics/summary/route.ts', 'utf8');
assert.match(route, /status: 401/, 'summary rejects unauthenticated requests');
assert.match(route, /status: 403/, 'summary rejects normal users');
assert.match(route, /canManageBetaAccess\(profile\)/, 'summary uses existing admin/owner access helper');
assert.match(route, /select\("user_id,event_name,occurred_at,feature"\)/, 'summary selects aggregate-safe columns only');
assert.doesNotMatch(route, /metadata|route,discipline|email|user_agent|ip/i, 'summary does not return raw private metadata');

const ui = readFileSync('app/admin/analytics/page.tsx', 'utf8');
for (const text of ['Active users 7d','Active users 30d','Events 7d','Errors 7d','Top features','Top events','Leirdue import funnel','Scorecard funnel','Training score sheet usage','Events by day']) assert.match(ui, new RegExp(text), `admin UI contains ${text}`);
const nav = readFileSync('app/components/AuthHeader.tsx', 'utf8');
assert.match(nav, /showBetaAdmin && <Link role="menuitem" href="\/admin\/analytics"/, 'admin nav link is admin-only');
const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /adminAnalyticsPage|analyticsMetricGrid|overflow-wrap: anywhere/, 'analytics styles are responsive and theme-token based');

execSync('rm -rf .analytics-test-build && npx tsc lib/analytics.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .analytics-test-build --skipLibCheck', { stdio: 'inherit' });
const analytics = await import('../.analytics-test-build/analytics.js');
for (const eventName of ['onboarding_opened','onboarding_dismissed','contextual_help_dismissed']) assert(analytics.ANALYTICS_EVENTS.includes(eventName), `${eventName} is allowlisted`);

const dirty = analytics.sanitizeAnalyticsMetadata({
  year: 2026,
  email: 'person@example.com',
  rawUserAgent: 'Mozilla',
  ipAddress: '127.0.0.1',
  privateNote: 'secret',
  shooterName: 'Jane Doe',
  sourceUrl: 'https://example.com/?x=1',
  image: 'blob',
  errorCategory: 'safe',
});
assert.deepEqual(dirty, { year: 2026, errorCategory: 'safe' }, 'metadata allowlist removes private notes, raw names, email, IP, user agent, images, and URLs');
assert.equal(analytics.analyticsRoute('/sessions/1?token=secret'), '/sessions/1', 'route strips query strings');
assert.deepEqual(analytics.sanitizeAnalyticsMetadata({ feature: 'getting_started', shooterName: 'Private Person', sourceUrl: 'https://example.com' }), { feature: 'getting_started' }, 'onboarding analytics metadata stays privacy-safe');
let inserted = false;
await analytics.recordAnalyticsEvent({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => ({ insert: async () => { inserted = true; throw new Error('db down'); } }) }, 'app_page_view', { metadata: { email: 'x@y.com' } });
assert.equal(inserted, true, 'recordAnalyticsEvent attempts insert');
console.log('admin analytics focused tests passed');
