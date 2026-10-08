import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);

const page = readFileSync("app/coach-report/page.tsx", "utf8");
const shooter = page.split('if (shooterView) return')[1].split('return <main className="coachReportPage">')[0];
assert.ok(shooter.includes("Find my focus"));
assert.ok(shooter.includes('aiReport && !previewNeedsUpdate'));
assert.ok(shooter.includes('generating || !selectedSessions.length'));
assert.ok(shooter.includes('fromDate > toDate'));
assert.ok(shooter.includes('<details className="card labFocusSettings">'));
assert.ok(shooter.indexOf('labFocusResults') < shooter.indexOf('labFocusSettings'));
assert.ok(shooter.includes('Not an AI analysis'));
assert.ok(shooter.includes('repeatedMissCategories[0].isBroad'));
assert.ok(shooter.includes('leirdueFieldContexts.length > 0'));
assert.doesNotMatch(shooter, /Deterministic|Copy visible report|Training plan for next|Update evidence preview|How to train it/);
assert.match(page, /finally\s*\{\s*setGenerating\(false\)/);
const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /input\[type="date"\][^}]*box-sizing: border-box[^}]*min-width: 0/);
assert.match(css, /max-width: 360px[^}]*grid-template-columns: 1fr/);

const source = readFileSync("lib/ai/labInsightsPrompt.ts", "utf8");
const module = { exports: {} };
new Function("module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
const prompt = module.exports.buildLabInsightsPrompt({ repeatedMissCategories: [{ label: "Technical", count: 11, isBroad: true }], confidence: { level: "Limited" } });
for (const phrase of ["not actionable diagnoses", "within one session", "one concrete way", "not all misses", "no repeated boilerplate", "how to judge progress"]) assert.ok(prompt.includes(phrase), phrase);
assert.ok(prompt.includes('"Technical"'));

// Render the real page with controlled client state; no user account or AI spend.
const { renderToStaticMarkup } = require("react-dom/server");
execSync("node scripts/run-coach-report-period-tests.mjs", { stdio: "inherit" });
const { buildPeriodCoachReport } = await import("../.coach-report-period-test-build/analysis/coachReportPeriod.js");
const { normalizeDisciplineGroup } = await import("../.coach-report-period-test-build/analysis/coachReportEvidence.js");
const selectionModule = { exports: {} };
new Function("module", "exports", ts.transpileModule(readFileSync("lib/analysis/analysisSelection.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(selectionModule, selectionModule.exports);
assert.equal(selectionModule.exports.analysisMonthsRange(12, new Date(2024, 1, 29)).fromDate, "2023-02-28", "leap day clamps instead of rolling into March");
assert.equal(selectionModule.exports.analysisMonthsRange(3, new Date(2026, 4, 31)).fromDate, "2026-02-28", "month-end clamps");
assert.equal(selectionModule.exports.validAnalysisDate("2026-02-30"), false);
assert.equal(selectionModule.exports.analysisSelectionFromQuery("?from=2026-02-30&to=2026-10-01", { fromDate: "2025-10-01", toDate: "2026-10-01" }).fromDate, "2025-10-01");
const sessions = [{ id: "one", name: "Example competition", discipline: "FITASC Sporting", session_type: "Competition", own_score: 80, total_targets: 100, competition_date: "2026-09-20" }];
function renderPage({ ai = null, from = "2025-10-01", selected = new Set(["one"]), busy = false, discipline = "" } = {}) {
  let index = 0;
  const states = [from, "2026-10-01", sessions, [], [], [], [], [], "idle", "", ai, "", "", busy, "", false, selected, false, "", false, { fromDate: "2025-10-01", toDate: "2026-10-01", selectedIds: ["one"], includeNotesContext: false }, discipline];
  const module = { exports: {} };
  const mockedRequire = (id) => {
    if (id === "react") return { useState: () => [states[index++], () => {}], useEffect: () => {}, useMemo: (fn) => fn() };
    if (id === "next/link") return { __esModule: true, default: ({ href, children, ...props }) => require("react").createElement("a", { href, ...props }, children) };
    if (id === "next/navigation") return { useRouter: () => ({ push() {} }) };
    if (id === "@/lib/analysis/coachReportPeriod") return { buildPeriodCoachReport };
    if (id === "@/lib/analysis/coachReportEvidence") return { normalizeDisciplineGroup };
    if (id === "@/lib/analysis/analysisSelection") return selectionModule.exports;
    if (id === "@/lib/ai/labInsightsPrompt") return { LAB_INSIGHTS_AI_SECTIONS: ["What stands out", "What to work on", "How to train it", "What to check next", "Evidence and uncertainty"] };
    if (id.startsWith("@/")) return {};
    return require(id);
  };
  const js = ts.transpileModule(page, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("module", "exports", "require", js)(module, module.exports, mockedRequire);
  return renderToStaticMarkup(module.exports.PeriodAnalysisPage({ audience: "shooter" }));
}
const initial = renderPage();
assert.ok(initial.includes("Find my focus"));
assert.ok(initial.includes("12 months") && initial.includes("All history") && initial.includes("FITASC Sporting"));
assert.ok(!initial.includes("How to train it"), "pre-AI data is not presented as training advice");
assert.ok(!initial.includes("Deterministic"));
const ai = { reportText: "What stands out\nExample recorded pattern\nWhat to work on\nExample priority\nHow to train it\nExample observation task\nWhat to check next\nExample question\nEvidence and uncertainty\nLimited evidence", sections: [] };
assert.ok(renderPage({ ai }).includes("Example priority"));
assert.ok(renderPage({ ai: { ...ai, mainFocus: 'My specific focus', cards: [{ title: 'What to work on', items: ['Structured priority'] }] } }).includes('My specific focus'));
assert.ok(renderPage({ ai: { ...ai, mainFocus: 'My specific focus', cards: [{ title: 'What to work on', items: ['Structured priority'] }] } }).includes('Structured priority'));
assert.ok(!renderPage({ ai, from: "2026-08-01" }).includes("Example priority"), "stale AI content is hidden after selection changes");
assert.ok(!renderPage({ ai, discipline: "Trap" }).includes("Example priority"), "discipline changes hide old AI before selection-reset effect runs");
assert.match(renderPage({ busy: true }), /disabled=""[^>]*>Finding your focus/);
assert.ok(renderPage({ selected: new Set() }).includes("No sessions selected"));
console.log("Lab Insights presentation and prompt checks passed");
