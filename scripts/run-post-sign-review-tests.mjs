import assert from 'node:assert/strict';
const rows = [
  { presentationNumber: 1, presentationType: 'single', structuralKind: 'single', targetLabels: ['A'], sourceNotation: 'A', notationKind: 'single', typeEvidence: 'explicit_wording', confidence: 'high', warnings: [] },
  { presentationNumber: 2, presentationType: 'unknown', structuralKind: 'pair', targetLabels: ['A','B'], sourceNotation: 'A+B', notationKind: 'plus', typeEvidence: 'user_convention_required', confidence: 'low', warnings: ['notation convention required'] },
  { presentationNumber: 3, presentationType: 'unknown', structuralKind: 'pair', targetLabels: ['A','B'], sourceNotation: 'AB', notationKind: 'joined', typeEvidence: 'user_convention_required', confidence: 'low', warnings: ['notation convention required'] },
  { presentationNumber: 4, presentationType: 'report_pair', structuralKind: 'pair', targetLabels: ['A','C'], sourceNotation: 'A+C', notationKind: 'explicit_report', typeEvidence: 'explicit_heading', confidence: 'high', warnings: [] },
];
function apply(choices){return rows.map(p=>p.structuralKind==='pair'&&p.typeEvidence==='user_convention_required'&&choices[p.notationKind]&&choices[p.notationKind]!=='manual'?{...p,presentationType:choices[p.notationKind]}:p)}
let out=apply({plus:'report_pair',joined:'simultaneous_pair'});
assert.equal(out[1].presentationType,'report_pair');
assert.equal(out[2].presentationType,'simultaneous_pair');
assert.equal(out[3].presentationType,'report_pair','explicit-heading rows are not overwritten');
out=apply({plus:'simultaneous_pair',joined:'report_pair'});
assert.equal(out[1].presentationType,'simultaneous_pair');
assert.equal(out[2].presentationType,'report_pair');
assert.equal(rows.filter(r=>r.presentationType==='unknown').length,2,'manual review leaves unresolved blocked');
const moved=[rows[1],rows[0],rows[2]].map((p,i)=>({...p,presentationNumber:i+1}));
assert.equal(moved[0].sourceNotation,'A+B');
const summary=rows.reduce((a,p)=>{a.presentations++;a.targets+=p.targetLabels.length;if(p.presentationType==='unknown')a.needsReview++;return a},{presentations:0,targets:0,needsReview:0});
assert.deepEqual(summary,{presentations:4,targets:7,needsReview:2});
console.log('post-sign review behavior tests passed');
