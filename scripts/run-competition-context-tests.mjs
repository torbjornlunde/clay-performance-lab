import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadTs(path) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", output)(module, module.exports);
  return module.exports;
}

const tags = loadTs("lib/competitionContext.ts");
assert.equal(tags.COMPETITION_CONTEXT_TAGS.length, 15);
assert.deepEqual(tags.normalizeCompetitionContextTags(["wind", "tired", "wind", "made_up"]), ["wind", "tired"]);
assert.deepEqual(tags.normalizeCompetitionContextTags(null), []);
const page = readFileSync("app/sessions/[id]/page.tsx", "utf8");
for (const text of ["How did it go?", "Short reflection", "Save context", "Describe missed targets"]) assert(page.includes(text), `${text} remains reachable`);
assert.match(page, /aria-pressed=\{selected\}/);
assert.match(page, /current\.filter\(\(id\) => id !== tag\.id\)/);
assert.match(page, /body: pending\.body, context_tags/);
for (const path of ["app/results/new/page.tsx", "app/results/quick/page.tsx", "app/sessions/[id]/scorecard-import/page.tsx", "app/import/leirdue/page.tsx", "app/results/CompetitionResultClaims.tsx"]) assert.match(readFileSync(path, "utf8"), /context=1|params\.set\("context", "1"\)/, `${path} links to context after save`);
assert.doesNotMatch(readFileSync("lib/analytics.ts", "utf8"), /context_tags|contextTags|reflection/);
const evidence = readFileSync("lib/analysis/coachReportPeriod.ts", "utf8");
assert.match(evidence, /selfReportedContext/);
assert.match(evidence, /self-reported context, not a proven cause/);
const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /competitionContextTags[^}]*flex-wrap: wrap/);
assert.match(css, /competitionContextTag[^}]*min-height: 44px/);
assert.match(css, /competitionContextTag\.selected[^}]*var\(--accent\)/);
console.log("competition context tests passed");
