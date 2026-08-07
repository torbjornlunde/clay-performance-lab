import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("rm -rf .scorecard-evidence-test-build && npx tsc lib/scorecardEvidence.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .scorecard-evidence-test-build --skipLibCheck", { stdio: "inherit" });
const evidence = await import("../.scorecard-evidence-test-build/scorecardEvidence.js");
assert.equal(evidence.validateScorecardEvidenceFile({type:"image/jpeg",size:1}),null);
assert.equal(evidence.validateScorecardEvidenceFile({type:"image/png",size:1}),null);
assert.equal(evidence.validateScorecardEvidenceFile({type:"image/webp",size:1}),null);
assert.match(evidence.validateScorecardEvidenceFile({type:"image/gif",size:1}),/JPEG/);
assert.match(evidence.validateScorecardEvidenceFile({type:"image/jpeg",size:10485761}),/10 MB/);
assert.equal(evidence.scorecardEvidencePath("owner","session","my card.jpg","uuid"),"owner/session/uuid-my-card.jpg");

function client(fail = {}) { const calls=[]; return { calls, storage:{from:()=>({upload:async(path)=>{calls.push(["upload",path]);return {error:fail.upload?new Error("upload failed"):null}},remove:async(paths)=>{calls.push(["remove",paths]);return {error:null}}})},from:()=>({insert:(value)=>({select:()=>({single:async()=>{calls.push(["insert",value]);return fail.insert?{error:new Error("insert failed")}:{data:{id:"row",...value}}}})}),update:(value)=>({eq:()=>({select:()=>({single:async()=>{calls.push(["update",value]);return fail.update?{error:new Error("update failed")}:{data:{id:"row",...value}}}})})})})}; }
const file={name:"card.jpg",type:"image/jpeg",size:10};
let c=client(); await evidence.uploadScorecardEvidence(c,{userId:"owner",sessionId:"session",courseNumber:null,file}); assert.deepEqual(c.calls.map(x=>x[0]),["upload","insert"]);
c=client({upload:true}); await assert.rejects(()=>evidence.uploadScorecardEvidence(c,{userId:"owner",sessionId:"session",courseNumber:1,file})); assert.deepEqual(c.calls.map(x=>x[0]),["upload"]);
c=client({insert:true}); await assert.rejects(()=>evidence.uploadScorecardEvidence(c,{userId:"owner",sessionId:"session",courseNumber:1,file})); assert.deepEqual(c.calls.map(x=>x[0]),["upload","insert","remove"]);
const old={id:"old",user_id:"owner",session_id:"session",storage_path:"owner/session/old.jpg",course_number:1};
c=client(); await evidence.replaceScorecardEvidence(c,old,file); assert.deepEqual(c.calls.map(x=>x[0]),["upload","update","remove"]); assert.deepEqual(c.calls.at(-1)[1],[old.storage_path]);
c=client({update:true}); await assert.rejects(()=>evidence.replaceScorecardEvidence(c,old,file)); assert.deepEqual(c.calls.map(x=>x[0]),["upload","update","remove"]); assert.notDeepEqual(c.calls.at(-1)[1],[old.storage_path]);
const migration=readFileSync("supabase/migrations/20260807120000_competition_scorecard_evidence.sql","utf8");
for(const text of ["false, 10485760","image/jpeg","image/png","image/webp","auth.uid()","session_type='Competition'","on delete cascade"]) assert.ok(migration.includes(text));
assert.doesNotMatch(migration,/create policy[^;]+to authenticated\s*(?:using|with check)\s*\(\s*bucket_id='competition-scorecard-evidence'\s*\)/is);
const component=readFileSync("app/components/ScorecardEvidenceSection.tsx","utf8");
for(const text of ["multiple","createSignedUrl","Whole session / unknown course","Photos are not analysed"]) assert.ok(component.includes(text));
assert.match(readFileSync("app/globals.css","utf8"),/scorecardEvidenceClose[^}]*safe-area-inset-top/);
assert.doesNotMatch(component,/scorecard\/analyze|post-sign|own_score|winning_score|compak_programme|misses|target_definitions/);
const deletion=readFileSync("lib/sessionDeletion.ts","utf8"); assert.ok(deletion.indexOf('from("sessions").delete') < deletion.indexOf(".remove(paths)"));
const sqlTest=readFileSync("supabase/tests/competition_scorecard_evidence.sql","utf8"); assert.match(sqlTest,/cross-user metadata/);
execSync("rm -rf .scorecard-evidence-test-build");
console.log("Scorecard evidence tests passed.");
