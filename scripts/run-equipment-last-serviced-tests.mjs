import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEquipmentSnapshot } from "../lib/equipment/logSnapshots.ts";
import { formatLastServicedDate, normalizeLastServicedDate } from "../lib/equipment/serviceDates.ts";

assert.equal(formatLastServicedDate(null), "Not recorded", "missing service date displays Not recorded");
assert.equal(formatLastServicedDate("2026-07-12"), "12 Jul 2026", "default service date display stays English");
assert.equal(formatLastServicedDate("2026-07-12", "en-US"), "Jul 12, 2026", "callers can override the display locale when needed");
assert.deepEqual(normalizeLastServicedDate("", "2026-07-19"), { ok: true, value: null }, "clearing service date saves null");
assert.deepEqual(normalizeLastServicedDate("2026-07-19", "2026-07-19"), { ok: true, value: "2026-07-19" }, "current date is accepted");
assert.deepEqual(normalizeLastServicedDate("2026-07-12", "2026-07-19"), { ok: true, value: "2026-07-12" }, "past date is accepted");
assert.equal(normalizeLastServicedDate("2026-07-20", "2026-07-19").ok, false, "future service date is rejected");
assert.equal(normalizeLastServicedDate("2026-02-29", "2026-07-19").ok, false, "non-leap-year February 29 is rejected");
assert.deepEqual(normalizeLastServicedDate("2024-02-29", "2026-07-19"), { ok: true, value: "2024-02-29" }, "leap-day service date is accepted in a leap year");
assert.equal(normalizeLastServicedDate("2026-13-01", "2026-07-19").ok, false, "impossible month is rejected");

const equipmentPage = readFileSync("app/equipment/page.tsx", "utf8");
assert.match(equipmentPage, /last_serviced_on: weapon\.last_serviced_on \|\| ""/, "editing loads existing service date into full weapon form state");
assert.match(equipmentPage, /last_serviced_on: lastServiced\.value/, "saving unrelated weapon edits preserves or explicitly clears service date from form state");
assert.match(equipmentPage, /max=\{todayDateInputValue\(\)\}/, "date input caps selectable date at today");

const migration = readFileSync("supabase/migrations/20260719090000_equipment_weapon_last_serviced.sql", "utf8");
assert.match(migration, /equipment_weapons_last_serviced_not_future/, "migration names the last-serviced future-date constraint");
assert.match(migration, /check \(last_serviced_on is null or last_serviced_on <= current_date\)/, "database check allows null/current/past service dates and rejects future dates");

const snapshot = buildEquipmentSnapshot(
  { weaponId: "w1", ammunitionId: "a1", includeChokes: true },
  [{ id: "w1", display_name: "Competition gun", manufacturer: "Blaser", model: "F3", weapon_type: "over_under", gauge: "12 gauge", is_default: true, choke_configuration_type: "interchangeable", last_serviced_on: "2026-07-12" }],
  [{ id: "a1", manufacturer: "Gamebore", product_name: "Evo", gauge: "12 gauge", payload_grams: 28, shot_size: "7.5", is_default: true }],
  [{ id: "as1", weapon_id: "w1", slot: "upper", choke_id: null, setup_mode: "not_set", fixed_choke_label: null }],
  []
);
assert.equal(snapshot.weapon.last_serviced_on, undefined, "Equipment session snapshots do not include current service state");
assert.equal(JSON.stringify(snapshot).includes("last_serviced"), false, "snapshot payload contains no last serviced field");

console.log("Equipment last-serviced regression tests passed.");
