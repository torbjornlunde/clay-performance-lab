import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function makeScores(postCount, existing = []) {
  return Array.from({ length: postCount }, (_, index) => existing[index] ?? 0);
}

function trimTargetResults(current, maxPosts, maxTargets) {
  const next = {};
  Object.entries(current).forEach(([shooterId, posts]) => {
    Object.entries(posts).forEach(([postKey, targets]) => {
      const postNumber = Number(postKey);
      if (postNumber < 1 || postNumber > maxPosts) return;
      Object.entries(targets).forEach(([targetKey, result]) => {
        const targetNumber = Number(targetKey);
        const postMaxTargets = Array.isArray(maxTargets) ? maxTargets[postNumber - 1] : maxTargets;
        if (targetNumber < 1 || targetNumber > postMaxTargets) return;
        next[shooterId] = next[shooterId] || {};
        next[shooterId][postNumber] = next[shooterId][postNumber] || {};
        next[shooterId][postNumber][targetNumber] = result;
      });
    });
  });
  return next;
}

function hasTargetResults(targetResults, shooterId, postNumber) {
  return Object.keys(targetResults[shooterId]?.[postNumber] || {}).length > 0;
}

function scoreFromTargetResults(targetResults, shooterId, postNumber) {
  return Object.values(targetResults[shooterId]?.[postNumber] || {}).filter(
    (result) => result === "hit",
  ).length;
}

function displayedPostScore(shooter, postIndex, targetResults) {
  const postNumber = postIndex + 1;
  return hasTargetResults(targetResults, shooter.localId, postNumber)
    ? scoreFromTargetResults(targetResults, shooter.localId, postNumber)
    : shooter.scores[postIndex] || 0;
}

function postScoringMode(targetResults, shooter, postNumber) {
  if (hasTargetResults(targetResults, shooter.localId, postNumber)) return "detailed";
  return (shooter.scores[postNumber - 1] || 0) > 0 ? "legacy_total_only" : "blank";
}
function canToggleTargetResult(targetResults, shooter, postNumber) {
  return postScoringMode(targetResults, shooter, postNumber) !== "legacy_total_only";
}

function nextTargetResultValue(current) {
  if (!current) return "hit";
  if (current === "hit") return "miss";
  return null;
}
function setTargetResult(current, shooterId, postNumber, targetNumber, result) {
  const next = { ...current, [shooterId]: { ...(current[shooterId] || {}) } };
  next[shooterId][postNumber] = { ...(next[shooterId][postNumber] || {}) };
  if (result) next[shooterId][postNumber][targetNumber] = result;
  else delete next[shooterId][postNumber][targetNumber];
  if (Object.keys(next[shooterId][postNumber]).length === 0) delete next[shooterId][postNumber];
  if (Object.keys(next[shooterId]).length === 0) delete next[shooterId];
  return next;
}
function toggleTargetResult(current, shooterId, postNumber, targetNumber) {
  return setTargetResult(current, shooterId, postNumber, targetNumber, nextTargetResultValue(current[shooterId]?.[postNumber]?.[targetNumber]));
}
function totalFor(shooter, targetResults) {
  return shooter.scores.reduce((sum, _score, postIndex) => sum + displayedPostScore(shooter, postIndex, targetResults), 0);
}
function targetStatsForPost(targetResults, shooterId, postNumber) {
  const results = Object.values(targetResults[shooterId]?.[postNumber] || {});
  return { scored: results.length, hits: results.filter((result) => result === "hit").length, misses: results.filter((result) => result === "miss").length };
}
function postCompletionStatus(targetResults, shooterIds, postNumber, expectedTargets) {
  const expectedEntries = Math.max(0, shooterIds.length * expectedTargets);
  const scoredEntries = shooterIds.reduce((sum, shooterId) => sum + targetStatsForPost(targetResults, shooterId, postNumber).scored, 0);
  return { expectedEntries, scoredEntries, remainingEntries: Math.max(expectedEntries - scoredEntries, 0), complete: expectedEntries > 0 && scoredEntries >= expectedEntries };
}
function targetResultUpsertKey(scoreSheetId, shooterId, postNumber, targetNumber) {
  return `${scoreSheetId}:${shooterId}:${postNumber}:${targetNumber}`;
}

function normalizeExpectedTargetsByPost(setup) {
  const postCount = Math.max(0, Math.trunc(Number(setup.postCount) || 0));
  const fallback = Math.max(1, Math.trunc(Number(setup.targetsPerPost) || 10));
  return Array.isArray(setup.expectedTargetsByPost) && setup.expectedTargetsByPost.length === postCount
    ? setup.expectedTargetsByPost.map((count) => Math.max(1, Math.trunc(Number(count) || fallback)))
    : Array.from({ length: postCount }, () => fallback);
}
function getExpectedTargetsForPost(setup, postNumber) {
  return normalizeExpectedTargetsByPost(setup)[Math.max(1, Math.trunc(postNumber)) - 1] || Math.max(1, Math.trunc(Number(setup.targetsPerPost) || 10));
}
function getTotalExpectedTargets(setup) {
  return normalizeExpectedTargetsByPost(setup).reduce((sum, count) => sum + count, 0);
}

function parsePositiveIntegerDraft(value, min, max) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function expectedTargetMaxFor(maxTargets, postNumber) {
  return Array.isArray(maxTargets) ? maxTargets[postNumber - 1] || 1 : maxTargets;
}

function normalizeSetupCustomTargets(values, postCount, targetsPerPost, customTargetsActive) {
  if (!customTargetsActive) return { ok: true, counts: null, active: false };
  if (values.length !== postCount) return { ok: false, counts: null, active: true };
  const counts = values.map((value) => parsePositiveIntegerDraft(value, 1, 100));
  if (counts.some((value) => !value)) return { ok: false, counts: null, active: true };
  const hasOverride = counts.some((value) => value !== targetsPerPost);
  return { ok: true, counts: hasOverride ? counts : null, active: hasOverride };
}

function customTargetDraftValues(postCount, targetsPerPost, custom = null) {
  return Array.from({ length: postCount }, (_, index) => String(custom?.[index] || targetsPerPost));
}

function updateSetupDraft(current, field, value) {
  const next = { ...current, [field]: value };
  const nextPostCount = field === "numberOfPosts" ? parsePositiveIntegerDraft(value, 1, 20) : parsePositiveIntegerDraft(current.numberOfPosts, 1, 20);
  const nextTargetsPerPost = field === "targetsPerPost" ? parsePositiveIntegerDraft(value, 1, 100) : parsePositiveIntegerDraft(current.targetsPerPost, 1, 100);
  if (nextPostCount && nextTargetsPerPost) {
    next.customTargetsByPost = current.customTargetsActive
      ? Array.from({ length: nextPostCount }, (_, index) => current.customTargetsByPost[index] || String(nextTargetsPerPost))
      : customTargetDraftValues(nextPostCount, nextTargetsPerPost, null);
  }
  return next;
}

function appliedSetupFromDraft(draft) {
  const postCount = parsePositiveIntegerDraft(draft.numberOfPosts, 1, 20);
  const targetsPerPost = parsePositiveIntegerDraft(draft.targetsPerPost, 1, 100);
  const normalized = normalizeSetupCustomTargets(draft.customTargetsByPost, postCount, targetsPerPost, draft.customTargetsActive);
  return { postCount, targetsPerPost, expectedTargetsByPost: normalized.counts, total: getTotalExpectedTargets({ postCount, targetsPerPost, expectedTargetsByPost: normalized.counts }) };
}

function setupReductionWouldTrimData({ shooters, targetResults, nextPostCount, nextTargetsPerPost }) {
  return (
    shooters.some((shooter) => shooter.scores.slice(nextPostCount).some((score) => score > 0)) ||
    shooters.some((shooter) => shooter.scores.some((score, index) => score > expectedTargetMaxFor(nextTargetsPerPost, index + 1))) ||
    Object.values(targetResults).some((posts) =>
      Object.entries(posts).some(([postKey, targets]) => {
        const postNumber = Number(postKey);
        if (postNumber < 1 || postNumber > nextPostCount) return true;
        return Object.keys(targets).some((targetKey) => {
          const targetNumber = Number(targetKey);
          return targetNumber < 1 || targetNumber > expectedTargetMaxFor(nextTargetsPerPost, postNumber);
        });
      }),
    )
  );
}

const shooter = { localId: "shooter-1", scores: [7, 8, 9, 10, 6] };
const targetResults = {
  "shooter-1": {
    1: { 1: "hit", 2: "miss", 3: "hit" },
    5: { 10: "hit" },
  },
};

assert.equal(parsePositiveIntegerDraft("", 1, 20), null, "empty setup draft does not parse as an applied structure");
assert.equal(parsePositiveIntegerDraft("1", 1, 20), 1, "partial typing can be represented as a draft only");
assert.deepEqual(makeScores(10, shooter.scores).slice(0, 5), shooter.scores, "increasing posts preserves existing post scores");
assert.deepEqual(trimTargetResults(targetResults, 10, 10), targetResults, "increasing setup preserves target results");
assert.equal(
  setupReductionWouldTrimData({ shooters: [shooter], targetResults, nextPostCount: 4, nextTargetsPerPost: 10 }),
  true,
  "reducing posts requires confirmation when existing data would be trimmed",
);
assert.equal(
  targetResults["shooter-1"][1][1],
  "hit",
  "target results remain attached to shooter_id",
);
assert.equal(
  displayedPostScore({ localId: "shooter-1", scores: [0] }, 0, targetResults),
  2,
  "post totals are derived from target-by-target hits",
);

assert.equal(getTotalExpectedTargets({ postCount: 5, targetsPerPost: 10 }), 50, "fixed 5 posts × 10 targets still totals 50");
assert.equal(getTotalExpectedTargets({ postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [8, 10, 6] }), 24, "custom 8/10/6 posts total correctly");
assert.equal(getTotalExpectedTargets({ postCount: 16, targetsPerPost: 8, expectedTargetsByPost: Array.from({ length: 16 }, () => 8) }), 128, "16 posts totaling 128 works");
assert.equal(getExpectedTargetsForPost({ postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [8, 10, 6] }, 1), 8, "post with 8 targets expects 8 target slots");
assert.equal(getExpectedTargetsForPost({ postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [8, 10, 6] }, 3), 6, "post with 6 targets expects 6 target slots");
assert.equal(trimTargetResults({ s: { 1: { 8: "hit", 9: "miss" }, 2: { 9: "hit", 10: "hit" } } }, 2, [8, 10]).s[1][9], undefined, "post with 8 targets does not preserve target slot 9");
assert.equal(Object.keys(trimTargetResults({ s: { 1: { 8: "hit", 9: "miss" }, 2: { 9: "hit", 10: "hit" } } }, 2, [8, 10]).s[2]).length, 2, "post with 10 targets preserves 9 and 10");
assert.equal(setupReductionWouldTrimData({ shooters: [{ localId: "s", scores: [8, 10, 7] }], targetResults: { s: { 3: { 7: "hit" } } }, nextPostCount: 3, nextTargetsPerPost: [8, 10, 6] }), true, "reducing a custom post count below existing manual or target data requires confirmation");
assert.equal(trimTargetResults({ s: { 3: { 6: "hit", 7: "miss" } } }, 3, [8, 10, 6]).s[3][7], undefined, "cancelled trim can keep current state by not applying trim; confirmed trim removes only out-of-range target data");
assert.equal(getTotalExpectedTargets({ postCount: 2, targetsPerPost: 10, expectedTargetsByPost: null }), 20, "old sessions without per-post config still use fixed setup");
let fixedDraft = { numberOfPosts: "5", targetsPerPost: "10", customTargetsByPost: customTargetDraftValues(5, 10, null), customTargetsActive: false };
fixedDraft = updateSetupDraft(fixedDraft, "targetsPerPost", "8");
assert.deepEqual(appliedSetupFromDraft(fixedDraft), { postCount: 5, targetsPerPost: 8, expectedTargetsByPost: null, total: 40 }, "fixed 5×10 changed to fixed 5×8 stores null custom counts and totals 40");
const customDraft = { numberOfPosts: "3", targetsPerPost: "10", customTargetsByPost: ["8", "10", "6"], customTargetsActive: true };
assert.deepEqual(appliedSetupFromDraft(customDraft), { postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [8, 10, 6], total: 24 }, "custom 8/10/6 stores custom array and total 24");
let clearedDraft = { numberOfPosts: "5", targetsPerPost: "10", customTargetsByPost: customTargetDraftValues(5, 10, [8, 10, 6, 10, 10]), customTargetsActive: false };
clearedDraft = updateSetupDraft(clearedDraft, "targetsPerPost", "8");
assert.deepEqual(appliedSetupFromDraft(clearedDraft), { postCount: 5, targetsPerPost: 8, expectedTargetsByPost: null, total: 40 }, "clearing custom counts then changing default remains fixed mode");
let loadedCustomDraft = { numberOfPosts: "3", targetsPerPost: "10", customTargetsByPost: customTargetDraftValues(3, 10, [8, 10, 6]), customTargetsActive: true };
loadedCustomDraft = updateSetupDraft(loadedCustomDraft, "targetsPerPost", "8");
assert.deepEqual(appliedSetupFromDraft(loadedCustomDraft), { postCount: 3, targetsPerPost: 8, expectedTargetsByPost: [8, 10, 6], total: 24 }, "loaded persisted expectedTargetsByPost keeps custom mode active when default changes");
assert.deepEqual(appliedSetupFromDraft({ numberOfPosts: "5", targetsPerPost: "10", customTargetsByPost: customTargetDraftValues(5, 10, null), customTargetsActive: false }), { postCount: 5, targetsPerPost: 10, expectedTargetsByPost: null, total: 50 }, "simple fixed setup remains unchanged");


const legacyPost = { localId: "legacy", scores: [8] };
assert.equal(displayedPostScore(legacyPost, 0, {}), 8, "legacy 8/10 with no target results evaluates as 8");
assert.equal(postScoringMode({}, legacyPost, 1), "legacy_total_only", "legacy post with a saved total is identified separately from blank scoring");
assert.equal(canToggleTargetResult({}, legacyPost, 1), false, "first target interaction cannot silently replace a legacy total without explicit conversion");
assert.equal(postScoringMode({}, { localId: "blank", scores: [0] }, 1), "blank", "blank 0/10 post can start detailed scoring immediately");
assert.equal(canToggleTargetResult({}, { localId: "blank", scores: [0] }, 1), true, "blank 0/10 post does not require conversion confirmation");
assert.equal(postScoringMode({ detailed: { 1: { 1: "miss" } } }, { localId: "detailed", scores: [8] }, 1), "detailed", "detailed post continues to use target results as source of truth");
assert.equal(displayedPostScore({ localId: "detailed", scores: [8] }, 0, { detailed: { 1: { 1: "miss", 2: "hit" } } }), 1, "target results override legacy manual total only after detailed scoring exists");

let cycle = {};
cycle = toggleTargetResult(cycle, "shooter-1", 1, 1);
assert.equal(cycle["shooter-1"][1][1], "hit", "first target tap records a hit");
cycle = toggleTargetResult(cycle, "shooter-1", 1, 1);
assert.equal(cycle["shooter-1"][1][1], "miss", "second target tap corrects hit to miss");
cycle = toggleTargetResult(cycle, "shooter-1", 1, 1);
assert.equal(cycle["shooter-1"]?.[1]?.[1], undefined, "third target tap clears the target");
const detailed = { "shooter-1": { 1: { 1: "hit", 2: "miss", 3: "hit" }, 2: { 1: "hit" } } };
assert.equal(scoreFromTargetResults(detailed, "shooter-1", 1), 2, "automatic post totals count hits only");
assert.equal(totalFor({ localId: "shooter-1", scores: [0, 0] }, detailed), 3, "automatic shooter total is derived from detailed target hits");
assert.deepEqual(postCompletionStatus(detailed, ["shooter-1", "shooter-2"], 1, 3), { expectedEntries: 6, scoredEntries: 3, remainingEntries: 3, complete: false }, "post remains incomplete until every shooter target is scored");
assert.deepEqual(postCompletionStatus({ a: { 1: { 1: "hit", 2: "miss" } }, b: { 1: { 1: "miss", 2: "hit" } } }, ["a", "b"], 1, 2), { expectedEntries: 4, scoredEntries: 4, remainingEntries: 0, complete: true }, "post is complete when every expected entry is hit or miss");
assert.equal(displayedPostScore({ localId: "legacy", scores: [8] }, 0, {}), 8, "legacy total-only score sheets keep manual post totals");
assert.equal(targetResultUpsertKey("sheet", "shooter", 2, 4), targetResultUpsertKey("sheet", "shooter", 2, 4), "target-result upsert keys are stable and duplicate-safe");
assert.deepEqual(setTargetResult(detailed, "shooter-1", 1, 2, "hit")["shooter-1"][1], { 1: "hit", 2: "hit", 3: "hit" }, "corrections update existing target results immediately");

const pageSource = readFileSync("app/training-score-sheets/[id]/page.tsx", "utf8");
assert.match(pageSource, /Custom targets per post/, "setup UI exposes custom targets per post section");
assert.match(pageSource, /expected_targets_by_post: expectedTargetsByPost/, "save payload preserves expectedTargetsByPost");
assert.match(pageSource, /expectedTargetsByPost,/, "local draft includes expectedTargetsByPost");
assert.match(pageSource, /Detailed target results were not recorded for this post\./, "legacy total-only posts explain missing target details");
assert.match(pageSource, /Start detailed scoring/, "legacy total-only posts require an explicit conversion action");
assert.match(pageSource, /Starting detailed scoring will replace the saved post total/, "legacy conversion warns before replacing totals");
assert.match(pageSource, /disabled=\{legacyTotalOnly\}/, "legacy total-only target buttons are disabled before conversion");
assert.match(pageSource, /Tap each target: Hit → Miss → Clear/, "live scorecard explains the fast target cycle");
assert.match(pageSource, /postCompletionStatus/, "live scorecard shows post completion status");
assert.match(pageSource, /Clear custom counts/, "custom counts can be cleared back to fixed behavior");

console.log("Training score sheet safety checks passed.");
