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
        if (targetNumber < 1 || targetNumber > maxTargets) return;
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

console.log("Training score sheet safety checks passed.");
