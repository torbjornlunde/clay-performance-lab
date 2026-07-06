import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
execSync('rm -rf .session-analysis-test-build && npx tsc lib/analysis/deterministicSessionAnalysis.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .session-analysis-test-build --skipLibCheck', {stdio:'inherit'});
const a = await import('../.session-analysis-test-build/deterministicSessionAnalysis.js');
const session={id:'current',discipline:'Compak Sporting',session_type:'Competition',own_score:18,winning_score:22,total_targets:25,created_at:'2026-07-01'};
const imports={reviewed_total_targets:25,reviewed_hits:18,reviewed_misses:7,inserted_misses:7,skipped_duplicates:0};
const misses=[1,2,3,4,5,6,7].map((pos,i)=>({id:String(i),course_number:i<4?4:10,target_position:pos,target_number:Math.ceil(pos/2),where_miss:i%2?'Not sure':'Unknown',main_reason:'Unknown',target_read:'Unknown',missed_target:'Unknown'}));
let result=a.buildDeterministicSessionAnalysis({session,scorecardImport:imports,misses,postTargets:[],history:[]});
assert.equal(result.summary.score,18); assert.equal(result.summary.totalTargets,25); assert.equal(result.summary.misses,7);
assert(!result.findings.join(' ').includes('Unknown'), 'placeholders are not findings');
assert(!result.findings.join(' ').includes('Not sure'), 'not sure is not a finding');
assert(result.missingData.some(x=>x.includes('Manual miss reasons')), 'manual reason limitation is honest');
assert(result.findings.some(x=>x.includes('posts 4 and 10') || x.includes('post 4')), 'post-specific findings are produced');
assert(result.recommendations.some(x=>x.evidence.includes('misses')), 'recommendation states evidence');
assert(result.missingData.some(x=>x.includes('Target descriptions')), 'missing setup limitation appears');
const postTargets=[
 {post_number:4,target_position:1,presentation_number:1,presentation_type:'report_pair',position_in_presentation:1,target_label:'A',target_type:'Crosser',direction:'left-to-right'},
 {post_number:4,target_position:2,presentation_number:1,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Quartering',direction:'right-to-left'},
 {post_number:4,target_position:3,presentation_number:2,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Quartering',direction:'right-to-left'},
 {post_number:4,target_position:4,presentation_number:2,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Quartering',direction:'right-to-left'},
 {post_number:10,target_position:5,presentation_number:3,presentation_type:'report_pair',position_in_presentation:2,target_label:'C',target_type:null,direction:null},
 {post_number:10,target_position:6,presentation_number:4,presentation_type:'single',position_in_presentation:1,target_label:'D',target_type:null,direction:null},
 {post_number:10,target_position:7,presentation_number:5,presentation_type:'single',position_in_presentation:1,target_label:'E',target_type:null,direction:null},
];
result=a.buildDeterministicSessionAnalysis({session,scorecardImport:imports,misses,postTargets,history:[]});
const text=result.findings.join(' ');
assert(text.includes('second target'), 'known presentation position produces second-target findings');
assert(text.includes('Target B'), 'known target labels produce target findings');
assert(text.includes('right-to-left'), 'known directions produce direction findings');
assert(!text.includes('Rabbit'), 'target type is not fabricated');
assert(!text.toLowerCase().includes('technical'), 'cause is not fabricated');
const history=[
 {id:'current',discipline:'Compak Sporting',session_type:'Competition',own_score:1,total_targets:1,created_at:'2026-07-02'},
 {id:'c1',discipline:'Compak Sporting',session_type:'Competition',own_score:20,total_targets:25,competition_date:'2026-06-01'},
 {id:'c2',discipline:'Compak Sporting',session_type:'Competition',own_score:40,total_targets:50,competition_date:'2026-05-01'},
 {id:'t1',discipline:'Compak Sporting',session_type:'Training',own_score:24,total_targets:25,competition_date:'2026-04-01'},
 {id:'other',discipline:'Skeet',session_type:'Competition',own_score:25,total_targets:25,competition_date:'2026-03-01'},
];
result=a.buildDeterministicSessionAnalysis({session,scorecardImport:imports,misses,postTargets,history});
assert.equal(result.competitionComparison.sampleSize,2, 'current and other disciplines excluded');
assert.equal(result.trainingComparison.sampleSize,1, 'training kept separate');
assert.equal(Math.round(result.competitionComparison.averagePercentage),80, 'different totals normalized');
assert.equal(result.winningScore.pointsBehind,4); assert.equal(Math.round(result.winningScore.percentageOfWinning),82);
assert(result.confidence.smallSample, 'small historical samples warn');
const page=readFileSync('app/sessions/[id]/scorecard-import/page.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');
assert.match(page,/scorecardRawTextDetails/); assert.match(page,/\/analysis\?scorecardImported=1/);
assert.match(css,/scorecardRawText[\s\S]*overflow-wrap:\s*anywhere/); assert.match(css,/white-space:\s*pre-wrap/); assert.match(css,/word-break:\s*break-word/);
assert.match(css,/analysisSection/); assert.match(css,/var\(--text\)/, 'semantic theme token keeps light and dark readable');
console.log('session analysis focused tests passed');
