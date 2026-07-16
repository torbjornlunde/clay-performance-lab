"use client";

import { useEffect, useMemo, useState } from "react";
import { buildEquipmentSnapshot, ammoSummary, chokeLabelFromAssignment, slotLabel, weaponOptionLabel, weaponSummary, weaponTechnicalSummary, type EquipmentAmmo, type EquipmentAssignment, type EquipmentChoke, type EquipmentSelection, type EquipmentWeapon } from "@/lib/equipment/logSnapshots";
import { supabase } from "@/lib/supabase/client";

type Props = { value: EquipmentSelection; onChange: (selection: EquipmentSelection, snapshot: any) => void; defaultOpen?: boolean };

const emptySelection: EquipmentSelection = { weaponId: "", ammunitionId: "", includeChokes: true };

export function EquipmentUsedSelector({ value, onChange, defaultOpen = false }: Props) {
  const [weapons, setWeapons] = useState<EquipmentWeapon[]>([]);
  const [ammo, setAmmo] = useState<EquipmentAmmo[]>([]);
  const [assignments, setAssignments] = useState<EquipmentAssignment[]>([]);
  const [chokes, setChokes] = useState<EquipmentChoke[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const [w, a, c, ch] = await Promise.all([
      supabase.from("equipment_weapons").select("id,display_name,manufacturer,model,weapon_type,gauge,is_default,choke_configuration_type").eq("user_id", auth.user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("equipment_ammunition_profiles").select("id,manufacturer,product_name,gauge,payload_grams,shot_size,is_default").eq("user_id", auth.user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("equipment_weapon_current_choke_assignments").select("id,weapon_id,slot,choke_id,setup_mode,fixed_choke_label,fixed_standard_designation,fixed_fraction_designation,fixed_manufacturer_marking").eq("user_id", auth.user.id),
      supabase.from("equipment_weapon_chokes").select("id,weapon_id,label,manufacturer,standard_designation,fraction_designation,model_or_series,manufacturer_marking").eq("user_id", auth.user.id),
    ]);
    const err = w.error || a.error || c.error || ch.error;
    if (err) setError("Equipment could not be loaded. You can still save without it.");
    const nextWeapons = (w.data || []) as EquipmentWeapon[];
    const nextAmmo = (a.data || []) as EquipmentAmmo[];
    const nextAssignments = (c.data || []) as EquipmentAssignment[];
    const nextChokes = (ch.data || []) as EquipmentChoke[];
    setWeapons(nextWeapons); setAmmo(nextAmmo); setAssignments(nextAssignments); setChokes(nextChokes); setLoading(false);
    const next = { ...value };
    if (!next.weaponId) next.weaponId = nextWeapons.find((item) => item.is_default)?.id || "";
    if (!next.ammunitionId) next.ammunitionId = nextAmmo.find((item) => item.is_default)?.id || "";
    if (next.weaponId || next.ammunitionId) onChange(next, buildEquipmentSnapshot(next, nextWeapons, nextAmmo, nextAssignments, nextChokes));
  }

  const selectedWeapon = weapons.find((item) => item.id === value.weaponId) || null;
  const selectedAmmo = ammo.find((item) => item.id === value.ammunitionId) || null;
  const selectedAssignments = useMemo(() => assignments.filter((item) => item.weapon_id === value.weaponId), [assignments, value.weaponId]);
  function update(update: Partial<EquipmentSelection>) {
    const next = { ...emptySelection, ...value, ...update };
    const snapshot = buildEquipmentSnapshot(next, weapons, ammo, assignments, chokes);
    onChange(next, snapshot);
  }

  return (
    <details className="subcard equipmentUsedSection" open={defaultOpen}>
      <summary>Equipment used</summary>
      <p className="small muted">Optional. Defaults are preselected when available and saved as a historical snapshot.</p>
      {loading ? <p className="small muted">Loading equipment...</p> : null}
      {error ? <div className="notice small">{error}</div> : null}
      <div className="row">
        <div>
          <label htmlFor="equipment-weapon">Weapon</label>
          <select id="equipment-weapon" value={value.weaponId} onChange={(e) => update({ weaponId: e.target.value })}>
            <option value="">No weapon recorded</option>
            {weapons.map((weapon) => <option key={weapon.id} value={weapon.id}>{weaponOptionLabel(weapon)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="equipment-ammo">Ammunition</label>
          <select id="equipment-ammo" value={value.ammunitionId} onChange={(e) => update({ ammunitionId: e.target.value })}>
            <option value="">No ammunition recorded</option>
            {ammo.map((profile) => <option key={profile.id} value={profile.id}>{ammoSummary(profile)}</option>)}
          </select>
        </div>
      </div>
      {selectedWeapon && selectedAssignments.length > 0 ? (
        <div className="equipmentChokePreview">
          <label><input type="checkbox" checked={value.includeChokes} onChange={(e) => update({ includeChokes: e.target.checked })} /> Record current choke setup</label>
          {value.includeChokes && selectedAssignments.map((assignment) => {
            const choke = chokes.find((item) => item.id === assignment.choke_id);
            return <div className="small muted" key={assignment.id}>{slotLabel(assignment.slot)}: {chokeLabelFromAssignment(assignment, choke)}</div>;
          })}
        </div>
      ) : selectedWeapon ? <p className="small muted">No current choke setup saved for this weapon.</p> : null}
      {selectedWeapon ? (
        <div className="small muted">
          <strong>Selected weapon:</strong> {weaponSummary(selectedWeapon)}
          {weaponTechnicalSummary(selectedWeapon) && weaponTechnicalSummary(selectedWeapon) !== weaponSummary(selectedWeapon) ? <><br />{weaponTechnicalSummary(selectedWeapon)}</> : null}
        </div>
      ) : null}
      {selectedAmmo ? <p className="small muted"><strong>Selected ammunition:</strong> {ammoSummary(selectedAmmo)}</p> : null}
    </details>
  );
}
