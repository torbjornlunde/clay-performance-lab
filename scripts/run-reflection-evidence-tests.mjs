import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function loadTs(path) { const source=readFileSync(path,"utf8"); const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; const module={exports:{}}; new Function("module","exports",js)(module,module.exports); return module.exports; }
const evidence=loadTs("lib/ai/reflectionEvidence.ts");
const valid={items:[{category:"physical_state",normalized_value:"fatigue_late",label:"feeling tired late in the competition",evidence_basis:"self_report",confidence:"high",reference:null},{category:"possible_issue",normalized_value:"timing",label:"timing may be worth checking",evidence_basis:"ai_inference",confidence:"low",reference:null}]};
const parsed=evidence.validateReflectionEvidenceOutput(valid); assert.equal(parsed.length,2); assert.match(evidence.acceptedEvidenceSentence(parsed[0]),/^You reported/); assert.match(evidence.acceptedEvidenceSentence(parsed[1]),/^One reviewed AI hypothesis/);
assert.throws(()=>evidence.validateReflectionEvidenceOutput({items:[{...valid.items[0],category:"score"}]}));
assert.throws(()=>evidence.validateReflectionEvidenceOutput({items:Array(9).fill(valid.items[0])}));
assert.throws(()=>evidence.validateReflectionEvidenceOutput({items:[{...valid.items[0],label:"x".repeat(161)}]}));
assert.throws(()=>evidence.validateReflectionEvidenceOutput({items:[{...valid.items[0],reference:"the third station by the trees"}]}));
assert.equal(evidence.reflectionSupportsReference("Wind picked up at Post 3.","Post 3"),true);
assert.equal(evidence.reflectionSupportsReference("Wind picked up late.","Post 3"),false);
const route=readFileSync("app/api/reflections/interpret/route.ts","utf8");
assert.match(route,/noteId/); assert.match(route,/note\.body/); assert.doesNotMatch(route,/console\.(log|error)/); assert.match(route,/json_schema/); assert.match(route,/ai\.reflection_interpretation/); assert.match(route,/review_status: "pending"/); assert.doesNotMatch(route,/review_status: "accepted"/);
const migration=readFileSync("supabase/migrations/20260915120000_private_reflection_evidence.sql","utf8"); assert.match(migration,/enable row level security/); for(const action of ["select","insert","update","delete"]) assert.match(migration,new RegExp(`private_reflection_evidence_${action}_own`)); assert.match(migration,/source_note_updated_at/); assert.match(migration,/auth\.uid\(\) = user_id/); assert.match(migration,/Reflection evidence is stale/);
const hardeningMigration=readFileSync("supabase/migrations/20260915170000_tighten_private_reflection_evidence.sql","utf8"); assert.match(hardeningMigration,/reference_format/); assert.match(hardeningMigration,/unique index/);
const component=readFileSync("app/components/ReflectionEvidenceReview.tsx","utf8"); assert.match(component,/Interpret reflection/); assert.match(component,/Accept/); assert.match(component,/Reject/); assert.match(component,/Older reflection/); assert.match(component,/source_note_updated_at !== note\.updated_at/);
assert.match(component,/Evidence could not be loaded/); assert.match(component,/!canInterpret/);
assert.match(route,/trialUsage/); assert.match(route,/feature_usage_events/); assert.match(route,/reused: true/); assert.match(route,/reflectionSupportsReference/);
const sessionPage=readFileSync("app/sessions/[id]/page.tsx","utf8"); assert.match(sessionPage,/\(noteDrafts\.session \|\| ""\) === \(noteFor\("session"\)\?\.body \|\| ""\)/);
for (const reportPath of ["app/sessions/[id]/coach-report/page.tsx","app/coach-report/page.tsx"]) { const source=readFileSync(reportPath,"utf8"); assert.match(source,/source_note_updated_at/); assert.match(source,/note\.updated_at === item\.source_note_updated_at/); }
const report=readFileSync("lib/analysis/coachReportEvidence.ts","utf8"); assert.match(report,/acceptedEvidenceBySession/); assert.match(report,/reviewedReflectionEvidence/);
console.log("reflection evidence focused tests passed");
