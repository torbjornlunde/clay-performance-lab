import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const initialMigration = readFileSync('supabase/migrations/20260720090000_upgrade_simple_training_logs.sql', 'utf8');
const reviewMigration = readFileSync('supabase/migrations/20260720093000_fix_simple_training_upgrade_review.sql', 'utf8');
const migrations = `${initialMigration}\n${reviewMigration}`;
const form = readFileSync('app/simple-training-logs/SimpleTrainingLogForm.tsx', 'utf8');
const editPage = readFileSync('app/simple-training-logs/[id]/edit/page.tsx', 'utf8');
const statsPage = readFileSync('app/stats/page.tsx', 'utf8');
const dashboardPage = readFileSync('app/dashboard/page.tsx', 'utf8');

assert.match(initialMigration, /add column if not exists upgraded_session_id uuid references public\.sessions\(id\)/, 'training_logs stores an upgrade link to the detailed session');
assert.match(migrations, /for update;/, 'conversion locks the source row for idempotent retries');
assert.match(migrations, /if v_log\.upgraded_session_id is not null then\s+return v_log\.upgraded_session_id;/, 'conversion returns the existing detailed session when retried');
assert.match(migrations, /insert into public\.sessions[\s\S]*session_type[\s\S]*'Training'/, 'conversion creates an existing detailed Training session');
assert.match(reviewMigration, /coalesce\(nullif\(btrim\(v_log\.discipline\), ''\), 'Other'\)/, 'blank session discipline falls back to canonical Other');
assert.match(migrations, /total_targets[\s\S]*v_log\.targets_fired/, 'targets fired map to session total_targets');
assert.match(migrations, /own_score[\s\S]*v_log\.hits/, 'hits map directly and null stays null');
assert.match(migrations, /competition_date[\s\S]*v_log\.date/, 'date maps to the detailed session date field');
assert.match(migrations, /shooting_ground[\s\S]*v_log\.location/, 'location maps to shooting_ground');
assert.match(migrations, /equipment_weapon_id[\s\S]*equipment_ammunition_profile_id[\s\S]*equipment_snapshot[\s\S]*v_log\.equipment_weapon_id[\s\S]*v_log\.equipment_ammunition_profile_id[\s\S]*v_log\.equipment_snapshot/, 'equipment references and immutable snapshot are preserved');
assert.doesNotMatch(migrations, /insert into public\.(session_courses|session_post_targets|misses)/, 'conversion does not fabricate post, target, or miss detail structure');
assert.match(migrations, /set upgraded_session_id = v_session_id,[\s\S]*upgraded_at = now\(\)/, 'source log is retained and clearly marked as upgraded only after insert succeeds');
assert.match(reviewMigration, /drop constraint if exists training_logs_upgraded_session_id_fkey[\s\S]*on delete cascade/, 'review migration replaces preview FK behavior with cascade deletion');

assert.match(form, /function buildSimpleTrainingPayload/, 'normal save and upgrade share validation and payload building');
assert.match(form, /async function upgradeLog\(\)[\s\S]*buildSimpleTrainingPayload[\s\S]*\.from\("training_logs"\)[\s\S]*\.update\(built\.payload\)[\s\S]*upgrade_simple_training_log/, 'upgrade saves current form values before calling the RPC');
assert.match(form, /Could not save your latest edits before upgrading[\s\S]*return;[\s\S]*const \{ data: sessionId, error \} = await supabase\.rpc/, 'conversion does not start when saving current edits fails');
assert.match(form, /Could not upgrade this training log right now\. Your latest simple-log edits are still saved/, 'conversion failure leaves the latest simple-log edits intact');
assert.match(form, /Add detailed training data/, 'edit form exposes a real upgrade action');
assert.match(form, /Save changes/, 'normal simple-log editing remains available');
assert.doesNotMatch(form, /ShotKam|video/i, 'upgrade card only lists currently supported detailed Training data');
assert.match(editPage, /upgraded_session_id[\s\S]*router\.replace\(`\/sessions\/\$\{data\.upgraded_session_id\}`\)/, 'old simple edit route redirects upgraded logs to the detailed session');

assert.match(statsPage, /\.eq\("source_type", "simple_training"\)\s+\.is\("upgraded_session_id", null\)/, 'Performance queries exclude upgraded simple logs');
assert.match(dashboardPage, /\.eq\("source_type", "simple_training"\)\s+\.is\("upgraded_session_id", null\)/, 'Dashboard simple-log list excludes upgraded simple logs');
assert.match(statsPage, /const missCount = missCounts\[session\.id\] \|\| 0;\s+const score = isUsableNumber\(session\.own_score\) \? session\.own_score : missCount > 0 \? scoreFromMisses/, 'Training sessions derive scores from misses only when miss evidence exists');
assert.match(statsPage, /hits: isUsableNumber\(score\) \? score : null/, 'Training volume keeps hits unknown when score is unknown');
assert.match(statsPage, /return isUsableNumber\(score\) \? \{ id: session\.id[\s\S]*dataType: "training"/, 'Training Performance rows require a known score');
assert.match(statsPage, /setVolumeLogs\(\[[\s\S]*trainingSessionToVolumeLog/, 'detailed Training sessions still count toward training volume');

console.log('simple training upgrade regression tests passed');
