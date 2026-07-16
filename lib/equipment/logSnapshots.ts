export type EquipmentWeapon = { id: string; display_name: string; manufacturer: string | null; model: string | null; weapon_type: string; gauge: string | null; is_default: boolean; choke_configuration_type?: string | null };
export type EquipmentAmmo = { id: string; manufacturer: string; product_name: string | null; gauge: string | null; payload_grams: number | null; shot_size: string | null; is_default: boolean };
export type EquipmentChoke = { id: string; weapon_id: string; label: string; manufacturer: string | null; standard_designation?: string | null; fraction_designation?: string | null; model_or_series?: string | null; manufacturer_marking?: string | null };
export type EquipmentAssignment = { id: string; weapon_id: string; slot: string; choke_id: string | null; setup_mode?: string | null; fixed_choke_label: string | null; fixed_standard_designation?: string | null; fixed_fraction_designation?: string | null; fixed_manufacturer_marking?: string | null };
export type EquipmentSelection = { weaponId: string; ammunitionId: string; includeChokes: boolean };

export function slotLabel(slot: string) {
  const labels: Record<string, string> = { upper: "Top", lower: "Bottom", left: "Left", right: "Right", single: "Choke" };
  return labels[slot] || slot;
}

export function weaponTechnicalSummary(weapon?: Pick<EquipmentWeapon, "manufacturer" | "model" | "gauge"> | null) {
  if (!weapon) return "";
  return [weapon.manufacturer, weapon.model, weapon.gauge].filter(Boolean).join(" · ");
}

export function weaponSummary(weapon?: EquipmentWeapon | null) {
  if (!weapon) return "";
  return weapon.display_name?.trim() || weaponTechnicalSummary(weapon);
}

export function weaponOptionLabel(weapon?: EquipmentWeapon | null) {
  if (!weapon) return "";
  const primary = weaponSummary(weapon);
  const secondary = weaponTechnicalSummary(weapon);
  return secondary && secondary !== primary ? `${primary} — ${secondary}` : primary;
}

export function ammoSummary(ammo?: EquipmentAmmo | null) {
  if (!ammo) return "";
  const payload = ammo.payload_grams ? `${ammo.payload_grams} g` : null;
  return [ammo.manufacturer, ammo.product_name, payload, ammo.shot_size].filter(Boolean).join(" · ");
}

export function chokeLabelFromAssignment(assignment: EquipmentAssignment, choke?: EquipmentChoke | null) {
  const standard = choke?.standard_designation || assignment.fixed_standard_designation || null;
  const label = choke?.label || assignment.fixed_choke_label || standard || "Not set";
  const fraction = choke?.fraction_designation || assignment.fixed_fraction_designation || null;
  return fraction ? `${label} · ${fraction}` : label;
}

export function buildEquipmentSnapshot(selection: EquipmentSelection, weapons: EquipmentWeapon[], ammo: EquipmentAmmo[], assignments: EquipmentAssignment[], chokes: EquipmentChoke[]) {
  const weapon = weapons.find((item) => item.id === selection.weaponId) || null;
  const ammunition = ammo.find((item) => item.id === selection.ammunitionId) || null;
  const selectedAssignments = weapon && selection.includeChokes ? assignments.filter((item) => item.weapon_id === weapon.id) : [];
  if (!weapon && !ammunition && selectedAssignments.length === 0) return null;
  return {
    version: 1,
    weapon: weapon ? { id: weapon.id, manufacturer: weapon.manufacturer, model: weapon.model, gauge: weapon.gauge, display_label: weaponSummary(weapon), technical_label: weaponTechnicalSummary(weapon) } : null,
    ammunition: ammunition ? { id: ammunition.id, manufacturer: ammunition.manufacturer, product_name: ammunition.product_name, gauge: ammunition.gauge, payload: ammunition.payload_grams, shot_size: ammunition.shot_size, display_label: ammoSummary(ammunition) } : null,
    chokes: selectedAssignments.map((assignment) => {
      const choke = chokes.find((item) => item.id === assignment.choke_id) || null;
      const display = `${slotLabel(assignment.slot)}: ${chokeLabelFromAssignment(assignment, choke)}`;
      return { assignment_id: assignment.id, choke_id: choke?.id || null, barrel_slot: assignment.slot, setup_type: assignment.setup_mode || (assignment.choke_id ? "interchangeable" : "fixed"), choke_manufacturer: choke?.manufacturer || null, model_or_series: choke?.model_or_series || null, standard_designation: choke?.standard_designation || assignment.fixed_standard_designation || null, fraction: choke?.fraction_designation || assignment.fixed_fraction_designation || null, manufacturer_marking: choke?.manufacturer_marking || assignment.fixed_manufacturer_marking || null, display_summary: display };
    }),
  };
}

export function equipmentSnapshotLines(snapshot: any): string[] {
  if (!snapshot) return [];
  return [snapshot.weapon?.display_label || [snapshot.weapon?.manufacturer, snapshot.weapon?.model, snapshot.weapon?.gauge].filter(Boolean).join(" · "), snapshot.weapon?.technical_label && snapshot.weapon?.technical_label !== snapshot.weapon?.display_label ? snapshot.weapon.technical_label : null, snapshot.ammunition?.display_label || [snapshot.ammunition?.manufacturer, snapshot.ammunition?.product_name, snapshot.ammunition?.payload ? `${snapshot.ammunition.payload} g` : null, snapshot.ammunition?.shot_size].filter(Boolean).join(" · "), ...(snapshot.chokes || []).map((item: any) => item.display_summary)].filter(Boolean);
}
