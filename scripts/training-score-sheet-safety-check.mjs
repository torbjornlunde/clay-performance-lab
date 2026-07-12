import assert from "node:assert/strict";

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

function setupReductionWouldTrimData({ shooters, targetResults, nextPostCount, nextTargetsPerPost }) {
  return (
    shooters.some((shooter) => shooter.scores.slice(nextPostCount).some((score) => score > 0)) ||
    shooters.some((shooter) => shooter.scores.some((score) => score > nextTargetsPerPost)) ||
    Object.values(targetResults).some((posts) =>
      Object.entries(posts).some(([postKey, targets]) => {
        const postNumber = Number(postKey);
        if (postNumber < 1 || postNumber > nextPostCount) return true;
        return Object.keys(targets).some((targetKey) => {
          const targetNumber = Number(targetKey);
          return targetNumber < 1 || targetNumber > nextTargetsPerPost;
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
assert.equal(getTotalExpectedTargets({ postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [6, 8, 10] }), 24, "variable 6/8/10 posts total correctly");
assert.equal(getTotalExpectedTargets({ postCount: 16, targetsPerPost: 8, expectedTargetsByPost: Array.from({ length: 16 }, () => 8) }), 128, "16 posts totaling 128 works");
assert.equal(getExpectedTargetsForPost({ postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [6, 8, 10] }, 2), 8, "post breakdown denominator uses each post count");
assert.equal(trimTargetResults({ s: { 1: { 8: "hit", 9: "miss" }, 2: { 9: "hit", 10: "hit" } } }, 2, [8, 10]).s[1][9], undefined, "post with 8 targets does not preserve target slot 9");
assert.equal(Object.keys(trimTargetResults({ s: { 1: { 8: "hit", 9: "miss" }, 2: { 9: "hit", 10: "hit" } } }, 2, [8, 10]).s[2]).length, 2, "post with 10 targets preserves 9 and 10");
assert.equal(getTotalExpectedTargets({ postCount: 2, targetsPerPost: 10, expectedTargetsByPost: null }), 20, "old sessions without per-post config still use fixed setup");

console.log("Training score sheet safety checks passed.");
