import assert from "node:assert/strict";
import { missValue, totalMisses, scoreFromMisses } from "../lib/misses/scoring.ts";

const cases = [
  { name: "single hit", targets: 1, misses: [], expectedMisses: 0, expectedScore: 1 },
  { name: "single miss", targets: 1, misses: [{ missed_target: "Single target" }], expectedMisses: 1, expectedScore: 0 },
  { name: "pair hit/hit", targets: 2, misses: [], expectedMisses: 0, expectedScore: 2 },
  { name: "pair miss/hit", targets: 2, misses: [{ missed_target: "First target in pair" }], expectedMisses: 1, expectedScore: 1 },
  { name: "pair hit/miss", targets: 2, misses: [{ missed_target: "Second target in pair" }], expectedMisses: 1, expectedScore: 1 },
  { name: "pair miss/miss", targets: 2, misses: [{ missed_target: "Both targets in pair" }], expectedMisses: 2, expectedScore: 0 },
];

for (const testCase of cases) {
  const misses = totalMisses(testCase.misses);
  assert.equal(misses, testCase.expectedMisses, `${testCase.name} miss count`);
  assert.equal(scoreFromMisses(testCase.targets, misses), testCase.expectedScore, `${testCase.name} score`);
}

assert.equal(missValue({ missed_target: "Both targets in pair" }), 2, "double miss row counts as two misses");
console.log("Miss scoring tests passed.");
