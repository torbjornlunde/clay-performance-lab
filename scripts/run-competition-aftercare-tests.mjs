import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const output = ".competition-aftercare-test-build";
rmSync(output, { recursive: true, force: true });
try {
  execFileSync("npx", ["tsc", "lib/equipment/competitionAftercare.ts", "lib/equipment/logSnapshots.ts", "--ignoreConfig", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--outDir", output, "--skipLibCheck"], { stdio: "inherit" });
  const { savedAmmoIds, sortByActualUse, suggestedId, equipmentAftercareSnapshot } = await import(`../${output}/competitionAftercare.js`);
  const ammo = [
    { id: "a", manufacturer: "Gamebore", product_name: "A", payload_grams: 24, shot_size: "7", gauge: "12", is_default: true },
    { id: "b", manufacturer: "Fiocchi", product_name: "B", payload_grams: 24, shot_size: "7.5", gauge: "12", is_default: false },
  ];
  const history = [
    { competition_date: "2026-01-02", equipment_weapon_id: null, equipment_ammunition_profile_id: "a", equipment_snapshot: null },
    { competition_date: "2026-02-02", equipment_weapon_id: null, equipment_ammunition_profile_id: "a", equipment_snapshot: null },
    { competition_date: "2026-03-02", equipment_weapon_id: null, equipment_ammunition_profile_id: "b", equipment_snapshot: null },
    { competition_date: "2026-10-02", equipment_weapon_id: null, equipment_ammunition_profile_id: "b", equipment_snapshot: null },
  ];
  assert.equal(suggestedId(ammo, history, "2026-04-01", "ammo", "2026-09-27"), "a", "most-used equipment before the competition date is suggested");
  assert.deepEqual(sortByActualUse(ammo, history, "2026-04-01", "ammo").map((item) => item.id), ["b", "a"], "picker sorts by actual most recent use");
  assert.equal(suggestedId(ammo, [], "2023-04-01", "ammo", "2026-09-27"), "", "a current default is not assigned to an old import");
  assert.equal(suggestedId(ammo, [], "2026-09-26", "ammo", "2026-09-27"), "a", "a current result can suggest the default");
  const previous = { equipment_ammunition_profile_id: "a", equipment_snapshot: { ammunition: { id: "a" } } };
  assert.deepEqual(savedAmmoIds(previous), ["a"], "legacy single-ammunition snapshots stay readable");
  const snapshot = equipmentAftercareSnapshot(null, [ammo[0], ammo[1]], null);
  assert.deepEqual(savedAmmoIds({ equipment_ammunition_profile_id: "a", equipment_snapshot: snapshot }), ["a", "b"]);
  assert.equal(snapshot.ammunition, null, "a mixed competition must not be attributed to one ammunition type");
  assert.equal(snapshot.ammunitions[1].manufacturer, "Fiocchi", "each type has a historical snapshot");
  assert.deepEqual(equipmentAftercareSnapshot(null, [], null), null, "empty choices do not invent equipment");
  const detail = readFileSync("app/sessions/[id]/page.tsx", "utf8");
  assert.ok(detail.indexOf("Personal note") < detail.indexOf("<CompetitionEquipmentReview"), "note comes before equipment");
  assert.match(detail, /session\.session_type !== "Competition" && <>/, "competition session note is not duplicated lower on the page");
} finally {
  rmSync(output, { recursive: true, force: true });
}
console.log("competition aftercare tests passed");
