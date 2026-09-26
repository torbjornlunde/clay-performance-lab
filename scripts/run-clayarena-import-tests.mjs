import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

execSync("rm -rf .clayarena-test-build && npx tsc lib/disciplines.ts lib/leirdue/normalize.ts lib/clayarena/types.ts lib/clayarena/parser.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --types node --outDir .clayarena-test-build --skipLibCheck", { stdio: "inherit" });
const { parseClayArenaResults, validateClayArenaUrl } = await import("../.clayarena-test-build/clayarena/parser.js");

const page = ({ title = "FITASC Sporting Open", discipline = "FITASC Sporting", rows }) => `<!doctype html><meta name="competition-title" content="${title}"><meta name="competition-date" content="2026-09-12"><meta name="competition-discipline" content="${discipline}"><meta name="competition-venue" content="Test Ground"><table><tr><th>Place</th><th>No.</th><th>Shooter</th><th>Country</th><th>Class</th><th>Round 1</th><th>Round 2</th><th>Round 3</th><th>Round 4</th><th>Total</th><th>Targets</th></tr>${rows}</table>`;
const url = "https://clayarena.com/en/competitions/open-2026/results/";
const sporting = parseClayArenaResults(page({ rows: "<tr><td>2</td><td>42</td><td>Jane Shooter</td><td>GB</td><td>Lady</td><td>23</td><td>24</td><td>22</td><td>23</td><td>92 + 16</td><td>100</td></tr>" }), url, "Jane Shooter")[0];
assert.equal(sporting.matchStatus, "matched_to_you");
assert.equal(sporting.ownScore, 92, "shoot-off does not inflate base score");
assert.equal(sporting.shootOff, 16);
assert.deepEqual(sporting.seriesScores, [23, 24, 22, 23]);
assert.equal(sporting.totalTargets, 100);

const compak = parseClayArenaResults(page({ title: "Compak Cup", discipline: "Compak Sporting", rows: "<tr><td>1</td><td>7</td><td>Jo Smith</td><td>NO</td><td>A</td><td>25</td><td>24</td><td>0</td><td>0</td><td>49</td><td>50</td></tr>" }), url, "Jo Smith")[0];
assert.equal(compak.discipline, "Compak Sporting");
assert.deepEqual(compak.seriesScores, [25, 24], "zero/unshot columns are omitted");

const actualResults = readFileSync("scripts/fixtures/clayarena/public-results.html", "utf8");
const actualDetail = readFileSync("scripts/fixtures/clayarena/public-competition-detail.html", "utf8");
const actual = parseClayArenaResults(actualResults, url, "Jane Shooter", actualDetail)[0];
assert.equal(actual.competition, "Nordic Sporting Open", "the Results heading and decorated social title are not used");
assert.deepEqual(actual.seriesScores, [23, 24, 22], "numeric round headers are parsed and zero/unshot rounds omitted");
assert.equal(actual.date, "2026-09-18");
assert.equal(actual.venue, "North Clay Ground");
assert.equal(actual.totalTargets, 200);
assert.equal(actual.discipline, "FITASC Sporting");
assert.equal(actual.matchStatus, "matched_to_you", "surname-first display names are matched");
const corrected = parseClayArenaResults(actualResults.replace("69 + 4", "70 + 6"), url, "Jane Shooter", actualDetail)[0];
assert.equal(corrected.resultIdentity, actual.resultIdentity, "score corrections do not change duplicate identity");

assert.equal(parseClayArenaResults(page({ rows: "<tr><td>1</td><td>1</td><td>Different Person</td><td>SE</td><td>A</td><td>25</td><td>25</td><td>25</td><td>25</td><td>100</td><td>100</td></tr>" }), url, "Jane Shooter")[0].matchStatus, "no_match");
const ambiguous = parseClayArenaResults(page({ rows: "<tr><td>1</td><td>1</td><td>J Shooter</td><td>GB</td><td>A</td><td>25</td><td>25</td><td>25</td><td>25</td><td>100</td><td>100</td></tr>" }), url, "Jane Shooter")[0];
assert.equal(ambiguous.matchStatus, "possible_match");
const worldCupRow = "<tr><td>582</td><td>429</td><td>L LUNDE, Torbjorn</td><td>Man</td><td>19</td><td>23</td><td>21</td><td>15</td><td>25</td><td>22</td><td>19</td><td>15</td><td>159</td></tr>";
const worldCupHtml = `<h1>Results</h1><h2>22nd World Championship - Compak Sporting</h2><meta name="competition-date" content="2026-08-20"><table><tr><th>Position</th><th>Number</th><th>Name</th><th>Category</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>Total</th></tr>${worldCupRow}</table>`;
const worldCupDetail = `<h1>22nd World Championship - Compak Sporting</h1><dt>Targets</dt><dd>200</dd>`;
const worldCup = parseClayArenaResults(worldCupHtml, "https://clayarena.com/en/competitions/1763645235430/results/", "Torbjørn Lunde", worldCupDetail)[0];
assert.equal(worldCup.matchStatus, "matched_to_you", "ClayArena avatar initial and surname-first spelling match the shooter profile");
assert.equal(worldCup.ownScore, 159);
assert.equal(worldCup.totalTargets, 200);
assert.deepEqual(worldCup.seriesScores, [19, 23, 21, 15, 25, 22, 19, 15]);
assert.equal(parseClayArenaResults(worldCupHtml.replace("L LUNDE, Torbjorn", "X LUNDE, Torbjorn"), "https://clayarena.com/en/competitions/1763645235430/results/", "Torbjørn Lunde", worldCupDetail)[0].matchStatus, "no_match", "an unrelated leading initial is not discarded");
assert.equal(validateClayArenaUrl("http://clayarena.com/en/competitions/x/results/"), null);
assert.equal(validateClayArenaUrl("https://evil.example/competitions/x/results/"), null);
assert.equal(validateClayArenaUrl("https://clayarena.com/en/profile/x"), null);
assert.deepEqual(parseClayArenaResults("<html>unsupported</html>", url, "Jane Shooter"), []);
const parseRoute = readFileSync("app/api/clayarena/parse/route.ts", "utf8");
assert.match(parseRoute, /response\.body\.getReader\(\)/, "upstream pages are streamed instead of buffered without a limit");
assert.match(parseRoute, /received > MAX_PAGE_BYTES/, "the response body has an enforced byte cap");
assert.match(parseRoute, /matches\.length \? matches : candidates/, "unmatched rows remain available for deliberate review");
const ts = require("typescript");
const module = { exports: {} };
const js = ts.transpileModule(parseRoute, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("require", "module", "exports", js)((name) => {
  if (name === "next/server") return { NextResponse: {} };
  if (name === "@supabase/supabase-js") return { createClient: () => ({}) };
  if (name === "@/lib/clayarena/parser") return { parseClayArenaResults, validateClayArenaUrl };
  if (name === "@/lib/profile") return { shooterProfileDisplayName: () => "" };
  throw new Error(`Unexpected parse route import: ${name}`);
}, module, module.exports);
const { readLimitedHtml } = module.exports.__test;
assert.equal((await readLimitedHtml(new Response("x".repeat(3_472_721), { headers: { "content-type": "text/html" } }))).length, 3_472_721, "832-shooter championship page fits under the bounded limit");
await assert.rejects(readLimitedHtml(new Response("x", { headers: { "content-type": "text/html", "content-length": "9000000" } })), /too large/, "oversized pages remain bounded");
const importPage = readFileSync("app/import/clayarena/page.tsx", "utf8");
assert.match(importPage, /async function findResult[\s\S]*try {[\s\S]*finally {[\s\S]*setBusy\(false\)/, "find failures restore controls");
assert.match(importPage, /async function save[\s\S]*try {[\s\S]*finally {[\s\S]*setBusy\(false\)/, "save failures restore controls");
rmSync(".clayarena-test-build", { recursive: true, force: true });
console.log("ClayArena import parser tests passed");
