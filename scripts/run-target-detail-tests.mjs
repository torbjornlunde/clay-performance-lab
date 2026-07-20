import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execSync('rm -rf .target-detail-test-build .target-detail-test-src && mkdir -p .target-detail-test-src/export .target-detail-test-src/misses && cp lib/misses/scoring.ts .target-detail-test-src/misses/scoring.ts && sed \"s#@/lib/misses/scoring#../misses/scoring#\" lib/export/exportUserData.ts > .target-detail-test-src/export/exportUserData.ts && npx tsc lib/targets/targetDetails.ts lib/targets/postTargets.ts lib/sporttrap/program.ts lib/fitasc/compakSchemes.ts .target-detail-test-src/export/exportUserData.ts .target-detail-test-src/misses/scoring.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .target-detail-test-build --skipLibCheck', {stdio:'inherit'});
const details = await import('../.target-detail-test-build/lib/targets/targetDetails.js');
const postTargets = await import('../.target-detail-test-build/lib/targets/postTargets.js');
const sporttrap = await import('../.target-detail-test-build/lib/sporttrap/program.js');
const compak = await import('../.target-detail-test-build/lib/fitasc/compakSchemes.js');
const exportData = await import('../.target-detail-test-build/.target-detail-test-src/export/exportUserData.js');

const complete = {target_label:'A',target_type:'Standard',direction:'Left to right',angle:'Hard left',speed:'Very fast',distance:'Long',difficulty:'5 - Very hard',notes:'Late pickup'};
for (const discipline of ['Leirduesti','Sporting','English Sporting']) {
  const post = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'single',targets:[complete]}]);
  const [row] = postTargets.rowsFromPosts('session-1', [post]);
  assert.equal(row.target_label, 'A', `${discipline} saves label`);
  assert.equal(row.target_type, 'Standard', `${discipline} saves target type`);
  assert.equal(row.direction, 'Left to right', `${discipline} saves direction`);
  assert.equal(row.angle, 'Hard left', `${discipline} saves angle`);
  assert.equal(row.speed, 'Very fast', `${discipline} saves speed`);
  assert.equal(row.distance, 'Long', `${discipline} saves distance`);
  assert.equal(row.difficulty, '5 - Very hard', `${discipline} saves difficulty`);
  assert.equal(row.notes, 'Late pickup', `${discipline} saves notes`);
}

const single = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'single',targets:[{}]}]);
assert.equal(single.presentations[0].targets[0].position_in_presentation, 1, 'single keeps presentation position 1');
const report = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'report_pair',targets:[{target_label:'A'},{target_label:'B'}]}]);
assert.deepEqual(report.presentations[0].targets.map(t => [t.target_label, t.position_in_presentation]), [['A',1],['B',2]], 'report pair keeps order');
const simo = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'simultaneous_pair',targets:[{target_label:'C'},{target_label:'D'}]}]);
assert.deepEqual(simo.presentations[0].targets.map(t => t.target_label), ['C','D'], 'simultaneous pair keeps both physical targets');

const legacy = {target_label:'L',target_type:'Crossing',direction:'Right to left',angle:'Unknown',speed:'Fast',distance:'Long',difficulty:'Tricky',notes:'legacy note'};
const legacyPost = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'single',targets:[legacy]}]);
const [legacyRow] = postTargets.rowsFromPosts('legacy-session', [legacyPost]);
assert.equal(legacyRow.target_type, 'Crossing', 'legacy target type loads and saves unchanged');
assert.equal(legacyRow.difficulty, 'Tricky', 'legacy difficulty loads and saves unchanged');
assert.ok(postTargets.targetTypes.includes('Crossing'), 'legacy target type remains visible in controls');
assert.equal(details.displayTargetDifficulty('Tricky'), '4 - Hard', 'legacy difficulty maps to canonical display without changing storage');
assert.equal(postTargets.difficulties.includes('Tricky'), false, 'new difficulty selector uses only canonical choices');
const explicitlyChanged = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'single',targets:[{...legacy, target_type:'Standard', difficulty:'4 - Hard'}]}]);
const [changedRow] = postTargets.rowsFromPosts('legacy-session', [explicitlyChanged]);
assert.equal(changedRow.target_type, 'Standard', 'new target type saves only after explicit selection');
assert.equal(changedRow.difficulty, '4 - Hard', 'new difficulty saves only after explicit selection');

const optional = postTargets.blankTarget(1, 1);
assert.equal(details.targetDetailsHaveValue({targetType: optional.target_type, direction: optional.direction, angle: optional.angle, speed: optional.speed, distance: optional.distance, difficulty: optional.difficulty, notes: optional.notes}), false, 'optional unknown fields are treated as empty');

const editedRows = postTargets.rowsFromPosts('session-1', [report]);
assert.deepEqual(editedRows.map(r => [r.target_position, r.presentation_number, r.position_in_presentation]), [[1,1,1],[2,1,2]], 'target detail edits preserve score/miss mapping positions');
const cleared = postTargets.normalizePost(1, [{presentation_number:1,presentation_type:'single',targets:[{target_label:'A', target_type:'Unknown', direction:'Unknown', angle:'Unknown', speed:'Unknown', distance:'Unknown', difficulty:'Unknown', notes:''}]}]);
assert.equal(cleared.presentations[0].targets.length, 1, 'clearing details does not delete the target');

const draft = {schemaVersion:2,sessionId:'s1',postCount:1,targetsPerPost:2,defaultPostFormat:'1 pair',posts:[report],lastLocalUpdateAt:new Date().toISOString(),hasUnsyncedChanges:true};
assert.equal(postTargets.migrateDraft(JSON.parse(JSON.stringify(draft)), 's1').posts[0].presentations[0].targets[1].target_label, 'B', 'offline draft reload restores target details');
assert.equal(postTargets.rowsFromPosts('s1', draft.posts)[0].angle, 'Unknown', 'sync rows include new angle field without guessing old data');

const compakTargets = ['A','B','C','D','E','F'].map(machine => ({machine,target_type: machine === 'A' ? 'Battue' : 'Unknown', angle: machine === 'A' ? 'High' : 'Unknown'}));
const template = details.normalizePhysicalTargetsForTemplate('Compak Sporting', compakTargets, compak.getExpectedPresentationRows(17));
assert.equal(template.physicalTargets.find(t => t.key === 'A').details.targetType, 'Battue', 'Compak A-F stores details on physical machine');
assert.equal(template.physicalTargets.length, 6, 'Compak physical targets are not duplicated per program use');
assert.deepEqual(compak.getExpectedPresentationRows(17), ['single','single','single','simo_pair'], 'existing Compak program remains available');

const sporttrapEvent = sporttrap.getSporttrapEvent(1, 2);
const sporttrapTemplate = details.normalizePhysicalTargetsForTemplate('Sporttrap', sporttrapEvent.machines.map(machine => ({machine, direction:'Incoming'})), sporttrap.getSporttrapProgram());
assert.deepEqual(sporttrapTemplate.physicalTargets.map(t => t.key), ['B','C'], 'Sporttrap stores details at machine level for its event');
assert.equal(sporttrapTemplate.program.length, 15, 'Sporttrap program structure is preserved');

const fitascTemplate = details.normalizePhysicalTargetsForTemplate('FITASC Sporting', [{key:'stand-1-A', target_type:'Standard'}], {scheme:1, stand:1, rows: compak.getExpectedPresentationRows(1)});
assert.equal(fitascTemplate.physicalTargets[0].details.targetType, 'Standard', 'FITASC Sporting can carry target details without changing scheme rows');
assert.equal(fitascTemplate.program.rows.length, 5, 'FITASC/Compak built-in scheme calculation remains intact');

const exportTemplate = details.normalizePostTargetsForTemplate('Sporting', [report]);
assert.equal(JSON.stringify(exportTemplate).includes('user_id'), false, 'normalized export excludes personal user ids');
assert.equal(JSON.stringify(exportTemplate).includes('miss'), false, 'normalized export excludes misses and scores');


const targetDetailsSource = readFileSync('lib/targets/targetDetails.ts','utf8');
assert.match(targetDetailsSource, /optionsWithCurrent/, 'controls can include stored legacy values without converting them');
assert.match(targetDetailsSource, /targetDetailsSummary/, 'compact target detail summary helper exists');
const targetPage = readFileSync('app/sessions/[id]/targets/page.tsx','utf8');
assert.match(targetPage, /<details>\s*<summary>More target details · \{machineDetailsSummary\(machine\)\}/s, 'A-F advanced fields are behind a closed More target details section');
assert.match(targetPage, /return targetDetailsSummary/, 'A-F summary shows Optional or compact details');
assert.match(targetPage, /window\.confirm\(`Clear optional details for Machine/, 'A-F Clear details confirms when metadata exists');
assert.match(targetPage, /program references will remain/, 'A-F Clear details communicates that program references remain');
const postEditor = readFileSync('app/sessions/[id]/targets/PostTargetEditor.tsx','utf8');
assert.match(postEditor, /More target details · \{targetDetailsSummary/, 'post\/stand details use the same compact summary pattern');
assert.match(postEditor, /optionsWithCurrent\(targetTypes, t\.target_type\)/, 'post\/stand type control preserves legacy stored values');
assert.match(postEditor, /optionsWithCurrent\(difficulties, t\.difficulty\)/, 'post\/stand difficulty control preserves legacy stored values while canonical choices stay deduplicated');


const targetPageSourceForCopy = readFileSync('app/sessions/[id]/targets/page.tsx','utf8');
assert.match(targetPageSourceForCopy, /angle: definition\.angle/, 'A-F Copy to all and selected copy angle');
assert.match(targetPageSourceForCopy, /target_type: definition\.target_type[\s\S]*direction: definition\.direction[\s\S]*angle: definition\.angle[\s\S]*speed: definition\.speed[\s\S]*distance: definition\.distance[\s\S]*difficulty: definition\.difficulty[\s\S]*notes: definition\.notes/, 'A-F copy preserves all target metadata fields');
assert.doesNotMatch(targetPageSourceForCopy, /fitasc_compak_schemes[\s\S]*copyDefinitions/, 'A-F copy does not change program references');

const workbook = exportData.createUserDataWorkbook({
  sessions: [{ id:'s1', name:'Session 1', discipline:'Compak Sporting', session_type:'Competition', total_targets:25, created_at:'2026-07-02T00:00:00Z', shooting_ground:'Ground' }],
  courses: [],
  misses: [],
  targetDefinitions: [{ session_id:'s1', course_number:1, machine:'A', target_type:'Battue', direction:'Left to right', angle:'High', speed:'Fast', distance:'Long', difficulty:'4 - Hard', notes:'detail note' }],
  postTargets: [{ session_id:'s1', post_number:2, target_position:3, presentation_number:2, presentation_type:'report_pair', position_in_presentation:2, target_label:'B', target_type:'Crossing', direction:'Right to left', angle:'Hard right', speed:'Very fast', distance:'Long', difficulty:'Tricky', notes:'post note' }],
  exportCreatedAt: new Date('2026-07-02T00:00:00Z'),
});
const targetDefinitionSheet = workbook.sheets.find(sheet => sheet.name === 'Target definitions');
assert.ok(targetDefinitionSheet, 'target definitions export sheet exists');
assert.deepEqual(targetDefinitionSheet.headers, ['Session name','Shooting ground','Course number','Machine','Target type','Direction','Angle','Speed','Distance','Difficulty','Notes'], 'target definition export headers keep order and include Angle');
assert.equal(targetDefinitionSheet.rows[0].Angle, 'High', 'session_target_definitions angle is present in export result');
assert.equal(targetDefinitionSheet.rows[0].Machine, 'A', 'target definition export keeps Machine');
assert.equal(targetDefinitionSheet.rows[0]['Target type'], 'Battue', 'target definition export keeps target type');
const postTargetSheet = workbook.sheets.find(sheet => sheet.name === 'Post targets');
assert.ok(postTargetSheet, 'post targets export sheet exists');
assert.equal(postTargetSheet.rows[0].Angle, 'Hard right', 'session_post_targets angle is present in export result');
assert.deepEqual(postTargetSheet.headers.slice(7, 12), ['Target label','Target type','Direction','Angle','Speed'], 'post target export keeps existing column order around Angle');

const migration = readFileSync('supabase/migrations/20260702030000_target_details_angle.sql','utf8');
assert.match(migration, /add column if not exists angle text/, 'migration adds angle additively');
assert.match(migration, /session_target_definitions/, 'migration covers A-F target definitions');
const rls = readFileSync('supabase/migrations/20260701000000_session_post_targets.sql','utf8') + readFileSync('supabase/migrations/20260609000000_closed_beta_access.sql','utf8');
assert.match(rls, /session_post_targets\.session_id and s\.user_id = auth\.uid\(\)/, 'RLS keeps post target access owner-scoped');
assert.match(rls, /session_target_definitions\.session_id and s\.user_id = auth\.uid\(\)/, 'RLS keeps physical target access owner-scoped');
const scorecardPage = readFileSync('app/sessions/[id]/scorecard-import/page.tsx','utf8');
assert.match(scorecardPage, /from\("session_post_targets"\)/, 'scorecard import and mapping continue to use target positions');

execSync('rm -rf .target-detail-test-build .target-detail-test-src');
console.log('target detail domain tests passed');
