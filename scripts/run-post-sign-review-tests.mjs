import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
execSync('rm -rf .post-sign-test-build && npx tsc lib/targets/postSignAnalysis.ts lib/targets/postSignReview.ts lib/targets/postTargets.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --jsx react-jsx --outDir .post-sign-test-build --skipLibCheck', {stdio:'inherit'});
const r = await import('../.post-sign-test-build/postSignReview.js');
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
assert.equal(out.presentations[1].presentationType, 'simultaneous_pair', 'later convention changes update convention-owned rows');
const manual = {...review, presentations: [{...rows[1], presentationType:'unknown'}]};
assert.equal(r.hasBlockingUnresolvedPairs(manual), true);
const moved = r.moveReviewRow(rows, 1, -1);
assert.equal(moved[0].sourceNotation, 'A+B');
assert.equal(r.removeReviewRow(rows, 1).at(-1).presentationNumber, 3);
assert.deepEqual(r.summarizePresentations(rows), {presentations:4, targets:7, singles:1, reportPairs:1, simultaneousPairs:0, needsReview:2});
console.log('post-sign review behavior tests passed');
