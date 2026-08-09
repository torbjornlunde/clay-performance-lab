import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; vm.runInNewContext(`(function(require,module,exports){${js}\n})(require,module,module.exports)`, { module, require: (id) => imports[id] || (() => { throw new Error(`Unexpected import ${id}`); })(), console }); return module.exports;
}
const core = load("lib/scoreSheets/core.ts");
const results = load("lib/scoreSheets/results.ts", { "./core": core });
const csv = load("lib/scoreSheets/resultCsv.ts");
const setup = { postCount: 2, targetsPerPost: 10, expectedTargetsByPost: [12, 8] };
const projected = results.projectScoreSheetResults({ setup, shooters: [{ id: "a", shooter_name: "A", display_order: 2 }, { id: "b", shooter_name: "B", display_order: 1 }], scores: [{ shooter_id: "a", post_number: 1, score: 10 }, { shooter_id: "a", post_number: 2, score: 8 }, { shooter_id: "b", post_number: 1, score: 10 }, { shooter_id: "b", post_number: 2, score: 8 }], targetResults: [] });
assert.equal(projected[0].displayName, "B"); assert.equal(projected[0].totalScore, 18); assert.equal(projected[0].expectedTargets, 20); assert.equal(projected[0].scoredTargets, 0); assert.equal(projected[0].unscoredTargets, 20); assert.equal(projected[0].tiedOnTotal, true); assert.equal(projected[1].tiedOnTotal, true);
const mixed = results.projectScoreSheetResults({ setup, shooters: [{ id: "a", shooter_name: "Åse", display_order: 1 }], scores: [{ shooter_id: "a", post_number: 1, score: 10 }, { shooter_id: "a", post_number: 2, score: 8 }], targetResults: Array.from({ length: 12 }, (_, i) => ({ shooter_id: "a", post_number: 1, target_number: i + 1, result: i < 9 ? "hit" : "miss" })) });
assert.deepEqual(Array.from(mixed[0].postScores), [9, 8]); assert.equal(mixed[0].totalScore, 17); assert.equal(mixed[0].scoredTargets, 12); assert.equal(mixed[0].unscoredTargets, 8); assert.equal(mixed[0].tiedOnTotal, false);
assert.equal(results.isAuthoritativeCompetitionResult("competition", "finalized"), true); for (const pair of [["training", "finalized"], ["shared_training", "finalized"], ["competition", "live"]]) assert.equal(results.isAuthoritativeCompetitionResult(...pair), false);
const output = csv.buildCompetitionResultCsv({ competition: "=Cup, North", date: "2026-08-09", location: "Møre\nNorway", discipline: "Compak", finalizedAt: "2026-08-09T12:00:00.000Z", reopenCount: 1, finalizedIncomplete: true, postLabel: "Plate" }, mixed);
assert.ok(output.startsWith("\uFEFFCompetition,Date,Location,Discipline,Finalized at,Corrected,Reopen count,Finalized incomplete,Shooter,Plate 1,Plate 2,Total,Scored targets,Unscored targets")); assert.match(output, /"'=Cup, North"/); assert.match(output, /"Møre\nNorway"/); assert.match(output, /Åse/); assert.match(output, /,9,8,17,12,8/); assert.match(output, /,Yes,1,Yes,/);
assert.equal(csv.escapeCsvCell('Simon "The Shooter", Jr.', true), '"Simon ""The Shooter"", Jr."'); assert.equal(csv.sanitizeCsvText("@SUM(A1:A2)"), "'@SUM(A1:A2)"); assert.equal(csv.sanitizeCsvText(" +CMD"), "' +CMD"); assert.equal(csv.escapeCsvCell(42), "42"); assert.equal(csv.competitionResultFilename("2026-08-09"), "competition-results-2026-08-09.csv"); assert.equal(csv.competitionResultFilename("../../bad"), "competition-results-result.csv");
const page = fs.readFileSync(path.join(root, "app/competition-score-sheets/[id]/result/page.tsx"), "utf8"); const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8"); const training = fs.readFileSync(path.join(root, "app/training-score-sheets/[id]/page.tsx"), "utf8");
assert.match(page, /\.eq\("session_type", "competition"\)/); assert.match(page, /window\.print\(\)/); assert.match(page, /URL\.revokeObjectURL/); assert.match(css, /@media print[\s\S]*\.competitionResultPage/); assert.doesNotMatch(training, /Print result|Download CSV|View final result/); assert.equal(fs.existsSync(path.join(root, "lib/scoreSheets/competitionScoring.ts")), false); assert.doesNotMatch(page, /from\("sessions"\)|localStorage|public.*result|service.role/i);
const stats = fs.readFileSync(path.join(root, "app/stats/page.tsx"), "utf8"); assert.match(stats, /\.in\("session_type", \["training", "shared_training"\]\)/);
console.log("Competition result projection, CSV safety, private route, print wiring, and separation checks passed.");
