import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const route = readFileSync('app/api/leirdue/source-refresh/[id]/route.ts', 'utf8');
assert.match(route, /auth\.getUser\(\)/, 'endpoint rejects unauthenticated requests');
assert.match(route, /status: 401/, 'endpoint returns 401 for unauthenticated requests');
assert.match(route, /\.eq\("user_id", userId\)/, 'endpoint only loads current user result');
assert.match(route, /confirmed !== true/, 'apply update requires explicit confirmation');
assert.match(route, /selectedFields/, 'confirmed update applies selected fields only');
assert.match(route, /storedSourceDiffsFromSummary\(loaded\.session\.source_change_summary\)/, 'PATCH reads diffs only from stored server source_change_summary');
assert.match(route, /status: 409/, 'PATCH rejects missing or non-changed stored source_change_summary');
assert.doesNotMatch(route, /body\.diffs|diffs\?:/, 'PATCH does not accept or trust client-supplied diffs');
assert.match(route, /refreshLeirdueSource/, 'endpoint fetches and compares direct Leirdue source');
assert.doesNotMatch(route, /leirdue_shared_shooter_results/, 'manual refresh does not rely only on shared cache');

const page = readFileSync('app/sessions/[id]/page.tsx', 'utf8');
assert.match(page, /Linked to Leirdue\.net/, 'UI shows linked Leirdue source state');
assert.match(page, /Last checked:/, 'UI shows last checked timestamp');
assert.match(page, /Refresh from Leirdue\.net/, 'UI shows refresh button');
assert.match(page, /Source changed · Review update/, 'UI shows changed state');
assert.match(page, /Source checked · No changes found/, 'UI shows no-change state');
assert.match(page, /Could not safely match source result/, 'UI shows low-confidence match state');
assert.match(page, /Apply selected changes/, 'UI allows selected apply');
assert.match(page, /window\.confirm/, 'UI requires confirmation before apply');
assert.doesNotMatch(page, /diffs: sourceRefresh\.diffs/, 'UI does not send client-side diffs to PATCH');

const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /leirdueSourceReview/, 'source review UI has scoped theme styles');
assert.match(css, /var\(--surface/, 'source review styles use theme tokens for Light and Dark mode');

const migration = readFileSync('supabase/migrations/20260712140000_leirdue_manual_source_review.sql', 'utf8');
assert.match(migration, /add column if not exists last_source_checked_at/, 'migration adds last source checked timestamp');
assert.match(migration, /add column if not exists last_source_status/, 'migration adds last source status');
assert.match(migration, /add column if not exists source_change_summary jsonb/, 'migration adds structured change summary');

writeFileSync('.leirdue-source-refresh-test-tsconfig.json', JSON.stringify({
  compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], outDir: '.leirdue-source-refresh-test-build', skipLibCheck: true, rootDir: '.', baseUrl: '.', ignoreDeprecations: '6.0', types: ['node'], paths: { '@/*': ['./*'] } },
  include: ['lib/leirdue/sourceRefresh.ts', 'lib/leirdue/types.ts', 'lib/leirdue/normalize.ts', 'lib/leirdue/parser.ts', 'lib/disciplines.ts'],
}));
execSync('rm -rf .leirdue-source-refresh-test-build && npx tsc -p .leirdue-source-refresh-test-tsconfig.json && mkdir -p .leirdue-source-refresh-test-build/node_modules/@ && ln -s ../../lib .leirdue-source-refresh-test-build/node_modules/@/lib', { stdio: 'inherit' });
const source = await import('../.leirdue-source-refresh-test-build/lib/leirdue/sourceRefresh.js');
const baseSession = { id: 's1', name: 'Cup', competition_date: '2026-06-01', discipline: 'Leirduesti', shooting_ground: 'Club', own_score: 95, winning_score: null, total_targets: 100, leirdue_result_url: 'https://www.leirdue.net/?stevne=1&meny=resultater&liste_id=2', notes: 'source: leirdue_net. shooter_name: Test Shooter. shooter_class: A. placement: 3. liste_id: 2' };
const candidate = { date: '2026-06-01', name: 'Cup', shootingGround: 'Club', discipline: 'Leirduesti', ownScore: 95, totalTargets: 100, winningScore: 99, placement: 3, shooterName: 'Test Shooter', shooterClass: 'A', listeId: '2', leirdueUrl: baseSession.leirdue_result_url, listType: 'resultater', confidence: 'high', notes: '', category: 'recommended', importRecommended: true };
assert.equal(source.leirdueSourceUrlForSession(baseSession), baseSession.leirdue_result_url, 'Leirdue-linked sessions expose refresh URL');
assert.equal(source.leirdueSourceUrlForSession({ ...baseSession, leirdue_result_url: null, notes: null }), null, 'manual sessions without source URL do not expose refresh URL');
assert.equal(source.matchLeirdueSourceCandidate(baseSession, [candidate])?.shooterName, 'Test Shooter', 'safe source matching uses shooter, id, score and event fields');
assert.equal(source.matchLeirdueSourceCandidate({ ...baseSession, notes: 'source: leirdue_net. shooter_name: Other Shooter. placement: 8. liste_id: 2', own_score: 10 }, [candidate]), null, 'low-confidence match leaves saved data unchanged');
let patch = source.applyableSessionPatch([
  { field: 'winning_score', label: 'Winning score', currentValue: null, sourceValue: 99, changed: true, safeToApply: true },
  { field: 'own_score', label: 'Own score', currentValue: 95, sourceValue: 96, changed: true, safeToApply: true },
  { field: 'placement', label: 'Placement', currentValue: 3, sourceValue: 2, changed: true, safeToApply: false },
], ['winning_score']);
assert.deepEqual(patch, { winning_score: 99 }, 'null saved winning score can be explicitly updated from source');
const storedDiffs = source.storedSourceDiffsFromSummary({ status: 'changed', diffs: [
  { field: 'winning_score', label: 'Winning score', currentValue: null, sourceValue: 99, changed: true, safeToApply: true },
  { field: 'name', label: 'Event title', currentValue: 'Cup', sourceValue: 'Server Cup', changed: true, safeToApply: true },
] });
assert.deepEqual(source.applyableSessionPatch(storedDiffs, ['name']), { name: 'Server Cup' }, 'PATCH applies only selected fields from stored server diffs');
assert.equal(source.storedSourceDiffsFromSummary(null), null, 'PATCH without stored source_change_summary is rejected');
assert.equal(source.storedSourceDiffsFromSummary({ status: 'no_changes', diffs: [] }), null, 'PATCH with stored status not changed is rejected');
const fabricatedClientDiffs = [{ field: 'own_score', label: 'Own score', currentValue: 95, sourceValue: 1, changed: true, safeToApply: true }];
assert.deepEqual(source.applyableSessionPatch(storedDiffs, fabricatedClientDiffs.map((item) => item.field)), {}, 'fabricated client diffs cannot update a result when stored server diffs do not contain that field');
patch = source.applyableSessionPatch([
  { field: 'own_score', label: 'Own score', currentValue: 95, sourceValue: 96, changed: true, safeToApply: true },
  { field: 'total_targets', label: 'Total targets', currentValue: 100, sourceValue: 125, changed: true, safeToApply: true },
], ['own_score', 'total_targets']);
assert.deepEqual(patch, { own_score: 96, total_targets: 125 }, 'own score and total target changes can be selected together');
patch = source.applyableSessionPatch([{ field: 'winning_score', label: 'Winning score', currentValue: 99, sourceValue: 99, changed: false, safeToApply: true }], ['winning_score']);
assert.deepEqual(patch, {}, 'no-change source returns stable empty patch');

rmSync('.leirdue-source-refresh-test-build', { recursive: true, force: true });
rmSync('.leirdue-source-refresh-test-tsconfig.json', { force: true });
console.log('Leirdue source refresh tests passed');
