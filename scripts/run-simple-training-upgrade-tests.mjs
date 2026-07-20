import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260720090000_upgrade_simple_training_logs.sql', 'utf8');
const form = readFileSync('app/simple-training-logs/SimpleTrainingLogForm.tsx', 'utf8');
const editPage = readFileSync('app/simple-training-logs/[id]/edit/page.tsx', 'utf8');
const statsPage = readFileSync('app/stats/page.tsx', 'utf8');
const dashboardPage = readFileSync('app/dashboard/page.tsx', 'utf8');

assert.match(migration, /add column if not exists upgraded_session_id uuid references public\.sessions\(id\)/, 'training_logs stores an upgrade link to the detailed session');
assert.match(migration, /for update;/, 'conversion locks the source row for idempotent retries');
assert.match(migration, /if v_log\.upgraded_session_id is not null then\s+return v_log\.upgraded_session_id;/, 'conversion returns the existing detailed session when retried');
assert.match(migration, /insert into public\.sessions[\s\S]*session_type[\s\S]*'Training'/, 'conversion creates an existing detailed Training session');
assert.match(migration, /total_targets[\s\S]*v_log\.targets_fired/, 'targets fired map to session total_targets');
assert.match(migration, /own_score[\s\S]*v_log\.hits/, 'hits map directly and null stays null');
assert.match(migration, /competition_date[\s\S]*v_log\.date/, 'date maps to the detailed session date field');
assert.match(migration, /shooting_ground[\s\S]*v_log\.location/, 'location maps to shooting_ground');
assert.match(migration, /equipment_weapon_id[\s\S]*equipment_ammunition_profile_id[\s\S]*equipment_snapshot[\s\S]*v_log\.equipment_weapon_id[\s\S]*v_log\.equipment_ammunition_profile_id[\s\S]*v_log\.equipment_snapshot/, 'equipment references and immutable snapshot are preserved');
assert.doesNotMatch(migration, /session_courses|session_post_targets|misses/, 'conversion does not fabricate post, target, or miss detail structure');
assert.match(migration, /set upgraded_session_id = v_session_id,[\s\S]*upgraded_at = now\(\)/, 'source log is retained and clearly marked as upgraded only after insert succeeds');

assert.match(form, /upgrade_simple_training_log/, 'edit form calls the atomic upgrade RPC');
assert.match(form, /Add detailed training data/, 'edit form exposes a real upgrade action');
assert.match(form, /Save changes/, 'normal simple-log editing remains available');
assert.match(editPage, /upgraded_session_id[\s\S]*router\.replace\(`\/sessions\/\$\{data\.upgraded_session_id\}`\)/, 'old simple edit route redirects upgraded logs to the detailed session');

assert.match(statsPage, /\.eq\("source_type", "simple_training"\)\s+\.is\("upgraded_session_id", null\)/, 'Performance queries exclude upgraded simple logs');
assert.match(dashboardPage, /\.eq\("source_type", "simple_training"\)\s+\.is\("upgraded_session_id", null\)/, 'Dashboard simple-log list excludes upgraded simple logs');
assert.match(statsPage, /session\.session_type === "Training"[\s\S]*dataType: "training"/, 'detailed Training sessions contribute to Performance as training data');

console.log('simple training upgrade regression tests passed');
