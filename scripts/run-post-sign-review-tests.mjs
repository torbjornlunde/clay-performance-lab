import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
execSync('rm -rf .post-sign-test-build && npx tsc lib/targets/postSignAnalysis.ts lib/targets/postSignReview.ts lib/targets/postSignPhotos.ts lib/targets/postTargets.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --jsx react-jsx --outDir .post-sign-test-build --skipLibCheck', {stdio:'inherit'});
const r = await import('../.post-sign-test-build/postSignReview.js');
const analysis = await import('../.post-sign-test-build/postSignAnalysis.js');
const repeated = analysis.validatePostSignAnalysis({ detectedPostNumbers:[2], rawText:'A + B · 4 x rapport', instructions:'', confidence:'high', warnings:[], presentations:[{ presentationNumber:1, repetitionCount:4, presentationType:'report_pair', structuralKind:'pair', targetLabels:['A','B'], sourceText:'4 x rapport A+B', sourceNotation:'A+B', notationKind:'explicit_report', typeEvidence:'explicit_heading', confidence:'high', warnings:[] }] });
assert.deepEqual(repeated.presentations.map(p => p.presentationNumber), [1,2,3,4], 'explicit repetition count expands into four ordered presentations');
assert.equal(r.summarizePresentations(repeated.presentations).targets, 8, 'four report pairs contain eight target positions');
assert.equal(repeated.presentations.every(p => p.presentationType === 'report_pair' && p.targetLabels.join('') === 'AB'), true, 'each repeat preserves report type and target order');
assert.equal(analysis.validatePostSignAnalysis({ ...repeated, presentations:[{...repeated.presentations[0]}] }).presentations.length, 1, 'older saved analyses without repetition count remain valid');
assert.throws(() => analysis.validatePostSignAnalysis({ ...repeated, presentations:[{...repeated.presentations[0], repetitionCount:99}] }), /invalid repetition count/, 'unbounded model repetition cannot expand a sign indefinitely');
const photo = await import('../.post-sign-test-build/postSignPhotos.js');
assert.equal(photo.matchesPostSignPhoto({imageId:'new'}, 'old'), false, 'old analysis cannot update a replacement photo');
assert.equal(photo.matchesPostSignPhoto({imageId:'new'}, 'new'), true, 'current analysis can update its own photo');
assert.equal(photo.matchesPostSignPhoto({imageId:undefined}, undefined), true, 'existing offline photos remain reviewable');
assert.equal(photo.matchesPostSignPhoto(null, 'deleted'), false, 'discarded photos cannot receive late analysis');
const editor = readFileSync('app/sessions/[id]/targets/PostTargetEditor.tsx', 'utf8');
assert.match(editor, /updatePendingPostSignPhotoIfCurrent\(sessionId, postNumber, imageId, patch\)/, 'analysis writes use image-aware guarded updates');
const rows = [
  { presentationNumber: 1, presentationType: 'single', structuralKind: 'single', targetLabels: ['A'], sourceNotation: 'A', notationKind: 'single', typeEvidence: 'explicit_wording', confidence: 'high', warnings: [] },
  { presentationNumber: 2, presentationType: 'unknown', structuralKind: 'pair', targetLabels: ['A','B'], sourceNotation: 'A+B', notationKind: 'plus', typeEvidence: 'user_convention_required', confidence: 'low', warnings: ['notation convention required'] },
  { presentationNumber: 3, presentationType: 'unknown', structuralKind: 'pair', targetLabels: ['A','B'], sourceNotation: 'AB', notationKind: 'joined', typeEvidence: 'user_convention_required', confidence: 'low', warnings: ['notation convention required'] },
  { presentationNumber: 4, presentationType: 'report_pair', structuralKind: 'pair', targetLabels: ['A','C'], sourceNotation: 'A+C', notationKind: 'explicit_report', typeEvidence: 'explicit_heading', confidence: 'high', warnings: [] },
];
const review = { detectedPostNumbers: [], rawText: '', instructions: 'old', confidence: 'medium', warnings: [], presentations: rows, notationConventions: { plus: 'manual' } };
assert.deepEqual(r.unresolvedKinds(review), ['plus','joined']);
let out = r.applyPairConventions(review, {plus:'report_pair', joined:'simultaneous_pair'});
assert.equal(out.presentations[1].presentationType, 'report_pair');
assert.equal(out.presentations[2].presentationType, 'simultaneous_pair');
assert.equal(out.presentations[3].presentationType, 'report_pair', 'explicit-heading rows are not overwritten');
assert.equal(out.notationConventions.plus, 'report_pair');
out = r.applyPairConventions(out, {plus:'simultaneous_pair'});
assert.equal(out.notationConventions.joined, 'simultaneous_pair', 'partial convention choices are merged');
assert.equal(out.presentations[1].presentationType, 'report_pair', 'later convention choices do not overwrite a reviewed row');
const manuallyReviewed = {...review, presentations: [{...rows[1], presentationType:'simultaneous_pair'}]};
const afterBulkRule = r.applyPairConventions(manuallyReviewed, {plus:'report_pair'});
assert.equal(afterBulkRule.presentations[0].presentationType, 'simultaneous_pair', 'manual review is preserved when a notation rule is chosen later');
const manual = {...review, presentations: [{...rows[1], presentationType:'unknown'}]};
assert.equal(r.hasBlockingUnresolvedPairs(manual), true);
const moved = r.moveReviewRow(rows, 1, -1);
assert.equal(moved[0].sourceNotation, 'A+B');
assert.equal(r.removeReviewRow(rows, 1).at(-1).presentationNumber, 3);
assert.deepEqual(r.summarizePresentations(rows), {presentations:4, targets:7, singles:1, reportPairs:1, simultaneousPairs:0, needsReview:2});
execSync('rm -rf .post-sign-test-build');
console.log('post-sign review behavior tests passed');
