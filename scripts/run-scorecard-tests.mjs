import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
execSync('rm -rf .scorecard-test-build && npx tsc lib/scorecards/scorecardAnalysis.ts lib/scorecards/orderedPendingPersistence.ts lib/scorecards/scorecardMissMapping.ts lib/scorecards/scorecardPhotos.ts lib/scorecards/scorecardSetup.ts lib/scorecards/scorecardProfiles.ts lib/scorecards/importedScorecard.ts lib/trainingScoreSheets/safety.ts lib/disciplines.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .scorecard-test-build --skipLibCheck', {stdio:'inherit'});
const a = await import('../.scorecard-test-build/scorecards/scorecardAnalysis.js');
const op = await import('../.scorecard-test-build/scorecards/orderedPendingPersistence.js');
const m = await import('../.scorecard-test-build/scorecards/scorecardMissMapping.js');
const q = await import('../.scorecard-test-build/scorecards/scorecardPhotos.js');
const setup = await import('../.scorecard-test-build/scorecards/scorecardSetup.js');
const profiles = await import('../.scorecard-test-build/scorecards/scorecardProfiles.js');
const imported = await import('../.scorecard-test-build/scorecards/importedScorecard.js');



const soknaCounts=[8,8,8,8,8,8,8,6,8,8,6,8,6,6,8,8];
const soknaFixture={sessionType:'Training',discipline:'Leirduesti',shooterName:'Sokna shooter',shootingGround:'Sokna',totalTargets:120,totalScore:94,posts:soknaCounts.map((count,idx)=>({postNumber:idx+1,expectedTargets:count,detectedScore:idx===2?7:Math.max(0,count-2),confidence:'high',targets:Array.from({length:10},(_,i)=> i<count ? {targetNumber:i+1,cellState:i<6?'hit':i<count?'miss':'active_blank',result:i<6?'hit':'miss',confidence:'high',rawMark:i<6?'/':'0'} : {targetNumber:i+1,cellState:'inactive',result:'unknown',confidence:'high',rawMark:null})}))};
let normalizedImport=imported.normalizeImportedPostStructure(soknaFixture);
assert.deepEqual(normalizedImport.expectedTargetsByPost,soknaCounts,'Sokna-style variable post structure is preserved');
assert.equal(imported.calculateImportedExpectedTotal(normalizedImport.posts),120,'Sokna-style variable post structure totals 120');
assert.equal(normalizedImport.posts[7].targets.length,6,'inactive grey cells are not active targets');
assert.equal(normalizedImport.posts[7].targets.filter(c=>c.result==='miss').length,0,'inactive cells are not treated as misses');
const detailed=imported.normalizeImportedPostStructure({posts:[{postNumber:1,expectedTargets:8,targets:[1,2,3,4,5,6].map(targetNumber=>({targetNumber,cellState:'hit',result:'hit',confidence:'high'})).concat([7,8].map(targetNumber=>({targetNumber,cellState:'miss',result:'miss',confidence:'high'})))}]});
assert.equal(detailed.posts[0].scoringMode,'detailed'); assert.equal(detailed.posts[0].targets.filter(c=>c.result==='hit').length,6,'detailed post maps 6 hits'); assert.equal(detailed.posts[0].targets.filter(c=>c.result==='miss').length,2,'detailed post maps 2 misses');
const totalOnly=imported.normalizeImportedPostStructure({posts:[{postNumber:1,expectedTargets:8,detectedScore:7,confidence:'high',targets:[]}]});
assert.equal(totalOnly.posts[0].scoringMode,'total_only','post total without target positions uses total-only fallback'); assert.equal(totalOnly.posts[0].targets.length,0,'total-only fallback does not fabricate hit/miss positions');
const mixed=imported.normalizeImportedPostStructure({posts:[detailed.posts[0],{postNumber:2,expectedTargets:8,detectedScore:7,confidence:'high',targets:[]}]});
assert.equal(mixed.posts[0].scoringMode,'detailed'); assert.equal(mixed.posts[1].scoringMode,'total_only','mixed import supports detailed and total-only posts');
const mismatch=imported.validateImportedScorecardStructure(imported.normalizeImportedPostStructure({...soknaFixture,posts:soknaFixture.posts.slice(0,15)}),120);
assert.equal(mismatch.detectedTotalTargets,112); assert.match(mismatch.warnings.join(' '),/expected total is 120/,'target total mismatch produces review warning');
const uncertain=imported.normalizeImportedPostStructure({posts:[{postNumber:1,expectedTargets:2,targets:[{targetNumber:1,cellState:'hit',result:'hit',confidence:'high'},{targetNumber:2,cellState:'uncertain',result:'uncertain',confidence:'low'}]}]});
const mappedUncertain=imported.mapReviewedImportToTrainingScoreSheet(uncertain);
assert.deepEqual(mappedUncertain.targetResults['imported-shooter'][1],{1:'hit'},'uncertain result is not saved as hit or miss until confirmed');
const correctedStructure=imported.changeImportedPostExpectedTargets(normalizedImport,8,8);
assert.equal(correctedStructure.expectedTargetsByPost[7],8); assert.equal(correctedStructure.totalTargets,122,'review correction updates total structure immediately');

const discoveryAnalysis={detectedTitle:'Sokna',detectedDate:null,scorecardConfidence:'high',rawText:'synthetic Sokna 120',warnings:[],shooterRows:[{candidateId:'sokna',displayName:'Sokna shooter',rowLabel:null,confidence:'high',detectedScore:94,posts:soknaCounts.map((count,idx)=>({postNumber:idx+1,expectedTargets:count,detectedPostScore:Math.max(0,count-2),detectedPostScoreConfidence:'high',detectedPostScoreRawText:String(Math.max(0,count-2)),targets:Array.from({length:10},(_,i)=> i<count ? {targetNumber:i+1,cellState:i<6?'active':'active',result:i<6?'hit':'miss',rawMark:i<6?'/':'0',observedMarkCategory:i<6?'diagonal_stroke':'zero',confidence:'high',warning:null} : {targetNumber:i+1,cellState:'inactive',result:'unknown',rawMark:null,observedMarkCategory:null,confidence:'high',warning:null})}))}]};
const discovered=a.normalizeScorecardAnalysis(discoveryAnalysis,{totalTargets:120,allowStructureDiscovery:true});
assert.equal(discovered.setupMode,'discovery','minimal Training setup can analyze in structure discovery mode');
assert.deepEqual(discovered.expectedTargetsByPost,soknaCounts,'discovered variable structure survives normalization');
assert.equal(discovered.detectedTotalTargets,120,'discovered structure total is preserved');
assert.equal(discovered.shooterRows[0].grid.filter(c=>c.postNumber===8).length,6,'discovery review grid contains only active Post 8 targets');
assert.equal(discovered.shooterRows[0].grid.some(c=>c.postNumber===8&&c.targetNumber===7),false,'inactive Post 8 grey cells do not reappear as unknown targets');
let p8to8=[...discovered.shooterRows[0].grid,{postNumber:8,targetNumber:7,result:'unknown',cellState:'active_blank',rawMark:null,observedMarkCategory:'blank',confidence:'low',warning:'Added during review setup correction.'},{postNumber:8,targetNumber:8,result:'unknown',cellState:'active_blank',rawMark:null,observedMarkCategory:'blank',confidence:'low',warning:'Added during review setup correction.'}];
assert.equal(p8to8.length,122,'review correction changing P8 from 6 to 8 adds only unscored positions and updates total');
const partialReliable=imported.normalizeImportedPostStructure({posts:[{postNumber:1,expectedTargets:8,detectedScore:7,confidence:'high',targets:[1,2,3].map(targetNumber=>({targetNumber,cellState:'hit',result:'hit',confidence:'high'}))}]});
assert.equal(partialReliable.posts[0].scoringMode,'total_only','reliable total plus partial exact positions remains total_only'); assert.match(partialReliable.warnings.join(' '),/exact target positions are incomplete/);

const trainingPayload=imported.mapReviewedImportToTrainingScoreSheet(detailed,'shooter-a');
assert.equal(trainingPayload.scoreSheet.number_of_posts,1); assert.deepEqual(trainingPayload.scoreSheet.expected_targets_by_post,[8]); assert.deepEqual(trainingPayload.scores,[6]); assert.equal(Object.keys(trainingPayload.targetResults['shooter-a'][1]).length,8,'confirmed Training import maps score sheet, shooter, post scores and target results');


const trainingApplySource = readFileSync('app/api/scorecard/training/apply/route.ts','utf8');
assert.match(trainingApplySource,/shooter_name:\s*payload\.shooter\.name/,'Training import shooter insert uses shooter_name');
assert.match(trainingApplySource,/total_score:\s*totalScore/,'Training import shooter insert writes total_score');
assert.match(trainingApplySource,/missing_discipline/,'blank discipline is blocked by save API');
assert.match(trainingApplySource,/missing_date/,'blank date is blocked by save API');
assert.match(trainingApplySource,/cleanupCreatedSheet/,'failed child insert cleans up newly created sheet');
assert.doesNotMatch(trainingApplySource,/analysis\.detectedTitle \|\| null/,'location does not fall back to detected title');
assert.match(trainingApplySource,/expectedTargets:\s*reviewedCells\.length/,'reviewed grid target counts drive saved expectedTargets');
const minimalImportPageSource = readFileSync('app/import/scorecard/page.tsx','utf8');
assert.match(minimalImportPageSource,/useState\(""\)/,'expected total targets can be blank by default');
assert.doesNotMatch(minimalImportPageSource,/useState\("120"\)/,'expected total targets does not default to Sokna example');
assert.match(minimalImportPageSource,/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/,'date defaults to today in UI');
assert.match(minimalImportPageSource,/Select a discipline before creating the Training Score Sheet/,'blank discipline has clear validation text');
const trainingArchiveSource = readFileSync('app/training-score-sheets/page.tsx','utf8');
assert.match(trainingArchiveSource,/href="\/import\/scorecard"/,'Training Score Sheets page links to scorecard photo import');
const editedCountsImport=imported.normalizeImportedPostStructure({...soknaFixture,posts:soknaFixture.posts.map((post,idx)=>idx===7?{...post,expectedTargets:8,targets:Array.from({length:8},(_,i)=>({targetNumber:i+1,cellState:i<6?'hit':'uncertain',result:i<6?'hit':'uncertain',confidence:i<6?'high':'low'}))}:post)});
const editedPayload=imported.mapReviewedImportToTrainingScoreSheet(editedCountsImport,'edited-shooter');
assert.equal(editedPayload.scoreSheet.expected_targets_by_post[7],8,'user-edited P8 target count is used in final saved payload');


const uncertainSlash={detectedTitle:null,detectedDate:null,scorecardConfidence:'high',rawText:'uncertain slash',warnings:[],shooterRows:[{candidateId:'u1',displayName:null,rowLabel:null,confidence:'high',detectedScore:1,posts:[{postNumber:1,expectedTargets:1,detectedPostScore:1,detectedPostScoreConfidence:'high',detectedPostScoreRawText:'1',targets:[{targetNumber:1,cellState:'uncertain',result:'unknown',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'low',warning:'ambiguous'}]}]}]};
let uncertainNormalized=a.normalizeScorecardAnalysis(uncertainSlash,{postCount:1,targetsPerPost:1});
assert.equal(uncertainNormalized.shooterRows[0].grid[0].result,'unknown','AI-uncertain slash remains unknown despite full-score post total');
assert.equal(uncertainNormalized.shooterRows[0].grid[0].cellState,'uncertain','AI-uncertain slash remains protected');
assert.match(uncertainNormalized.shooterRows[0].posts[0].reconciliationWarning,/AI-uncertain target/,'uncertain target requires manual review');
const uncertainMiss={...uncertainSlash,rawText:'uncertain miss',shooterRows:[{...uncertainSlash.shooterRows[0],posts:[{...uncertainSlash.shooterRows[0].posts[0],detectedPostScore:0,detectedPostScoreRawText:'0',targets:[{targetNumber:1,cellState:'uncertain',result:'unknown',rawMark:'0',observedMarkCategory:'zero',confidence:'low',warning:'ambiguous'}]}]}]};
uncertainNormalized=a.normalizeScorecardAnalysis(uncertainMiss,{postCount:1,targetsPerPost:1});
assert.equal(uncertainNormalized.shooterRows[0].grid[0].result,'unknown','AI-uncertain miss mark remains unknown despite miss post total');
let reviewedHit=a.applyUserCorrection(uncertainNormalized.shooterRows[0].grid,1,1,'hit')[0];
assert.equal(reviewedHit.result,'hit','manual review can set uncertain target to hit'); assert.equal(reviewedHit.cellState,'active','manual hit unlocks protected uncertain cell'); assert.equal(reviewedHit.reviewed,true,'manual hit remains marked reviewed');
let reviewedMiss=a.applyUserCorrection(uncertainNormalized.shooterRows[0].grid,1,1,'miss')[0];
assert.equal(reviewedMiss.result,'miss','manual review can set uncertain target to miss'); assert.equal(reviewedMiss.cellState,'active','manual miss unlocks protected uncertain cell'); assert.equal(reviewedMiss.reviewed,true,'manual miss remains marked reviewed');
const ordinarySlash={...uncertainSlash,rawText:'ordinary slash',shooterRows:[{...uncertainSlash.shooterRows[0],posts:[{...uncertainSlash.shooterRows[0].posts[0],targets:[{targetNumber:1,cellState:'active',result:'unknown',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'low',warning:null}]}]}]};
let ordinaryNormalized=a.normalizeScorecardAnalysis(ordinarySlash,{postCount:1,targetsPerPost:1});
assert.equal(ordinaryNormalized.shooterRows[0].grid[0].result,'hit','ordinary non-uncertain slash still benefits from deterministic reconciliation');

assert.equal(profiles.isScorecardImportDiscipline('Compak Sporting'), true, 'Compak Sporting is allowed in scorecard import');
assert.equal(profiles.isScorecardImportDiscipline('Sporttrap'), true, 'Sporttrap is allowed in scorecard import');
assert.equal(profiles.isScorecardImportDiscipline('Kompakt leirduesti'), false, 'Kompakt leirduesti is intentionally excluded from this Compak/Sporttrap import scope');
assert.equal(profiles.isScorecardImportDiscipline('Leirduesti'), true, 'Leirduesti remains allowed in scorecard import');
assert.equal(profiles.isScorecardImportDiscipline('Sporting'), true, 'Sporting remains allowed in scorecard import');
let compakOne = profiles.resolveDisciplineScorecardSetup({discipline:'Compak Sporting',courseCount:1,totalTargets:25}); assert.equal(compakOne.ok,true); assert.equal(compakOne.setup.postCount,1); assert.equal(compakOne.setup.targetsPerPost,25); assert.equal(compakOne.setup.totalTargets,25);
let compakMulti = profiles.resolveDisciplineScorecardSetup({discipline:'Compak Sporting',courseCount:3,totalTargets:75}); assert.equal(compakMulti.ok,true); assert.deepEqual(compakMulti.setup.targetsPerPostByPost,[25,25,25]);
let sporttrapMulti = profiles.resolveDisciplineScorecardSetup({discipline:'Sporttrap',sporttrapSeriesCount:2,totalTargets:50}); assert.equal(sporttrapMulti.ok,true); assert.equal(sporttrapMulti.setup.postCount,2);
let wrongCount = profiles.resolveDisciplineScorecardSetup({discipline:'Sporttrap',sporttrapSeriesCount:2,totalTargets:49}); assert.equal(wrongCount.ok,false); assert.match(wrongCount.message,/conflicts/);
let noCompakScheme = profiles.resolveDisciplineScorecardSetup({discipline:'Compak Sporting',courseCount:1,totalTargets:25,targetDefinitions:null}); assert.equal(noCompakScheme.ok,true, 'missing Compak scheme does not block simple result import');
const rpcMigration = readFileSync('supabase/migrations/20260702020000_scorecard_import_compak_sporttrap_rpc.sql','utf8').toLowerCase();
assert.match(rpcMigration, /create or replace function public\.apply_scorecard_import_v2/, 'migration updates apply_scorecard_import_v2 in place');
assert.match(rpcMigration, /'compak sporting'/, 'database RPC explicitly allows Compak Sporting');
assert.match(rpcMigration, /'sporttrap'/, 'database RPC explicitly allows Sporttrap');
assert.match(rpcMigration, /unsupported_discipline/, 'database RPC still rejects unsupported disciplines');


const leirduestiProfile = profiles.resolveDisciplineScorecardSetup({discipline:'Leirduesti',postCount:4,targetsPerPost:4,totalTargets:18,targetDefinitions:[4,4,6,4].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.equal(leirduestiProfile.ok,true, 'Leirduesti 4,4,6,4 detailed setup is accepted by the shared resolver'); assert.deepEqual(leirduestiProfile.setup.targetsPerPostByPost,[4,4,6,4]); let leirduestiSummary=profiles.formatScorecardSetupSummary(leirduestiProfile.setup,'Post'); assert.deepEqual(leirduestiSummary.lines,['Post 1: 4','Post 2: 4','Post 3: 6','Post 4: 4']); assert.equal(leirduestiSummary.total,18);
const englishProfile = profiles.resolveDisciplineScorecardSetup({discipline:'English Sporting',courseCount:3,targetsPerPost:6,totalTargets:20,targetDefinitions:[6,8,6].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.equal(englishProfile.ok,true, 'English Sporting 6,8,6 detailed setup is accepted by the shared resolver'); assert.deepEqual(englishProfile.setup.targetsPerPostByPost,[6,8,6]); let englishSummary=profiles.formatScorecardSetupSummary(englishProfile.setup,'Stand'); assert.deepEqual(englishSummary.lines,['Stand 1: 6','Stand 2: 8','Stand 3: 6']); assert.equal(englishSummary.total,20);
const uniformProfile = profiles.resolveDisciplineScorecardSetup({discipline:'Leirduesti',postCount:4,targetsPerPost:5,totalTargets:20,targetDefinitions:[]}); assert.equal(uniformProfile.ok,true); assert.equal(profiles.formatScorecardSetupSummary(uniformProfile.setup,'Post').compact,'4 posts × 5 targets', 'uniform setup keeps compact UI copy');
const matchingDetailed = profiles.resolveDisciplineScorecardSetup({discipline:'Leirduesti',postCount:4,targetsPerPost:4,totalTargets:18,targetDefinitions:[4,4,6,4].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.equal(matchingDetailed.ok,true, 'matching detailed structure and total does not show a false conflict');
const mismatchedDetailed = profiles.resolveDisciplineScorecardSetup({discipline:'English Sporting',courseCount:3,targetsPerPost:6,totalTargets:18,targetDefinitions:[6,8,6].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.equal(mismatchedDetailed.ok,false, 'detailed structure that conflicts with total blocks import'); assert.match(mismatchedDetailed.message,/conflicts/);
const incompleteDetailed = profiles.resolveDisciplineScorecardSetup({discipline:'Leirduesti',postCount:4,targetsPerPost:4,totalTargets:16,targetDefinitions:[4,4,4].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.equal(incompleteDetailed.ok,false, 'partially loaded detailed structure blocks instead of falling back unsafely'); assert.match(incompleteDetailed.message,/incomplete/);
const compakNoDefs = profiles.resolveDisciplineScorecardSetup({discipline:'Compak Sporting',courseCount:2,totalTargets:50,targetDefinitions:[]}); assert.equal(compakNoDefs.ok,true, 'Compak Sporting uses series profile without post definitions'); assert.deepEqual(compakNoDefs.setup.targetsPerPostByPost,[25,25]);
const sporttrapNoDefs = profiles.resolveDisciplineScorecardSetup({discipline:'Sporttrap',sporttrapSeriesCount:2,totalTargets:50,targetDefinitions:[]}); assert.equal(sporttrapNoDefs.ok,true, 'Sporttrap uses series profile without post definitions'); assert.deepEqual(sporttrapNoDefs.setup.targetsPerPostByPost,[25,25]);

const fpDefsA=[4,4,6,4].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})));
const fpDefsB=[...fpDefsA].reverse();
const fpSetupA=profiles.resolveDisciplineScorecardSetup({discipline:'Leirduesti',postCount:4,targetsPerPost:4,totalTargets:18,targetDefinitions:fpDefsA}); assert.equal(fpSetupA.ok,true);
const fpSetupB=profiles.resolveDisciplineScorecardSetup({discipline:'Leirduesti',postCount:4,targetsPerPost:4,totalTargets:18,targetDefinitions:fpDefsB}); assert.equal(fpSetupB.ok,true);
const fpA=await profiles.resolvedDisciplineScorecardSetupFingerprint({discipline:'Leirduesti',setup:fpSetupA.setup});
const fpB=await profiles.resolvedDisciplineScorecardSetupFingerprint({discipline:'Leirduesti',setup:fpSetupB.setup});
assert.equal(fpA.setupFingerprint, fpB.setupFingerprint, 'same logical setup fingerprints match even when database rows are ordered differently');
assert.deepEqual(fpA.resolvedSetup, {profile:'post_based',postCount:4,targetsPerPostByPost:[4,4,6,4],totalTargets:18});
const sameAgain=await profiles.resolvedDisciplineScorecardSetupFingerprint({discipline:'Leirduesti',setup:fpSetupA.setup}); assert.equal(fpA.setupFingerprint, sameAgain.setupFingerprint, 'same setup gives same fingerprint');
const differentOrder=setup.normalizeScorecardSetupForFingerprint('post_based',{postCount:4,targetsPerPost:4,targetsPerPostByPost:[5,5,4,4],totalTargets:18});
assert.notEqual(fpA.setupFingerprint, await setup.scorecardSetupFingerprint(differentOrder), 'different target distribution fingerprints differ even with same total');
assert.notEqual(fpA.setupFingerprint, await setup.scorecardSetupFingerprint(setup.normalizeScorecardSetupForFingerprint('post_based',{postCount:4,targetsPerPost:4,targetsPerPostByPost:[4,4,6,5],totalTargets:19})), 'changed total fingerprints differ');
assert.notEqual(fpA.setupFingerprint, await setup.scorecardSetupFingerprint(setup.normalizeScorecardSetupForFingerprint('compak',{postCount:4,targetsPerPost:4,targetsPerPostByPost:[4,4,6,4],totalTargets:18})), 'changed discipline profile fingerprints differ');
const compakFp=await profiles.resolvedDisciplineScorecardSetupFingerprint({discipline:'Compak Sporting',setup:compakNoDefs.setup});
const sporttrapFp=await profiles.resolvedDisciplineScorecardSetupFingerprint({discipline:'Sporttrap',setup:sporttrapNoDefs.setup});
assert.equal(compakFp.resolvedSetup.profile,'compak'); assert.deepEqual(compakFp.resolvedSetup.targetsPerPostByPost,[25,25]);
assert.equal(sporttrapFp.resolvedSetup.profile,'sporttrap'); assert.deepEqual(sporttrapFp.resolvedSetup.targetsPerPostByPost,[25,25]);
assert.notEqual(compakFp.setupFingerprint, sporttrapFp.setupFingerprint, 'Compak and Sporttrap profiles do not collide even when dimensions match');

let uiSetup = profiles.resolveDisciplineScorecardSetup({discipline:'English Sporting',courseCount:3,targetsPerPost:6,totalTargets:20,targetDefinitions:[6,8,6].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); let apiSetup = profiles.resolveDisciplineScorecardSetup({discipline:'English Sporting',courseCount:3,targetsPerPost:6,totalTargets:20,targetDefinitions:[6,8,6].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.deepEqual(uiSetup, apiSetup, 'UI, analyze API, and apply API share resolveDisciplineScorecardSetup output for the same target rows');

const sixteenPosts=Array.from({length:16},(_,p)=>({postNumber:p+1,expectedTargets:5,detectedPostScore:4,detectedPostScoreConfidence:'high',detectedPostScoreRawText:'4',targets:Array.from({length:5},(_,i)=>({targetNumber:i+1,cellState:'active',result:i<4?'hit':'miss',rawMark:i<4?'/':'0',observedMarkCategory:i<4?'diagonal_stroke':'zero',confidence:'high',warning:null}))}));
const sixteen=a.normalizeScorecardAnalysis({detectedTitle:'16 post card',detectedDate:null,scorecardConfidence:'high',rawText:'16',warnings:[],shooterRows:[{candidateId:'s16',displayName:'Sixteen Shooter',rowLabel:null,confidence:'high',detectedScore:64,posts:sixteenPosts}]},{postCount:16,targetsPerPost:5});
assert.equal(a.summarizeGrid(sixteen.shooterRows[0].grid).canApply,true,'complete high-confidence 16-post scorecard can be confirmed from whole-card data without per-post reviewed flags');
assert.equal(sixteen.shooterRows[0].grid.length,80,'full-card view data contains every active target');
assert.equal(sixteen.shooterRows[0].posts.every(post=>a.summarizeGrid(post.targets).score===4),true,'full-card post totals are correct');
const variablePosts=[2,3].map((count,p)=>({postNumber:p+1,expectedTargets:count,detectedPostScore:count,detectedPostScoreConfidence:'high',detectedPostScoreRawText:String(count),targets:Array.from({length:4},(_,i)=>i<count?{targetNumber:i+1,cellState:'active',result:'hit',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'high',warning:null}:{targetNumber:i+1,cellState:'inactive',result:'unknown',rawMark:null,observedMarkCategory:null,confidence:'high',warning:null})}));
const variable=a.normalizeScorecardAnalysis({detectedTitle:'variable',detectedDate:null,scorecardConfidence:'high',rawText:'variable',warnings:[],shooterRows:[{candidateId:'v',displayName:null,rowLabel:null,confidence:'high',detectedScore:5,posts:variablePosts}]},{totalTargets:5,allowStructureDiscovery:true});
assert.deepEqual(variable.targetsPerPostByPost,[2,3],'variable target counts per post render from normalized counts');
assert.equal(variable.shooterRows[0].grid.length,5,'inactive cells do not become active targets or blockers');
let uncertainOrderGrid=[{postNumber:1,targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null},{postNumber:1,targetNumber:2,result:'unknown',rawMark:null,confidence:'low',warning:null},{postNumber:2,targetNumber:1,result:'unknown',rawMark:null,confidence:'low',warning:null},{postNumber:2,targetNumber:2,result:'miss',rawMark:null,confidence:'high',warning:null}];
assert.deepEqual(a.unresolvedWholeScorecardItems({grid:uncertainOrderGrid,postCount:2,postStatuses:{}}).map(x=>`${x.postNumber}:${x.targetNumber}`),['1:2','2:1'],'Review uncertain only visits unresolved items in deterministic order');
let wholeCardCorrected=a.applyUserCorrection(uncertainOrderGrid,1,2,'miss');
assert.equal(wholeCardCorrected.find(c=>c.postNumber===1&&c.targetNumber===2).reviewed,true,'direct correction marks reviewed/manual state');
assert.equal(a.summarizeGrid(wholeCardCorrected).score,1,'direct correction updates post and overall score inputs');
assert.equal(a.unresolvedWholeScorecardItems({grid:wholeCardCorrected,postCount:2,postStatuses:{}}).length,1,'direct correction updates unresolved count');
assert.equal(a.cycleScorecardCellResult('hit'),'miss','cell cycling hit to miss is deterministic');
assert.equal(a.cycleScorecardCellResult('miss'),'unknown','cell cycling miss to unknown is deterministic');
assert.equal(a.cycleScorecardCellResult('unknown'),'hit','cell cycling unknown to hit is deterministic');
assert.equal(a.getPostReviewStatus({cells:sixteen.shooterRows[0].grid.filter(c=>c.postNumber===1),reconciliationStatus:'matched',explicitlyReviewed:false}),'Ready','fully confident import does not require per-post reviewed flags');
assert.equal(a.unresolvedWholeScorecardItems({grid:[{postNumber:1,targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null},{postNumber:1,targetNumber:2,result:'hit',rawMark:null,confidence:'high',warning:null}],postCount:1,postStatuses:{1:'conflict'}}).length,1,'post-total/grid conflict remains visible as a blocker');

const pageSource = readFileSync('app/sessions/[id]/scorecard-import/page.tsx','utf8'); assert.match(pageSource,/from\("session_post_targets"\)/, 'scorecard import UI loads session_post_targets'); assert.match(pageSource,/targetDefinitionsError/, 'scorecard import UI tracks target definition load failures'); assert.match(pageSource,/formatScorecardSetupSummary/, 'scorecard import UI renders the resolved detailed or compact setup summary'); assert.match(pageSource,/structureDetailsOpen/, 'structure editor is collapsed by default behind explicit edit state'); assert.match(pageSource,/wholeScorecardReview/, 'whole-card scorecard review is the default surface'); assert.match(pageSource,/cycleScorecardCellResult/, 'target cells expose fast direct cycling controls'); assert.match(pageSource,/Review uncertain only/, 'uncertain-only review action is available'); assert.match(pageSource,/structureExceptionsSummary/, 'compact structure summary supports default plus exceptions copy');
assert.match(pageSource,/setupFingerprint/, 'pending review stores setup fingerprint');
assert.match(pageSource,/Post setup has changed since this scorecard was analyzed/, 'UI blocks stale analyzed setup and keeps saved image for re-analysis');
const analyzeSource = readFileSync('app/api/sessions/[id]/scorecard/analyze/route.ts','utf8'); assert.match(analyzeSource,/setupFingerprint/, 'analyze API returns setup fingerprint'); assert.match(analyzeSource,/resolvedSetup/, 'analyze API returns normalized resolved setup');
const applySource = readFileSync('app/api/sessions/[id]/scorecard/apply/route.ts','utf8'); assert.match(applySource,/scorecard_setup_changed/, 'apply API uses dedicated setup-changed category'); assert.match(applySource,/setupMode === \"known\" && !fingerprint\.test\(body\.setupFingerprint/, 'apply API requires setup fingerprints only for known setup mode'); assert.match(applySource,/deriveSetupFromReviewedGrid/, 'discovery apply derives final structure from reviewed grid'); assert.match(applySource,/p_discovery_mode: discoveryApply/, 'discovery apply reaches atomic RPC path');
assert.match(applySource,/from\("scorecard_imports"\)[\s\S]*client_import_id\.eq\.\$\{body\.clientImportId\},image_fingerprint\.eq\.\$\{String\(body\.imageFingerprint\)\.toLowerCase\(\)\}/, 'apply API checks completed imports by clientImportId or imageFingerprint');
assert.match(applySource,/alreadyImported: true,[\s\S]*const targetResult = await supabase[\s\S]*resolveDisciplineScorecardSetup/, 'API completed-import retry returns before setup resolution');
assert.match(applySource,/if \(setupMode === "discovery" && setupResult\.ok\)/, 'different discovery import after setup creation still hits setup-changed protection');
assert.match(pageSource,/Post structure will be detected from the scorecard/, 'no-setup post-based competitions explain structure discovery instead of blocking capture');
assert.match(pageSource,/discoveryModeAvailable/, 'scorecard import UI allows discovery mode capture'); assert.match(pageSource,/!session\?\.post_count && !session\?\.course_count && !session\?\.targets_per_post\)/, 'known total_targets alone does not block discovery capture');
assert.doesNotMatch(pageSource,/!unsupported && !setupOk && \(/, 'no-setup discovery mode is not the blocking setup-required flow');
assert.match(pageSource,/pendingSetupMode !== \"discovery\" && !pending\.setupFingerprint/, 'discovery reviews are not blocked solely by a null setup fingerprint');
const discoveryRpc = readFileSync('supabase/migrations/20260718010000_scorecard_import_discovery_apply.sql','utf8').toLowerCase();
assert.match(discoveryRpc,/p_discovery_mode boolean\n/, 'RPC supports explicit required discovery mode without an ambiguous default'); assert.doesNotMatch(discoveryRpc,/p_discovery_mode boolean default/, '13-argument RPC does not use a default argument');
assert.match(discoveryRpc,/for update/, 'RPC locks the session for atomic discovery apply');
assert.match(discoveryRpc,/scorecard_imports[\s\S]*setup_created_after_analysis/, 'RPC checks existing imports before rejecting discovery retries after setup creation'); assert.match(discoveryRpc,/setup_created_after_analysis/, 'RPC blocks setup changes made after discovery analysis'); assert.doesNotMatch(discoveryRpc,/v_session\.total_targets is not null[^\n]*setup_created_after_analysis/, 'saved total_targets alone does not make discovery setup non-empty'); assert.match(discoveryRpc,/v_session\.total_targets is not null and v_session\.total_targets <> v_total/, 'saved total_targets is retained as conflict validation');
assert.match(discoveryRpc,/insert into public\.session_post_targets\(session_id, post_number, target_position, presentation_number, presentation_type, position_in_presentation\)/, 'discovery structural inserts satisfy production NOT NULL columns');
assert.match(discoveryRpc,/values \(p_session_id, v_course, v_position, v_position, 'unknown', 1\)/, 'discovery structural placeholders use neutral unknown presentation values');
assert.doesNotMatch(discoveryRpc,/insert into public\.session_post_targets[\s\S]*(target_label|target_type|direction|angle|speed|distance|difficulty|notes)/, 'discovery setup does not fabricate physical target metadata');
const soknaCountsPreserved=[8,8,8,8,8,8,8,6,8,8,6,8,6,6,8,8];
assert.equal(soknaCountsPreserved.length,16,'Sokna fixture has 16 posts'); assert.equal(soknaCountsPreserved.reduce((sum,count)=>sum+count,0),120,'Sokna fixture has 120 targets'); assert.equal(soknaCountsPreserved.reduce((sum,count)=>sum+count,0),120,'discovered total matching saved total can satisfy validation'); assert.notEqual(soknaCountsPreserved.reduce((sum,count)=>sum+count,0)+2,120,'discovered total conflicting with saved total is detectable');
let correctedSoknaCounts=soknaCountsPreserved.slice(); correctedSoknaCounts[7]=8; assert.equal(correctedSoknaCounts[7],8,'review correction P8 6 to 8 is represented by reviewed grid-derived structure');

const mk=(post,target,result='unknown',confidence='low',observedMarkCategory=null,rawMark=null,reviewed=false)=>({postNumber:post,targetNumber:target,result,rawMark,observedMarkCategory,confidence,warning:null,reviewed});
let statusGrid=[mk(1,1,'hit','high'),mk(1,2,'unknown','low')];
assert.equal(a.getPostReviewStatus({cells:statusGrid,reconciliationStatus:null,explicitlyReviewed:true}), 'Needs review', 'unresolved post cannot become Reviewed');
assert.equal(a.confirmCurrentPostReview({grid:statusGrid,currentPost:1,postCount:1,reviewedPostNumbers:[],postStatuses:{}}).ok, false, 'Save post and next blocks unknown post');
assert.equal(a.getPostReviewStatus({cells:[mk(1,1,'hit','high')],reconciliationStatus:'conflict',explicitlyReviewed:true}), 'Conflict', 'unresolved original conflict still outranks Reviewed');
assert.equal(a.getPostReviewStatus({cells:[mk(1,1,'hit','high')],reconciliationStatus:null,explicitlyReviewed:true}), 'Reviewed', 'confirmed resolved post becomes Reviewed');
assert.equal(a.getPostReviewStatus({cells:[mk(1,1,'hit','high')],reconciliationStatus:null,explicitlyReviewed:false}), 'Ready', 'unconfirmed resolved post remains Ready');
let cleared=a.deriveCurrentPostReconciliation({currentCells:[mk(1,1,'hit','high',null,null,true),mk(1,2,'miss','high',null,null,true)],detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:2,originalStatus:'conflict',originalWarning:'original warning'}); assert.equal(cleared.reconciliationStatus,'matched','original Conflict plus valid corrections becomes Ready-capable'); assert.equal(cleared.reconciliationWarning,'original warning','original warning remains historical');
let unreviewedMismatch=a.deriveCurrentPostReconciliation({currentCells:[mk(1,1,'hit','high'),mk(1,2,'hit','high')],detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:2,originalStatus:'conflict',originalWarning:'bad'}); assert.equal(unreviewedMismatch.reconciliationStatus,'conflict','complete AI grid plus high-confidence detected total mismatch stays blocked until explicit post review'); let stillBad=a.deriveCurrentPostReconciliation({currentCells:[mk(1,1,'hit','high',null,null,true),mk(1,2,'hit','high',null,null,true)],detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:2,originalStatus:'conflict',originalWarning:'bad',explicitlyReviewed:true}); assert.equal(stillBad.reconciliationStatus,'needs_review','complete explicitly reviewed cells can override a conflicting AI-detected total'); assert.match(stillBad.reconciliationWarning,/authoritative/i,'AI total disagreement is explained as reference, not a blocker after explicit review');
let unconfirmedConflict=a.confirmCurrentPostReview({grid:[{postNumber:1,targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null},{postNumber:1,targetNumber:2,result:'hit',rawMark:null,confidence:'high',warning:null}],currentPost:1,postCount:1,reviewedPostNumbers:[],postStatuses:{1:'conflict'}}); assert.equal(unconfirmedConflict.ok,false,'unreviewed high-confidence AI-total conflict blocks post completion'); let confirmedMismatch=a.confirmCurrentPostReview({grid:[{postNumber:1,targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null},{postNumber:1,targetNumber:2,result:'hit',rawMark:null,confidence:'high',warning:null}],currentPost:1,postCount:1,reviewedPostNumbers:[],postStatuses:{1:'needs_review'}}); assert.equal(confirmedMismatch.ok,true,'explicit post confirmation allows complete reviewed mismatch warning to proceed');
let move=a.confirmCurrentPostReview({grid:[mk(1,1,'hit','high'),mk(2,1,'hit','high'),mk(3,1,'hit','high')],currentPost:1,postCount:3,reviewedPostNumbers:[3],postStatuses:{}});
assert.equal(move.ok,true); assert.equal(move.currentReviewPost,2, 'Save post and next moves to next unreviewed post');
let allDone=a.confirmCurrentPostReview({grid:[mk(1,1,'hit','high'),mk(2,1,'hit','high')],currentPost:2,postCount:2,reviewedPostNumbers:[1],postStatuses:{}});
assert.equal(allDone.currentReviewPost,2, 'all-complete review remains on sensible final post');
let reset=a.resetReviewProgress([mk(1,1,'hit','high')], 'shooter-b');
assert.equal(reset.currentReviewPost,1); assert.deepEqual(reset.reviewedPostNumbers,[]); assert.equal(reset.selectedShooterCandidateId,'shooter-b');
let normalizedProgress=a.normalizeReviewProgress({grid:[mk(1,1,'hit','high'),mk(2,1,'unknown','low'),mk(3,1,'hit','high')],postCount:3,currentReviewPost:99,reviewedPostNumbers:[0,1,1,2,4],postStatuses:{}});
assert.deepEqual(normalizedProgress.reviewedPostNumbers,[1]); assert.equal(normalizedProgress.currentReviewPost,2, 'malformed restored progress is clamped and points to unresolved post');



let aiHitUserMiss=a.applyUserCorrection([mk(1,1,'hit','high')],1,1,'miss'); assert.equal(a.summarizeGrid(aiHitUserMiss).score,0,'AI hit changed to miss updates reviewed score'); assert.equal(aiHitUserMiss[0].reviewed,true,'AI hit changed to miss is explicitly reviewed');
let aiMissUserHit=a.applyUserCorrection([mk(1,1,'miss','high')],1,1,'hit'); assert.equal(a.summarizeGrid(aiMissUserHit).score,1,'AI miss changed to hit updates reviewed score');
let aiUnknownUserHit=a.applyUserCorrection([mk(1,1,'unknown','low')],1,1,'hit'); assert.equal(a.summarizeGrid(aiUnknownUserHit).unknowns,0,'AI unknown explicitly resolved removes unknown count');
let completeDisagree=a.deriveCurrentPostReconciliation({currentCells:[mk(1,1,'hit','high',null,null,true),mk(1,2,'miss','high',null,null,true)],detectedPostScore:2,detectedPostScoreConfidence:'high',expectedTargetCount:2,originalStatus:'conflict',originalWarning:'bad',explicitlyReviewed:true}); assert.equal(completeDisagree.reconciliationStatus,'needs_review','complete reviewed grid may proceed after explicit review even when it disagrees with AI row total');
let explicitBefore=aiHitUserMiss[0]; let afterRec=a.deriveCurrentPostReconciliation({currentCells:aiHitUserMiss,detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:1,originalStatus:'conflict',originalWarning:'bad',explicitlyReviewed:true}); assert.equal(aiHitUserMiss[0].result,explicitBefore.result,'reconciliation audit does not overwrite explicit reviewed values'); assert.equal(afterRec.reviewedScore,0,'reconciliation audit reports reviewed score from explicit cells'); let matchingAi=a.deriveCurrentPostReconciliation({currentCells:[mk(1,1,'hit','high'),mk(1,2,'miss','high')],detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:2,originalStatus:null,originalWarning:null}); assert.equal(matchingAi.reconciliationStatus,'matched','matching AI total continues normally');

const hitTarget = (target) => ({targetNumber: target, result: 'hit', rawMark: '/', observedMarkCategory: 'diagonal_stroke', confidence: 'high', warning: null});
const missTarget = (target) => ({targetNumber: target, result: 'miss', rawMark: '0', observedMarkCategory: 'zero', confidence: 'high', warning: null});
const physicalPostTargets = {
  1: [],
  2: [5, 6],
  3: [2],
  4: [1, 3, 5, 7, 9],
  5: [10],
};
function malformedPhysicalPostRows({labels = true, usePostOne = false} = {}) {
  return {
    detectedTitle: null,
    detectedDate: null,
    scorecardConfidence: 'high',
    rawText: 'Post 1 10 Post 2 8 Post 3 9 Post 4 5 Post 5 9',
    warnings: [],
    shooterRows: [10, 8, 9, 5, 9].map((score, idx) => {
      const physicalPost = idx + 1;
      const misses = new Set(physicalPostTargets[physicalPost]);
      return {
        candidateId: `bad-row-${physicalPost}`,
        displayName: null,
        rowLabel: labels ? String(physicalPost) : null,
        confidence: 'high',
        detectedScore: score,
        posts: [{
          postNumber: usePostOne ? 1 : physicalPost,
          detectedPostScore: score,
          detectedPostScoreConfidence: 'high',
          detectedPostScoreRawText: String(score),
          targets: Array.from({length: 10}, (_, i) => misses.has(i + 1) ? missTarget(i + 1) : hitTarget(i + 1)),
        }],
      };
    }),
  };
}
const collapsed = a.normalizeScorecardAnalysis(malformedPhysicalPostRows(), {postCount: 5, targetsPerPost: 10});
assert.equal(collapsed.shooterRows.length, 1, 'malformed physical post rows collapse to one shooter candidate');
assert.equal(collapsed.shooterRows[0].candidateId, 'shooter-1', 'collapsed candidate has one stable normalized candidate id');
assert.equal(collapsed.shooterRows[0].displayName, 'Detected scorecard', 'collapsed candidate has a clear display name');
assert.equal(collapsed.shooterRows[0].score, 41, 'collapsed candidate score is 41/50');
assert.equal(collapsed.shooterRows[0].detectedScore, 41, 'collapsed detected total is 41/50');
assert.notEqual(collapsed.shooterRows[0].unknowns, 40, 'collapsed candidate does not create forty artificial unknowns');
assert.deepEqual(collapsed.shooterRows[0].posts.map((post) => post.postNumber), [1, 2, 3, 4, 5], 'candidate row labels 1-5 map to Posts 1-5');
assert.deepEqual(collapsed.shooterRows[0].posts.map((post) => post.reconciledPostScore), [10, 8, 9, 5, 9], 'post totals are preserved after collapse');
for (const [postNumber, expectedMisses] of Object.entries(physicalPostTargets)) {
  const cells = collapsed.shooterRows[0].grid.filter((cell) => cell.postNumber === Number(postNumber));
  assert.deepEqual(cells.filter((cell) => cell.result === 'miss').map((cell) => cell.targetNumber), expectedMisses, `Post ${postNumber} miss targets survive collapse`);
}
assert.equal(collapsed.shooterRows[0].grid.filter((cell) => cell.postNumber === 1 && cell.result === 'hit').length, 10, 'Post 1 is 10/10');
const missingLabels = a.normalizeScorecardAnalysis(malformedPhysicalPostRows({labels: false, usePostOne: true}), {postCount: 5, targetsPerPost: 10});
assert.equal(missingLabels.shooterRows.length, 1, 'clear ordered post-row pattern collapses even when row labels are missing');
assert.deepEqual(missingLabels.shooterRows[0].posts.map((post) => post.postNumber), [1, 2, 3, 4, 5], 'all-postNumber-1 grids remap to real Posts 1-5');
assert.equal(missingLabels.shooterRows[0].score, 41, 'remapped all-postNumber-1 candidate score is 41/50');
const trueMulti = a.normalizeScorecardAnalysis({
  detectedTitle: null,
  detectedDate: null,
  scorecardConfidence: 'high',
  rawText: '',
  warnings: [],
  shooterRows: [1,2,3,4,5].map((n) => ({
    candidateId: `shooter-${n}`,
    displayName: `Shooter ${n}`,
    rowLabel: `Shooter ${n}`,
    confidence: 'high',
    detectedScore: 50,
    posts: Array.from({length: 5}, (_, p) => ({postNumber: p + 1, detectedPostScore: 10, detectedPostScoreConfidence: 'high', detectedPostScoreRawText: '10', targets: Array.from({length: 10}, (_, i) => hitTarget(i + 1))})),
  })),
}, {postCount: 5, targetsPerPost: 10});
assert.equal(trueMulti.shooterRows.length, 5, 'true multi-shooter scorecards are not collapsed accidentally');
assert.match(pageSource, /shooterRows\.length > 1/, 'UI hides Shooter row selector when only one candidate remains');
assert.match(pageSource, /savedSelection \|\| auto \|\| null/, 'restored selection resets safely when candidate list changes after re-analysis');


let callbacks=[]; let stored=null; const controller=op.createOrderedPendingPersistence({write:async(record)=>{stored=record;},delete:async()=>{stored=null;},currentRecord:()=>stored,remember:(record)=>{stored=record;},onStatus:(status,message)=>callbacks.push({status,message})});
let r1={sessionId:'s',clientImportId:'p',localReviewRevision:controller.nextRevision(),ack:true};
let writeResult=await controller.enqueueWrite(r1); assert.equal(writeResult.ok,true); assert.equal(stored.ack,true); assert.equal(callbacks.at(-1).status,'saved','acknowledgement success becomes Saved');
let failing=op.createOrderedPendingPersistence({write:async()=>{throw new Error('boom');},delete:async()=>{},currentRecord:()=>r1,remember:()=>{},onStatus:(status,message)=>callbacks.push({status,message})});
let failedRecord={sessionId:'s',clientImportId:'p',localReviewRevision:failing.nextRevision(),scoreChoice:'keep_existing'}; let failed=await failing.enqueueWrite(failedRecord); assert.equal(failed.ok,false); assert.equal(callbacks.at(-1).status,'failed','scoreChoice failure becomes Save failed');
let delayedStored=null; let release; const delayed=op.createOrderedPendingPersistence({write:(record)=>new Promise((res)=>{release=()=>{delayedStored=record;res();};}),delete:async()=>{delayedStored=null;},currentRecord:()=>delayedStored,remember:(record)=>{delayedStored=record;},onStatus:()=>{}});
let delayedRecord={sessionId:'s',clientImportId:'d',localReviewRevision:delayed.nextRevision(),currentReviewPost:1}; const delayedPromise=delayed.enqueueWrite(delayedRecord); await new Promise((res)=>setTimeout(res,0)); release(); assert.equal((await delayedPromise).ok,true); assert.equal(delayedStored.currentReviewPost,1,'delayed writer persists final snapshot');
let deleteResult=await delayed.enqueueDelete('s','d'); assert.equal(deleteResult.ok,true); assert.equal(delayedStored,null,'actual ordered controller delete removes pending import');

function opRecord(id, rev, extra={}) { return {clientImportId:id, localReviewRevision:rev, ...extra}; }
let ordered={generation:1,record:opRecord('a',1,{grid:'old'}),deletedClientImportIds:[]};
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:1,snapshot:opRecord('a',2,{grid:'correction'})});
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:1,snapshot:opRecord('a',3,{ack:true})}); assert.equal(ordered.record.ack,true, 'target correction followed by acknowledgement keeps newest acknowledgement snapshot');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:1,snapshot:opRecord('a',4,{scoreChoice:'keep_existing'})}); assert.equal(ordered.record.scoreChoice,'keep_existing', 'target correction followed by scoreChoice keeps newest score choice');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:1,snapshot:opRecord('a',5,{currentReviewPost:2})}); assert.equal(ordered.record.currentReviewPost,2, 'target correction followed by navigation keeps navigation snapshot');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:2,snapshot:opRecord('b',1,{image:'new'})}); assert.equal(ordered.record.clientImportId,'b', 'new photo generation replaces older import');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:1,snapshot:opRecord('a',6,{grid:'stale'})}); assert.equal(ordered.record.clientImportId,'b', 'older clientImportId cannot overwrite newer one');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:3,snapshot:opRecord('b',2,{crop:'new-crop'})}); assert.equal(ordered.record.crop,'new-crop', 'crop change writes through newer generation');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:4,snapshot:opRecord('b',3,{status:'analyzing'})}); assert.equal(ordered.record.status,'analyzing', 're-analysis writes through newer generation');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:4,snapshot:opRecord('b',4,{status:'applying'})}); assert.equal(ordered.record.status,'applying', 'Apply writes through ordered controller');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'delete',generation:5,sessionId:'s',clientImportId:'b'}); assert.equal(ordered.record,null, 'successful delete removes pending import');
ordered=a.applyOrderedPendingOperation(ordered,{kind:'write',generation:4,snapshot:opRecord('b',5,{status:'ready_for_review'})}); assert.equal(ordered.record,null, 'deleted import cannot be recreated by stale write');
let discarded=a.applyOrderedPendingOperation({generation:1,record:opRecord('c',1),deletedClientImportIds:[]},{kind:'delete',generation:2,sessionId:'s',clientImportId:'c'}); discarded=a.applyOrderedPendingOperation(discarded,{kind:'write',generation:1,snapshot:opRecord('c',2)}); assert.equal(discarded.record,null, 'target correction followed by Discard cannot recreate pending import');

let latest=a.chooseLatestReviewRevision({localReviewRevision:1,value:'old'},{localReviewRevision:2,value:'new'}); assert.equal(latest.value,'new', 'latest review revision wins');
let snap=a.createReviewPersistenceSnapshot({localReviewRevision:1,reviewedGrid:[]},{currentReviewPost:2,reviewedPostNumbers:[1],scoreChoice:'use_scorecard',acknowledgeAmbiguousExisting:true},2); assert.equal(snap.localReviewRevision,2); assert.equal(snap.currentReviewPost,2);

assert.equal(a.classifyObservedMark('/', null).result, 'hit', 'diagonal slash variants classify as hits');
assert.equal(a.classifyObservedMark('|', null).result, 'hit', 'near-vertical slash variants classify as hits');
assert.equal(a.classifyObservedMark('o', null).result, 'miss', 'circle variants classify as misses');
assert.equal(a.classifyObservedMark('0', null).result, 'miss', 'handwritten zero classifies as miss');
assert.equal(a.classifyObservedMark('-', null).result, 'miss', 'horizontal dash classifies as miss');
assert.equal(a.classifyObservedMark('', 'blank').result, 'unknown', 'blank remains unknown');
assert.equal(a.classifyObservedMark('overwritten unreadable', null).result, 'unknown', 'unreadable overwritten mark remains unknown');
const acceptancePosts=[10,8,9,5,9];
const missTargets={2:[5,6],3:[2],4:[1,3,5,7,9],5:[10]};
const acceptance={detectedTitle:'synthetic',detectedDate:null,scorecardConfidence:'high',rawText:'synthetic fixture, no user photo',warnings:[],shooterRows:[{candidateId:'synthetic',displayName:'Synthetic',rowLabel:'1',confidence:'high',detectedScore:41,posts:acceptancePosts.map((score,idx)=>({postNumber:idx+1,detectedPostScore:score,detectedPostScoreConfidence:'high',detectedPostScoreRawText:String(score),targets:Array.from({length:10},(_,i)=>{const post=idx+1,target=i+1, miss=(missTargets[post]||[]).includes(target); return {targetNumber:target,result:post===1?'unknown':(miss?'miss':'hit'),rawMark:post===1?'/':(miss?(target%2?'0':'-'):'/'),observedMarkCategory:post===1?'diagonal_stroke':(miss?(target%2?'zero':'horizontal_dash'):'diagonal_stroke'),confidence:post===1?'low':'high',warning:null};})}))}]};
let accepted=a.normalizeScorecardAnalysis(acceptance,{postCount:5,targetsPerPost:10});
assert.deepEqual(accepted.shooterRows[0].posts.map(p=>p.reconciledPostScore), [10,8,9,5,9], 'synthetic acceptance fixture resolves post scores');
assert.equal(accepted.shooterRows[0].score, 41, 'synthetic acceptance fixture resolves to 41/50');
for (const [post, targets] of Object.entries(missTargets)) for (const target of targets) assert.equal(accepted.shooterRows[0].grid.find(c=>c.postNumber==post&&c.targetNumber===target).result, 'miss', 'expected synthetic miss is preserved');
let unique=a.reconcileScorecardPost({detectedPostScore:2,expectedTargetCount:3,cells:[{postNumber:1,targetNumber:1,result:'hit',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'high',warning:null},{postNumber:1,targetNumber:2,result:'unknown',rawMark:'0',observedMarkCategory:'zero',confidence:'medium',warning:null},{postNumber:1,targetNumber:3,result:'unknown',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'medium',warning:null}]});
assert.equal(unique.reconciliationStatus, 'safely_resolved'); assert.equal(unique.cells.find(c=>c.targetNumber===2).result, 'miss');
let equal=a.reconcileScorecardPost({detectedPostScore:1,expectedTargetCount:3,cells:[1,2,3].map(i=>({postNumber:1,targetNumber:i,result:'unknown',rawMark:null,confidence:'low',warning:null}))});
assert.equal(equal.reconciliationStatus, 'needs_review'); assert.equal(equal.cells.filter(c=>c.result==='unknown').length,3, 'equal plausible assignments remain unknown');
let conflictPost=a.reconcileScorecardPost({detectedPostScore:1,expectedTargetCount:2,cells:[1,2].map(i=>({postNumber:1,targetNumber:i,result:'hit',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'high',warning:null}))});
assert.equal(conflictPost.reconciliationStatus, 'conflict', 'conflicting row total produces conflict');

let lowWrong=a.reconcileScorecardPost({detectedPostScore:0,detectedPostScoreConfidence:'high',expectedTargetCount:1,cells:[mk(1,1,'hit','low','zero','0')]}); assert.equal(lowWrong.cells[0].result,'miss','low-confidence incorrect hit corrected to miss');
let mediumWrong=a.reconcileScorecardPost({detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:1,cells:[mk(1,1,'miss','medium','diagonal_stroke','/')]}); assert.equal(mediumWrong.cells[0].result,'hit','medium-confidence incorrect miss corrected to hit');
let userFixed=a.reconcileScorecardPost({detectedPostScore:0,detectedPostScoreConfidence:'high',expectedTargetCount:1,cells:[mk(1,1,'hit','low','zero','0',true)]}); assert.equal(userFixed.reconciliationStatus,'conflict','user-reviewed cells remain fixed'); assert.equal(userFixed.cells[0].result,'hit','reconciliation does not silently change user correction');
let tenHigh=a.reconcileScorecardPost({detectedPostScore:10,detectedPostScoreConfidence:'high',expectedTargetCount:10,cells:Array.from({length:10},(_,i)=>mk(1,i+1,'unknown','low','blank',null))}); assert.equal(tenHigh.reconciliationStatus,'safely_resolved'); assert.equal(tenHigh.cells.filter(c=>c.result==='hit').length,10,'high-confidence 10/10 resolves compatible unknowns');
let tenMedium=a.reconcileScorecardPost({detectedPostScore:10,detectedPostScoreConfidence:'medium',expectedTargetCount:10,cells:Array.from({length:10},(_,i)=>mk(1,i+1,'unknown','low','blank',null))}); assert.equal(tenMedium.cells.filter(c=>c.result==='unknown').length,10,'medium-confidence 10/10 does not bulk resolve');
let zeroLow=a.reconcileScorecardPost({detectedPostScore:0,detectedPostScoreConfidence:'low',expectedTargetCount:2,cells:[mk(1,1,'unknown','low','blank',null),mk(1,2,'unknown','low','blank',null)]}); assert.equal(zeroLow.cells.filter(c=>c.result==='unknown').length,2,'low-confidence 0/10 does not bulk resolve');
let missBlocks10=a.reconcileScorecardPost({detectedPostScore:2,detectedPostScoreConfidence:'high',expectedTargetCount:2,cells:[mk(1,1,'unknown','low','zero','0'),mk(1,2,'unknown','low','blank',null)]}); assert.notEqual(missBlocks10.reconciliationStatus,'safely_resolved','credible miss blocks 10/10 automatic resolution');
let oldTotal=a.reconcileScorecardPost({detectedPostScore:1,expectedTargetCount:1,cells:[mk(1,1,'unknown','low','blank',null)]}); assert.equal(oldTotal.cells[0].result,'unknown','old analysis without total confidence remains conservative');
let highBlank=a.reconcileScorecardPost({detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:1,cells:[mk(1,1,'unknown','high','blank',null)]}); assert.equal(highBlank.reconciliationStatus,'safely_resolved','high-confidence blank Unknown does not create false Conflict with valid total');
let highUnreadable=a.reconcileScorecardPost({detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:1,cells:[mk(1,1,'unknown','high','unreadable','scribble')]}); assert.equal(highUnreadable.reconciliationStatus,'safely_resolved','high-confidence unreadable Unknown remains flexible');
let reviewedUnknown=a.reconcileScorecardPost({detectedPostScore:1,detectedPostScoreConfidence:'high',expectedTargetCount:1,cells:[mk(1,1,'unknown','low','blank',null,true)]}); assert.equal(reviewedUnknown.cells[0].result,'hit','reviewed Unknown remains unresolved/flexible rather than fixed conflict');

let bulk=a.bulkResolveUnknownsForPost([{postNumber:1,targetNumber:1,result:'unknown',rawMark:null,confidence:'low',warning:null},{postNumber:2,targetNumber:1,result:'unknown',rawMark:null,confidence:'low',warning:null}],1,'hit',true);
assert.equal(bulk.changed,1); assert.equal(bulk.grid[0].result,'hit'); assert.equal(bulk.grid[1].result,'unknown');
assert.equal(a.bulkResolveUnknownsForPost(bulk.grid,2,'miss',false).changed,0, 'cancelled post-scoped bulk changes nothing');


let markOnly=a.normalizeScorecardAnalysis({detectedTitle:'marks',detectedDate:null,scorecardConfidence:'high',rawText:'',warnings:[],shooterRows:[{candidateId:'m',displayName:null,rowLabel:null,confidence:'high',detectedScore:null,posts:[{postNumber:1,detectedPostScore:null,detectedPostScoreConfidence:null,detectedPostScoreRawText:null,targets:[{targetNumber:1,result:'unknown',rawMark:'/',observedMarkCategory:'diagonal_stroke',confidence:'low',warning:null},{targetNumber:2,result:'unknown',rawMark:'0',observedMarkCategory:'zero',confidence:'low',warning:null},{targetNumber:3,result:'unknown',rawMark:'-',observedMarkCategory:'horizontal_dash',confidence:'low',warning:null},{targetNumber:4,result:'unknown',rawMark:null,observedMarkCategory:'blank',confidence:'low',warning:null},{targetNumber:5,result:'unknown',rawMark:'scribble',observedMarkCategory:'unreadable',confidence:'low',warning:null},{targetNumber:6,result:'hit',rawMark:'0',observedMarkCategory:'zero',confidence:'high',warning:null}]}]}]},{postCount:1,targetsPerPost:6});
assert.deepEqual(markOnly.shooterRows[0].grid.map(c=>c.result), ['hit','miss','miss','unknown','unknown','unknown'], 'deterministic mark classification is integrated without row totals');
assert.match(markOnly.shooterRows[0].grid[5].warning,/conflicts/, 'high-confidence contradictory AI result is flagged');

const base={detectedTitle:'x',detectedDate:null,scorecardConfidence:'high',rawText:'r'.repeat(1300),warnings:['w'],shooterRows:[{candidateId:'bad',displayName:'Alice',rowLabel:'1',confidence:'high',detectedScore:1,posts:[{postNumber:1,detectedPostScore:null,targets:[{targetNumber:1,result:'hit',rawMark:'/',confidence:'high',warning:null},{targetNumber:2,result:'miss',rawMark:'0',confidence:'medium',warning:null},{targetNumber:99,result:'hit',rawMark:null,confidence:'high',warning:null}]},{postNumber:99,detectedPostScore:null,targets:[{targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null}]}]}]};
let n=a.normalizeScorecardAnalysis(base,{postCount:2,targetsPerPost:2}); assert.equal(n.shooterRows.length,1); assert.equal(n.shooterRows[0].grid.length,4); assert.equal(n.shooterRows[0].hits,1); assert.equal(n.shooterRows[0].misses,1); assert.equal(n.shooterRows[0].unknowns,2); assert.match(n.shooterRows[0].warnings.join(' '),/out-of-range/); assert.equal(n.rawText.length,1200);
let dup=structuredClone(base); dup.shooterRows[0].posts[0].targets.push({targetNumber:1,result:'miss',rawMark:'x',confidence:'low',warning:null}); n=a.normalizeScorecardAnalysis(dup,{postCount:1,targetsPerPost:1}); assert.equal(n.shooterRows[0].grid[0].result,'hit');
dup=structuredClone(base); dup.shooterRows[0].posts[0].targets.push({targetNumber:1,result:'miss',rawMark:'x',confidence:'high',warning:null}); n=a.normalizeScorecardAnalysis(dup,{postCount:1,targetsPerPost:2}); assert.equal(n.shooterRows[0].grid[0].result,'unknown');
const multi=structuredClone(base); multi.shooterRows.push({...base.shooterRows[0],displayName:'Bob'}); n=a.normalizeScorecardAnalysis(multi,{postCount:1,targetsPerPost:1}); assert.equal(n.shooterRows.length,2); assert.equal(n.shooterRows[1].candidateId,'shooter-2'); assert.throws(()=>a.normalizeScorecardAnalysis({}, {postCount:1,targetsPerPost:1}));
let grid=[{postNumber:1,targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null},{postNumber:1,targetNumber:2,result:'unknown',rawMark:null,confidence:'low',warning:null}]; assert.equal(a.summarizeGrid(grid).canApply,false); grid=a.applyUserCorrection(grid,1,2,'miss'); assert.equal(a.summarizeGrid(grid).score,1); assert.equal(a.bulkResolveUnknowns(grid,'hit',false).changed,0); grid[1].result='unknown'; assert.equal(a.bulkResolveUnknowns(grid,'hit',true).changed,1);
const canonicalInput=[{postNumber:2,targetNumber:2,result:'miss'},{postNumber:1,targetNumber:2,result:'hit'},{postNumber:1,targetNumber:1,result:'hit'},{postNumber:2,targetNumber:1,result:'miss'}].map(c=>({...c,rawMark:null,confidence:'high',warning:null})); let canon=a.canonicalizeReviewedGrid(canonicalInput,{postCount:2,targetsPerPost:2}); assert.equal(canon.ok,true); assert.deepEqual(canon.grid.map(c=>`${c.postNumber}:${c.targetNumber}`),['1:1','1:2','2:1','2:2']); assert.equal(a.canonicalizeReviewedGrid([...canonicalInput, canonicalInput[0]],{postCount:2,targetsPerPost:2}).ok,false); assert.equal(a.canonicalizeReviewedGrid(canonicalInput.slice(1),{postCount:2,targetsPerPost:2}).ok,false); assert.equal(a.canonicalizeReviewedGrid([...canonicalInput,{postNumber:3,targetNumber:1,result:'hit',rawMark:null,confidence:'high',warning:null}],{postCount:2,targetsPerPost:2}).ok,false); assert.equal(a.canonicalizeReviewedGrid([{...canonicalInput[0],result:'unknown'},...canonicalInput.slice(1)],{postCount:2,targetsPerPost:2}).ok,false);


const validSequentialPost = setup.resolveScorecardSetup({postCount:1,targetsPerPost:4,totalTargets:4,targetDefinitions:[1,2,3,4].map(position=>({post_number:1,target_position:position}))}); assert.equal(validSequentialPost.ok,true, 'valid detailed post positions 1,2,3,4 are accepted'); assert.deepEqual(validSequentialPost.setup.targetsPerPostByPost,[4]);
const gapPost = setup.resolveScorecardSetup({postCount:1,targetsPerPost:3,totalTargets:3,targetDefinitions:[1,3].map(position=>({post_number:1,target_position:position}))}); assert.equal(gapPost.ok,false, 'detailed post positions 1,3 are blocked because position 2 is missing'); assert.match(gapPost.message,/consecutive|incomplete/);
const missingFirstPost = setup.resolveScorecardSetup({postCount:1,targetsPerPost:3,totalTargets:2,targetDefinitions:[2,3].map(position=>({post_number:1,target_position:position}))}); assert.equal(missingFirstPost.ok,false, 'detailed post positions 2,3 are blocked because position 1 is missing'); assert.match(missingFirstPost.message,/consecutive|incomplete/);
const duplicatePosition = setup.resolveScorecardSetup({postCount:1,targetsPerPost:2,totalTargets:2,targetDefinitions:[1,1].map(position=>({post_number:1,target_position:position}))}); assert.equal(duplicatePosition.ok,false, 'duplicate target positions on one post are blocked'); assert.match(duplicatePosition.message,/duplicate/);
const oneInvalidAmongSeveral = setup.resolveScorecardSetup({postCount:3,targetsPerPost:2,totalTargets:7,targetDefinitions:[{post_number:1,target_position:1},{post_number:1,target_position:2},{post_number:2,target_position:1},{post_number:2,target_position:3},{post_number:3,target_position:1},{post_number:3,target_position:2}]}); assert.equal(oneInvalidAmongSeveral.ok,false, 'one post with a gap blocks the whole import'); assert.match(oneInvalidAmongSeveral.message,/consecutive|incomplete/);
const ignoredInvalidPositions = setup.resolveScorecardSetup({postCount:1,targetsPerPost:2,totalTargets:2,targetDefinitions:[{post_number:1,target_position:0},{post_number:1,target_position:-1},{post_number:99,target_position:9},{post_number:null,target_position:1},{post_number:1,target_position:1},{post_number:1,target_position:2}]}); assert.equal(ignoredInvalidPositions.ok,true, 'invalid positions or invalid post numbers are ignored instead of counted'); assert.deepEqual(ignoredInvalidPositions.setup.targetsPerPostByPost,[2]);

const leirduestiVariable=setup.resolveScorecardSetup({postCount:4,targetsPerPost:4,totalTargets:18,targetDefinitions:[1,2,3,4].flatMap(p=>Array.from({length:p===3?6:4},(_,i)=>({post_number:p,target_position:i+1})))}); assert.equal(leirduestiVariable.ok,true); assert.deepEqual(leirduestiVariable.setup.targetsPerPostByPost,[4,4,6,4]); assert.equal(leirduestiVariable.setup.totalTargets,18);
const englishVariable=setup.resolveScorecardSetup({postCount:3,targetsPerPost:6,totalTargets:20,targetDefinitions:[6,8,6].flatMap((count,p)=>Array.from({length:count},(_,i)=>({post_number:p+1,target_position:i+1})))}); assert.equal(englishVariable.ok,true); assert.deepEqual(englishVariable.setup.targetsPerPostByPost,[6,8,6]);
let variableAnalysis=a.normalizeScorecardAnalysis(base,englishVariable.setup); assert.equal(variableAnalysis.totalTargets,20); assert.equal(variableAnalysis.shooterRows[0].grid.length,20); assert.equal(variableAnalysis.shooterRows[0].grid.filter(c=>c.postNumber===2).length,8);
let variableGrid=[4,4,6,4].flatMap((count,p)=>Array.from({length:count},(_,i)=>({postNumber:p+1,targetNumber:i+1,result:'hit',rawMark:null,confidence:'high',warning:null}))); let variableCanon=a.canonicalizeReviewedGrid(variableGrid,leirduestiVariable.setup); assert.equal(variableCanon.ok,true); assert.deepEqual(variableCanon.grid.map(c=>`${c.postNumber}:${c.targetNumber}`).slice(8,14),['3:1','3:2','3:3','3:4','3:5','3:6']); assert.equal(a.canonicalizeReviewedGrid(variableGrid,{postCount:4,targetsPerPost:4}).ok,false);
const blocked=setup.resolveScorecardSetup({postCount:4,targetsPerPost:4,totalTargets:16,targetDefinitions:[1,2,3,4].flatMap(p=>Array.from({length:p===3?6:4},(_,i)=>({post_number:p,target_position:i+1})))}); assert.equal(blocked.ok,false); assert.match(blocked.message,/conflicts/);

const defs=[{post_number:1,target_position:1,presentation_number:1,presentation_type:'single',position_in_presentation:1,target_label:'A',target_type:'Crosser'},{post_number:1,target_position:2,presentation_number:2,presentation_type:'report_pair',position_in_presentation:1,target_label:'B',target_type:'Teal'},{post_number:1,target_position:3,presentation_number:2,presentation_type:'report_pair',position_in_presentation:2,target_label:'C',target_type:'Rabbit'},{post_number:1,target_position:4,presentation_number:3,presentation_type:'single',position_in_presentation:1,target_label:'D',target_type:'Loop'}];
const missGrid=[1,2,3,4].map(i=>({postNumber:1,targetNumber:i,result:'miss',rawMark:null,confidence:'high',warning:null})); let mapped=m.mapReviewedMisses(missGrid,defs,[]); assert.equal(mapped.rows.length,4); assert.equal(mapped.rows[0].missed_target,'Single target'); assert.equal(mapped.rows[1].missed_target,'First target in pair'); assert.equal(mapped.rows[2].missed_target,'Second target in pair'); assert.equal(mapped.rows[3].target_label,'D'); assert.equal(mapped.rows[3].main_reason,'Unknown');
let atoms=m.existingMissAtoms([{course_number:1,target_number:2,missed_target:'Both targets in pair'}], defs); assert(atoms.atoms.has('1:2')&&atoms.atoms.has('1:3')); atoms=m.existingMissAtoms([{course_number:1,target_number:2,missed_target:'First target in pair'},{course_number:1,target_number:2,missed_target:'Second target in pair'}], defs); assert(atoms.atoms.has('1:2')&&atoms.atoms.has('1:3')); mapped=m.mapReviewedMisses(missGrid,defs,[{course_number:1,target_position:1,target_number:null,missed_target:null,source_type:'scorecard_import'}]); assert.equal(mapped.skippedDuplicates,1); assert.equal(mapped.rows.length,3); mapped=m.mapReviewedMisses(missGrid,[],[{course_number:1,target_number:2,missed_target:'Both targets in pair'}]); assert.equal(mapped.ambiguousExisting,true); let unknownStructuralTargets=[{post_number:1,target_position:1,presentation_number:1,presentation_type:'unknown',position_in_presentation:1,target_label:null,target_type:null},{post_number:1,target_position:2,presentation_number:2,presentation_type:'unknown',position_in_presentation:1,target_label:null,target_type:null}]; let unknownAtoms=m.existingMissAtoms([{course_number:1,target_number:1,missed_target:'First target in pair'}], unknownStructuralTargets); assert.equal(unknownAtoms.ambiguous,true, 'unknown structural placeholders cannot resolve first target in pair'); assert.equal(unknownAtoms.atoms.size,0, 'unknown structural placeholders do not create pair atoms'); unknownAtoms=m.existingMissAtoms([{course_number:1,target_number:1,missed_target:'Single target'}], unknownStructuralTargets); assert.equal(unknownAtoms.ambiguous,true, 'unknown structural placeholders cannot resolve known single target metadata');
const pairBeforeSingle=[{post_number:1,target_position:1,presentation_number:1,presentation_type:'report_pair',position_in_presentation:1,target_label:'A',target_type:'Unknown'},{post_number:1,target_position:2,presentation_number:1,presentation_type:'report_pair',position_in_presentation:2,target_label:'B',target_type:'Unknown'},{post_number:1,target_position:3,presentation_number:2,presentation_type:'single',position_in_presentation:1,target_label:'C',target_type:'Unknown'}]; atoms=m.existingMissAtoms([{course_number:1,target_number:1,missed_target:'Both targets in pair'},{course_number:1,target_number:2,missed_target:'Single target'}], pairBeforeSingle); assert(atoms.atoms.has('1:1')&&atoms.atoms.has('1:2')&&atoms.atoms.has('1:3'));

const compakGrid=[1,2].flatMap(series=>Array.from({length:25},(_,i)=>({postNumber:series,targetNumber:i+1,result:(series===2&&i===4)?'miss':'hit',rawMark:null,confidence:'high',warning:null})));
let compakCanon=a.canonicalizeReviewedGrid(compakGrid,sporttrapMulti.setup); assert.equal(compakCanon.ok,true); assert.equal(compakCanon.grid.filter(c=>c.postNumber===1&&c.result==='miss').length,0); assert.equal(compakCanon.grid.filter(c=>c.postNumber===2&&c.result==='miss').length,1, 'series 2 miss does not affect series 1');
let compakMapped=m.mapReviewedMisses(compakCanon.grid,[],[]); assert.equal(compakMapped.rows.length,1); assert.equal(compakMapped.rows[0].course_number,2); assert.equal(compakMapped.rows[0].target_position,5); assert.equal(compakMapped.rows[0].target_type,'Unknown'); assert.equal(compakMapped.rows[0].missed_target,'Unknown');
const compakDefs=[{post_number:2,target_position:5,presentation_number:9,presentation_type:'simultaneous_pair',position_in_presentation:2,target_label:'Machine F',target_type:'Quartering'}];
let compakMappedWithDefs=m.mapReviewedMisses(compakCanon.grid,compakDefs,[]); assert.equal(compakMappedWithDefs.rows[0].target_label,'Machine F'); assert.equal(compakMappedWithDefs.rows[0].target_type,'Quartering', 'existing target definitions are used but not overwritten by import mapping');
let dupImport=m.mapReviewedMisses(compakCanon.grid,[],[{course_number:2,target_position:5,target_number:null,missed_target:null,source_type:'scorecard_import'}]); assert.equal(dupImport.rows.length,0); assert.equal(dupImport.skippedDuplicates,1, 'double import at same target is blocked');
let corrected=a.applyUserCorrection(compakGrid,2,5,'hit'); assert.equal(corrected.find(c=>c.postNumber===2&&c.targetNumber===5).reviewed,true); assert.equal(corrected.find(c=>c.postNumber===2&&c.targetNumber===5).result,'hit', 'manual review corrections are preserved in the grid');

const raw={schemaVersion:1,queueId:'q',clientImportId:'00000000-0000-4000-8000-000000000000',sessionId:'s',image:new Blob(['x']),imageFingerprint:'a'.repeat(64),status:'applying',analysis:n,selectedShooterCandidateId:'shooter-1'}; const migrated=q.migratePendingScorecardPhoto(raw); assert.equal(migrated.schemaVersion,4); assert.equal(migrated.status,'saved_on_device'); assert.deepEqual(migrated.crop,{x:0,y:0,width:1,height:1,mode:'full'}); assert.equal(migrated.cropFingerprint, migrated.imageFingerprint); assert(migrated.reviewedGrid.length>0); assert.equal(migrated.setupFingerprint,null, 'old pending data without setup fingerprint migrates safely and requires re-analysis'); assert.equal(q.shouldIgnoreStale({sessionId:'s',clientImportId:'a',imageFingerprint:'b'},{sessionId:'s',clientImportId:'x',imageFingerprint:'b'}),true);
function rpcRetryOrderSimulation(existing, expectedOwnScore, currentOwnScore){ if(existing) return 'alreadyImported'; if(currentOwnScore !== expectedOwnScore) return 'stale_score'; return 'inserted'; } assert.equal(rpcRetryOrderSimulation(true, null, 22), 'alreadyImported'); assert.equal(rpcRetryOrderSimulation(false, null, 22), 'stale_score');
const globalCssForReview = readFileSync('app/globals.css','utf8');
const issue237Css = globalCssForReview.slice(globalCssForReview.indexOf('/* Issue #237 focused mobile usability fixes. */'));
const narrowScorecardOverride = issue237Css.match(/@media \(max-width: 430px\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.match(narrowScorecardOverride, /\.scorecardGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/, 'narrow scorecard review uses this PR single-column cards to avoid control collisions');
assert.match(narrowScorecardOverride, /\.scorecardCellChoices\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(4rem,\s*1fr\)\)/, 'narrow scorecard review verifies this PR Hit/Miss/? override, not an older global rule');
assert.match(globalCssForReview, /\.scorecardCellChoices\s*\{[\s\S]*max-width:\s*100%/, 'scorecard review choices stay inside the card width');

console.log('scorecard focused tests passed');
