import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('app/api/admin/users/[id]/route.ts', 'utf8');
const page = readFileSync('app/admin/users/page.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

assert.match(route, /if \(!token\).*status: 401/, 'detail endpoint requires a bearer token');
assert.match(route, /client\.auth\.getUser\(token\)/, 'detail endpoint verifies the JWT');
assert.match(route, /canManageBetaAccess\(actor\).*status: 403/, 'detail endpoint rejects non-admin accounts');
assert(route.indexOf('canManageBetaAccess(actor)') < route.indexOf('createClient(url, serviceKey'), 'service role is initialized only after admin authorization');
assert.match(route, /Cache-Control": "private, no-store"/, 'detail responses are not cached');
assert.match(route, /private_session_notes".*"user_id"/, 'private notes are only counted');
assert.doesNotMatch(route, /select\([^\n]*body|select\([^\n]*metadata|select\([^\n]*user_agent/, 'private contents and analytics metadata are not fetched');
assert.match(route, /feature_usage_events.*event_type", "used".*"ai\.%"/, 'AI usage counts only successful AI feature events');
assert.match(route, /events30Days:.*events30\.count/, 'app usage reports a 30-day event count');

const collapsed = page.slice(page.indexOf('{users.map((user) =>'), page.indexOf('</article>)}'));
assert.match(collapsed, /adminUserNameButton.*aria-expanded/, 'names are accessible expand/collapse buttons');
assert.doesNotMatch(collapsed, /user\.email|user\.access_status.*badge|Joined \{/, 'collapsed row shows no email, status badge, or date');
assert.match(page, /expandedId === user\.user_id && <UserDetailPanel/, 'details render only for the open user');
assert.match(page, /Profile country \(self-reported\)/, 'country is not misrepresented as verified nationality');
assert.match(page, /Private notes \(count only\)/, 'private notes remain count-only');
assert.match(page, /These are saved records and logged events, not time spent/, 'usage definition is explicit');
assert.match(css, /adminUserNameButton.*min-height: 48px/, 'name is a touch-sized target');

console.log('admin user detail focused checks passed');
