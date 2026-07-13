import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260713090000_private_session_notes.sql', 'utf8');
assert.match(migration, /create table if not exists public\.private_session_notes/i, 'migration creates private_session_notes');
assert.match(migration, /alter table public\.private_session_notes enable row level security/i, 'RLS is enabled');
for (const action of ['select','insert','update','delete']) {
  assert.match(migration, new RegExp(`private_session_notes_${action}_own[\\s\\S]*(auth\\.uid\\(\\) = user_id|auth\\.uid\\(\\) = user_id)`, 'i'), `${action} own-user policy exists`);
}
assert.match(migration, /note_scope in \('session', 'post'\)/i, 'note scope check exists');
assert.match(migration, /note_scope = 'session' and post_number is null/i, 'session notes require null post_number');
assert.match(migration, /note_scope = 'post' and post_number is not null and post_number > 0/i, 'post notes require positive post_number');
assert.match(migration, /unique nulls not distinct \(user_id, session_id, note_scope, post_number\)/i, 'unique note per user/session/scope/post exists');
assert.match(migration, /revoke all on public\.private_session_notes from anon/i, 'no public anon access');

const page = readFileSync('app/sessions/[id]/page.tsx', 'utf8');
assert.match(page, /Private notes/, 'UI contains Private notes section');
assert.match(page, /Only you can see these notes\./, 'UI says notes are private');
assert.match(page, /Save session note/, 'session-level note save exists');
assert.match(page, /Optional per-post notes/, 'per-post notes are optional/collapsible');
assert.match(page, /from\("private_session_notes"\)/, 'UI uses private notes table instead of sessions.notes');
for (const eventName of ['private_note_saved_local','private_note_sync_succeeded','private_note_sync_failed']) {
  const start = page.indexOf(`recordAnalyticsEvent(supabase, "${eventName}"`);
  assert.notEqual(start, -1, `${eventName} analytics call exists`);
  const call = page.slice(start, page.indexOf('});', start) + 3);
  assert.doesNotMatch(call, /noteDrafts|\bbody\b(?!\.trim)|text|noteText/i, 'analytics calls do not include note text');
}
assert.match(page, /privateNoteDraftKey\(userId: string, sessionId: string/, 'local storage key includes userId and sessionId');
assert.match(page, /private-notes:draft:\$\{userId\}:\$\{sessionId\}:\$\{scope\}/, 'draft key is scoped by user and session');
assert.match(page, /private-notes:pending:\$\{userId\}:\$\{sessionId\}:\$\{scope\}/, 'pending key is scoped by user and session');
assert.match(page, /window\.localStorage\.setItem\(privateNoteDraftKey\(currentUserId, session\.id, scope, postNumber\), body\)/, 'session and post note drafts persist locally');
assert.match(page, /Saved locally · pending sync/, 'offline save shows pending sync status');
assert.match(page, /Delete pending sync/, 'offline delete shows pending delete status');
assert.match(page, /removePendingPrivateNote\(pending\.userId, pending\.sessionId, pending\.scope, pending\.postNumber\)/, 'online sync removes pending entry after success');
assert.match(page, /pending\?\.action === \"upsert\"[\s\S]*drafts\[key\] = pending\.body/, 'pending local edit wins over server load');
assert.match(page, /pendingAction: item\.action|pendingAction: \"upsert\"/, 'analytics records only privacy-safe pending action');

const analytics = readFileSync('lib/analytics.ts', 'utf8');
for (const eventName of ['private_note_saved_local','private_note_sync_succeeded','private_note_sync_failed']) assert.match(analytics, new RegExp(`"${eventName}"`), `${eventName} is allowlisted`);
assert.match(analytics, /"hasBody"/, 'hasBody privacy-safe metadata key is allowlisted');
assert.match(analytics, /"scope"/, 'scope privacy-safe metadata key is allowlisted');
assert.match(analytics, /"pendingAction"/, 'pendingAction privacy-safe metadata key is allowlisted');
assert.match(analytics, /PRIVATE_KEY_PATTERN = .*note.*comment/i, 'analytics sanitizer blocks note/comment keys');

const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /privateNotesCard[\s\S]*textarea/, 'private notes textarea styles exist for theme regression coverage');
assert.match(css, /privateNoteSyncStatus[\s\S]*color: var\(--muted\)/, 'private note sync status uses theme tokens');

console.log('private session notes focused tests passed');
