import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
execSync('rm -rf .session-analysis-test-build && npx tsc lib/analysis/deterministicSessionAnalysis.ts lib/leirdue/normalize.ts lib/disciplines.ts lib/misses/scoring.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .session-analysis-test-build --skipLibCheck', {stdio:'inherit'});
const a = await import('../.session-analysis-test-build/analysis/deterministicSessionAnalysis.js');
const baseSession={id:'current',discipline:'Leirduesti',session_type:'Competition',own_score:18,winning_score:22,total_targets:25,post_count:5,targets_per_post:5,created_at:'2026-07-01'};
const imports={reviewed_total_targets:25,reviewed_hits:18,reviewed_misses:7,inserted_misses:7,skipped_duplicates:0};
const misses=[1,2,3,4,5,6,7].map((pos,i)=>({id:String(i),course_number:i<4?4:5,target_position:pos,target_number:Math.ceil(pos/2),where_miss:i%2?'Not sure':'Unknown',main_reason:'Unknown',target_read:'Unknown',missed_target:'Unknown'}));
let result=a.buildDeterministicSessionAnalysis({session:baseSession,scorecardImport:imports,misses,postTargets:[],history:[]});
assert.equal(result.summary.score,18); assert.equal(result.summary.totalTargets,25); assert.equal(result.summary.misses,7);
assert(!result.findings.join(' ').includes('Unknown'), 'placeholders are not findings');
assert(!result.findings.join(' ').includes('Not sure'), 'not sure is not a finding');
assert(result.missingData.some(x=>x.includes('Manual miss reasons')), 'manual reason limitation is honest');
assert(result.findings.some(x=>x.includes('post 4')), 'post-specific findings are produced');
assert(result.recommendations.some(x=>x.evidence.includes('mapped misses')), 'recommendation states mapped evidence');
assert(!result.findings.join(' ').match(/early|middle|late|final third/i), 'target positions do not create false timing findings');
assert(!result.recommendations.map(x=>x.title+x.evidence).join(' ').match(/reset|fatigue|late/i), 'no unsupported late-round recommendation');
assert.equal(result.notesBasedContext, null, 'notes context is absent when private notes are not included');
result=a.buildDeterministicSessionAnalysis({session:baseSession,scorecardImport:imports,misses,postTargets:[],history:[],includePrivateNotes:true,privateNotes:[{note_scope:'session',post_number:null,body:'tired at the end and rushed the second target'},{note_scope:'post',post_number:4,body:'bad light on post 4 and felt behind the bird'}]});
assert.equal(result.notesBasedContext.heading, 'Notes-based context', 'analysis output supports Notes-based context');
assert(result.notesBasedContext.hasSessionNote, 'session-level notes can be included');
assert(result.notesBasedContext.hasPostNotes, 'per-post notes can be included');
assert(result.notesBasedContext.summary.join(' ').includes('Your notes suggest'), 'notes are worded as suggestions');
assert(result.notesBasedContext.summary.join(' ').includes('post 4'), 'post-specific note comments are summarized without repeating full notes');
assert(result.notesBasedContext.instructions.includes('user-provided context, not proven facts'), 'AI instruction says notes are context, not proven facts');
assert(result.notesBasedContext.instructions.includes('Observed score and miss data are observed facts'), 'prompt/context separates observed facts from private notes');
assert(!result.notesBasedContext.summary.join(' ').includes('bad light on post 4 and felt behind the bird'), 'raw note text is not repeated');
result=a.buildDeterministicSessionAnalysis({session:baseSession,scorecardImport:imports,misses,postTargets:[],history:[],includePrivateNotes:false,privateNotes:[{note_scope:'session',body:'tired at the end'}]});
assert.equal(result.notesBasedContext, null, 'toggle OFF prevents notes from being included');
const postTargets=[
 {post_number:4,target_position:1,presentation_number:1,presentation_type:'report_pair',position_in_presentation:1,target_label:'A',target_type:'Crosser',direction:'left-to-right'},
 {post_number:4,target_position:2,presentation_number:1,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Quartering',direction:'right-to-left'},
 {post_number:4,target_position:3,presentation_number:2,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Quartering',direction:'right-to-left'},
 {post_number:4,target_position:4,presentation_number:2,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Quartering',direction:'right-to-left'},
 {post_number:5,target_position:5,presentation_number:3,presentation_type:'report_pair',position_in_presentation:2,target_label:'C',target_type:null,direction:null},
 {post_number:5,target_position:6,presentation_number:4,presentation_type:'single',position_in_presentation:1,target_label:'D',target_type:null,direction:null},
 {post_number:5,target_position:7,presentation_number:5,presentation_type:'single',position_in_presentation:1,target_label:'E',target_type:null,direction:null},
];
result=a.buildDeterministicSessionAnalysis({session:baseSession,scorecardImport:imports,misses,postTargets,history:[]});
let text=result.findings.join(' ');
assert(text.includes('second target'), 'known presentation position produces second-target findings');
assert(text.includes('Target B'), 'known target labels produce target findings');
assert(text.includes('right-to-left'), 'known directions produce direction findings');
assert(!text.includes('Rabbit'), 'target type is not fabricated');
assert(!text.toLowerCase().includes('technical'), 'cause is not fabricated');
const pairSetup=[
 {post_number:1,target_position:1,presentation_number:1,presentation_type:'report_pair',position_in_presentation:1,target_label:'A'},
 {post_number:1,target_position:2,presentation_number:1,presentation_type:'report_pair',position_in_presentation:2,target_label:'B'},
 {post_number:2,target_position:1,presentation_number:1,presentation_type:'single',position_in_presentation:1,target_label:'C'},
];
let expanded=a.expandMissToClayAtoms({course_number:1,target_number:1,missed_target:'Both targets in pair'}, pairSetup);
assert.equal(expanded.atoms.length,2, 'manual Both targets row expands to two missed clays');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:4,post_count:2,targets_per_post:2,own_score:null},misses:[{course_number:1,target_number:1,missed_target:'Both targets in pair'}],postTargets:pairSetup,history:[]});
assert.equal(result.summary.misses,2, 'fallback weighted misses count both targets'); assert.equal(result.summary.score,2, 'fallback score uses weighted misses');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:3,post_count:3,targets_per_post:1},scorecardImport:{...imports,reviewed_total_targets:3,reviewed_hits:0,reviewed_misses:3,skipped_duplicates:1},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'},{course_number:1,target_number:1,missed_target:'Both targets in pair'}],postTargets:pairSetup,history:[]});
assert(result.summary.mappedMisses<=3, 'mapped findings never exceed reviewed_misses');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:4,post_count:2,targets_per_post:2},scorecardImport:{...imports,reviewed_total_targets:4,reviewed_hits:1,reviewed_misses:3},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'},{course_number:1,target_number:1,missed_target:'Both targets in pair'},{course_number:2,target_position:1,target_number:1,missed_target:'Single target'}],postTargets:pairSetup,history:[]});
assert.equal(result.summary.mappedMisses,3, 'duplicate coordinates are counted once while another valid atom is retained');
assert.equal(result.summary.duplicateMappedMisses,1, 'direct imported atom plus manual pair duplicate is reported');
assert(result.missingData.some(x=>x.includes('duplicate mapped clay coordinate')), 'duplicate mapping is explained');
expanded=a.expandMissToClayAtoms({course_number:9,target_number:99,missed_target:'Single target'}, pairSetup);
assert.equal(expanded.ambiguous,true, 'legacy row without target_position can remain ambiguous');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:3,post_count:3,targets_per_post:1},scorecardImport:{...imports,reviewed_total_targets:3,reviewed_hits:1,reviewed_misses:2},misses:[{course_number:9,target_number:99,missed_target:'Single target'}],postTargets:pairSetup,history:[]});
assert.equal(result.summary.ambiguousMisses,2, 'ambiguous reviewed misses are explained');
assert(!result.findings.join(' ').includes('Strongest'), 'ambiguous mapping suppresses strongest/weakest');
assert(result.missingData.some(x=>x.includes('Exact strongest')), 'strongest/weakest limitation is explicit');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:9,post_count:3,targets_per_post:3},scorecardImport:{...imports,reviewed_total_targets:9,reviewed_hits:6,reviewed_misses:3},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'},{course_number:1,target_position:2,target_number:2,missed_target:'Single target'},{course_number:3,target_position:1,target_number:1,missed_target:'Single target'}],postTargets:[],history:[]});
text=result.findings.join(' '); assert(text.includes('Strongest post: 2'), 'zero-miss post is strongest'); assert(text.includes('Weakest post: 1'), 'weakest post detected');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:9,post_count:3,targets_per_post:3},scorecardImport:{...imports,reviewed_total_targets:9,reviewed_hits:7,reviewed_misses:2},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'},{course_number:3,target_position:1,target_number:1,missed_target:'Single target'}],postTargets:[],history:[]});
assert(result.findings.join(' ').includes('Strongest post: 2'), 'single zero-miss strongest is shown');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:12,post_count:4,targets_per_post:3},scorecardImport:{...imports,reviewed_total_targets:12,reviewed_hits:10,reviewed_misses:2},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'},{course_number:4,target_position:1,target_number:1,missed_target:'Single target'}],postTargets:[],history:[]});
assert(result.findings.join(' ').includes('Strongest posts: 2, 3'), 'tied strongest posts are shown');
assert(!/Weakest posts: 2, 3/.test(result.findings.join(' ')), 'tied strongest posts are not also weakest');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:6,post_count:3,targets_per_post:2},scorecardImport:{...imports,reviewed_total_targets:6,reviewed_hits:3,reviewed_misses:3},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'},{course_number:2,target_position:1,target_number:1,missed_target:'Single target'},{course_number:3,target_position:1,target_number:1,missed_target:'Single target'}],postTargets:[],history:[]});
assert(result.findings.join(' ').includes('performed equally'), 'equal post performance does not duplicate strongest and weakest');
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,total_targets:9,post_count:3,targets_per_post:null},scorecardImport:{...imports,reviewed_total_targets:9,reviewed_hits:7,reviewed_misses:2},misses:[{course_number:1,target_position:1,target_number:1,missed_target:'Single target'}],postTargets:[],history:[]});
assert(!result.findings.join(' ').includes('Strongest'), 'incomplete setup suppresses strongest/weakest');
const history=Array.from({length:12},(_,i)=>({id:`c${i}`,discipline:'English Sporting',session_type:'Competition',own_score:20,total_targets:25,competition_date:`2026-06-${String(i+1).padStart(2,'0')}`})).concat([
 {id:'current',discipline:'Engelsk Sporting',session_type:'Competition',own_score:1,total_targets:1,created_at:'2026-07-02'},
 {id:'t1',discipline:'Sporting',session_type:'Training',own_score:24,total_targets:25,competition_date:'2026-04-01'},
 {id:'t2',discipline:'Sporting',session_type:'Training',own_score:23,total_targets:25,competition_date:'2026-03-01'},
 {id:'futureHigh',discipline:'Sporting',session_type:'Competition',own_score:25,total_targets:25,competition_date:'2026-08-01'},
 {id:'sameDate',discipline:'Sporting',session_type:'Competition',own_score:25,total_targets:25,competition_date:'2026-07-01'},
 {id:'other',discipline:'Skeet',session_type:'Competition',own_score:25,total_targets:25,competition_date:'2026-03-01'},
]);
result=a.buildDeterministicSessionAnalysis({session:{...baseSession,id:'current',discipline:'Engelsk Sporting'},scorecardImport:imports,misses,postTargets,history});
assert.equal(result.competitionComparison.sampleSize,10, 'competition limit applies per type');
assert.equal(result.trainingComparison.sampleSize,2, 'older training sessions are not hidden by recent competition sessions');
assert.equal(Math.round(result.competitionComparison.averagePercentage),80, 'future and same-date scores are excluded and different totals normalized');
assert.equal(result.winningScore.pointsBehind,4); assert.equal(Math.round(result.winningScore.percentageOfWinning),82);
assert(result.confidence.smallSample, 'small historical samples warn');
const page=readFileSync('app/sessions/[id]/scorecard-import/page.tsx','utf8');
const analysisPage=readFileSync('app/sessions/[id]/analysis/page.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');
assert.match(page,/scorecardRawTextDetails/); assert.match(page,/\/analysis\?scorecardImported=1/);
assert.match(analysisPage,/useSearchParams/); assert.match(analysisPage,/from\("private_session_notes"\)/, 'private notes are queried for session analysis'); assert.match(analysisPage,/Include private notes in analysis/, 'include-private-notes toggle exists'); assert.match(analysisPage,/setIncludePrivateNotes\(notes\.length > 0\)/, 'toggle defaults ON when notes exist'); assert.match(analysisPage,/hasPrivateNotes &&/, 'toggle appears only when notes exist'); assert.match(analysisPage,/includePrivateNotes/, 'toggle state controls analysis context'); assert.match(analysisPage,/Note text is not sent to analytics/, 'privacy helper text is shown'); assert.match(analysisPage,/hasReviewedPostScorecard/); assert.match(analysisPage,/analyzeMisses/); assert.match(analysisPage,/alreadyImported/); assert.match(analysisPage,/ownScoreUpdated/);
assert.match(css,/scorecardRawText[\s\S]*overflow-wrap:\s*anywhere/); assert.match(css,/white-space:\s*pre-wrap/); assert.match(css,/word-break:\s*break-word/); assert.match(css,/var\(--text\)/);
console.log('session analysis focused tests passed');
