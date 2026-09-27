import { ammoSummary, weaponSummary, type EquipmentAmmo, type EquipmentWeapon } from "./logSnapshots";

export type AftercareAmmo = EquipmentAmmo & { is_default: boolean };
export type AftercareWeapon = EquipmentWeapon & { is_default: boolean };
export type EquipmentHistory = {
  competition_date: string | null;
  equipment_weapon_id: string | null;
  equipment_ammunition_profile_id: string | null;
  equipment_snapshot: any;
};

export function savedAmmoIds(session: EquipmentHistory): string[] {
  const snapshot = session.equipment_snapshot;
  const ids = Array.isArray(snapshot?.ammunitions)
    ? snapshot.ammunitions.map((item: any) => item?.id).filter((id: unknown): id is string => typeof id === "string")
    : [];
  return [...new Set(ids.length ? ids : [session.equipment_ammunition_profile_id || snapshot?.ammunition?.id].filter(Boolean))] as string[];
}

function datedUses(history: EquipmentHistory[], date: string | null, kind: "weapon" | "ammo") {
  const counts = new Map<string, { count: number; recent: string }>();
  for (const row of history) {
    const usedOn = row.competition_date?.slice(0, 10);
    if (!usedOn || (date && usedOn > date.slice(0, 10))) continue;
    const ids = kind === "weapon" ? [row.equipment_weapon_id || row.equipment_snapshot?.weapon?.id].filter(Boolean) : savedAmmoIds(row);
    for (const id of ids) {
      const previous = counts.get(id);
      counts.set(id, { count: (previous?.count || 0) + 1, recent: previous && previous.recent > usedOn ? previous.recent : usedOn });
    }
  }
  return counts;
}

export function sortByActualUse<T extends { id: string; is_default: boolean }>(items: T[], history: EquipmentHistory[], date: string | null, kind: "weapon" | "ammo") {
  const uses = datedUses(history, date, kind);
  return [...items].sort((a, b) => {
    const left = uses.get(a.id), right = uses.get(b.id);
    return (right?.recent || "").localeCompare(left?.recent || "") || Number(b.is_default) - Number(a.is_default) || a.id.localeCompare(b.id);
  });
}

export function suggestedId<T extends { id: string; is_default: boolean }>(items: T[], history: EquipmentHistory[], date: string | null, kind: "weapon" | "ammo", today: string) {
  const uses = datedUses(history, date, kind);
  const ranked = [...items].sort((a, b) => (uses.get(b.id)?.count || 0) - (uses.get(a.id)?.count || 0)
    || (uses.get(b.id)?.recent || "").localeCompare(uses.get(a.id)?.recent || "")
    || Number(b.is_default) - Number(a.is_default));
  const best = ranked[0];
  if (!best) return "";
  const last = uses.get(best.id)?.recent;
  // A current default must not become invented equipment on an old imported result.
  const nearDate = date && Math.abs(Date.parse(today) - Date.parse(date.slice(0, 10))) <= 45 * 86400000;
  return last || nearDate ? best.id : "";
}

export function equipmentAftercareSnapshot(weapon: AftercareWeapon | null, ammo: AftercareAmmo[], previous: any) {
  const sameWeapon = weapon?.id && previous?.weapon?.id === weapon.id;
  return weapon || ammo.length ? {
    weapon: weapon ? { id: weapon.id, manufacturer: weapon.manufacturer, model: weapon.model, gauge: weapon.gauge, display_label: weaponSummary(weapon) } : null,
    ammunition: ammo.length === 1 ? { id: ammo[0].id, manufacturer: ammo[0].manufacturer, product_name: ammo[0].product_name, gauge: ammo[0].gauge, payload: ammo[0].payload_grams, shot_size: ammo[0].shot_size, display_label: ammoSummary(ammo[0]) } : null,
    ammunitions: ammo.map((item) => ({ id: item.id, manufacturer: item.manufacturer, product_name: item.product_name, gauge: item.gauge, payload: item.payload_grams, shot_size: item.shot_size, display_label: ammoSummary(item) })),
    chokes: sameWeapon ? previous.chokes || [] : [],
  } : null;
}
