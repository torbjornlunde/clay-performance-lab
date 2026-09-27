"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ammoSummary, weaponOptionLabel } from "@/lib/equipment/logSnapshots";
import { equipmentAftercareSnapshot, savedAmmoIds, sortByActualUse, suggestedId, type AftercareAmmo, type AftercareWeapon, type EquipmentHistory } from "@/lib/equipment/competitionAftercare";

type Props = {
  session: EquipmentHistory & { id: string; equipment_snapshot: any };
  userId: string;
  onSaved: (weaponId: string | null, ammoId: string | null, snapshot: any) => void;
};

export function CompetitionEquipmentReview({ session, userId, onSaved }: Props) {
  const [weapons, setWeapons] = useState<AftercareWeapon[]>([]);
  const [ammo, setAmmo] = useState<AftercareAmmo[]>([]);
  const [weaponId, setWeaponId] = useState("");
  const [ammoIds, setAmmoIds] = useState<string[]>([]);
  const [suggested, setSuggested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [addMode, setAddMode] = useState<"ammo" | "gun" | null>(null);
  const [newAmmo, setNewAmmo] = useState({ manufacturer: "", product_name: "", gauge: "12", payload_grams: "", shot_size: "" });
  const [newGun, setNewGun] = useState({ display_name: "", manufacturer: "", model: "", gauge: "12", weapon_type: "over_under" });

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setError("");
      const [w, a, h] = await Promise.all([
        supabase.from("equipment_weapons").select("id,display_name,manufacturer,model,weapon_type,gauge,is_default").eq("user_id", userId),
        supabase.from("equipment_ammunition_profiles").select("id,manufacturer,product_name,gauge,payload_grams,shot_size,is_default").eq("user_id", userId),
        supabase.from("sessions").select("competition_date,equipment_weapon_id,equipment_ammunition_profile_id,equipment_snapshot").eq("user_id", userId).eq("session_type", "Competition").order("competition_date", { ascending: false }).limit(500),
      ]);
      if (!alive) return;
      if (w.error || a.error || h.error) {
        setError("Could not load your equipment. Try again later."); setLoading(false); return;
      }
      const history = (h.data || []) as EquipmentHistory[];
      const orderedWeapons = sortByActualUse((w.data || []) as AftercareWeapon[], history, session.competition_date, "weapon");
      const orderedAmmo = sortByActualUse((a.data || []) as AftercareAmmo[], history, session.competition_date, "ammo");
      setWeapons(orderedWeapons); setAmmo(orderedAmmo);
      const savedWeapon = session.equipment_weapon_id || session.equipment_snapshot?.weapon?.id || "";
      const savedAmmo = savedAmmoIds(session);
      const today = new Date().toISOString().slice(0, 10);
      const proposedWeapon = savedWeapon || suggestedId(orderedWeapons, history, session.competition_date, "weapon", today);
      const proposedAmmo = savedAmmo.length ? savedAmmo : [suggestedId(orderedAmmo, history, session.competition_date, "ammo", today)].filter(Boolean);
      setWeaponId(proposedWeapon); setAmmoIds(proposedAmmo);
      setSuggested(!savedWeapon && !savedAmmo.length && Boolean(proposedWeapon || proposedAmmo.length));
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [session.id, userId]);

  function changeAmmo(index: number, id: string) {
    setAmmoIds((current) => current.map((value, position) => position === index ? id : value).filter(Boolean));
    setStatus("");
  }

  async function save() {
    const missing = [weaponId, ...ammoIds].filter(Boolean).filter((id) => !weapons.some((item) => item.id === id) && !ammo.some((item) => item.id === id));
    if (missing.length) { setError("A saved equipment profile is no longer available. Choose a replacement before saving."); return; }
    setSaving(true); setError(""); setStatus("");
    const selectedWeapon = weapons.find((item) => item.id === weaponId) || null;
    const selectedAmmo = [...new Set(ammoIds)].map((id) => ammo.find((item) => item.id === id)).filter((item): item is AftercareAmmo => Boolean(item));
    const snapshot = equipmentAftercareSnapshot(selectedWeapon, selectedAmmo, session.equipment_snapshot);
    const { data, error: saveError } = await supabase.from("sessions").update({
      equipment_weapon_id: selectedWeapon?.id || null,
      equipment_ammunition_profile_id: selectedAmmo.length === 1 ? selectedAmmo[0].id : null,
      equipment_snapshot: snapshot,
    }).eq("id", session.id).eq("user_id", userId).select("id").single();
    setSaving(false);
    if (saveError || !data) { setError("Equipment could not be saved. Please try again."); return; }
    setSuggested(false); setStatus("Equipment saved."); onSaved(selectedWeapon?.id || null, selectedAmmo.length === 1 ? selectedAmmo[0].id : null, snapshot);
  }

  async function createAmmo(event: React.FormEvent) {
    event.preventDefault();
    const grams = Number(newAmmo.payload_grams);
    if (!newAmmo.manufacturer.trim() || !Number.isFinite(grams) || grams <= 0) { setError("Enter a manufacturer and a valid payload."); return; }
    setSaving(true); setError("");
    const { data, error: createError } = await supabase.from("equipment_ammunition_profiles").insert({
      user_id: userId, manufacturer: newAmmo.manufacturer.trim(), product_name: newAmmo.product_name.trim() || null,
      gauge: newAmmo.gauge.trim() || null, payload_grams: grams, shot_size: newAmmo.shot_size.trim() || null, is_default: false,
    }).select("id,manufacturer,product_name,gauge,payload_grams,shot_size,is_default").single();
    setSaving(false);
    if (createError || !data) { setError("Ammunition could not be added. Please try again."); return; }
    setAmmo((items) => [data as AftercareAmmo, ...items]); setAmmoIds((ids) => [...ids, data.id]); setAddMode(null);
    setNewAmmo({ manufacturer: "", product_name: "", gauge: "12", payload_grams: "", shot_size: "" });
    setStatus("Ammunition added. Save equipment to attach it to this result.");
  }

  async function createGun(event: React.FormEvent) {
    event.preventDefault();
    if (!newGun.display_name.trim()) { setError("Enter a name for the gun."); return; }
    setSaving(true); setError("");
    const { data, error: createError } = await supabase.from("equipment_weapons").insert({
      user_id: userId, display_name: newGun.display_name.trim(), manufacturer: newGun.manufacturer.trim() || null,
      model: newGun.model.trim() || null, gauge: newGun.gauge.trim() || null, weapon_type: newGun.weapon_type, is_default: false,
    }).select("id,display_name,manufacturer,model,weapon_type,gauge,is_default").single();
    setSaving(false);
    if (createError || !data) { setError("Gun could not be added. Please try again."); return; }
    setWeapons((items) => [data as AftercareWeapon, ...items]); setWeaponId(data.id); setAddMode(null);
    setNewGun({ display_name: "", manufacturer: "", model: "", gauge: "12", weapon_type: "over_under" });
    setStatus("Gun added. Save equipment to attach it to this result.");
  }

  return <div className="competitionEquipmentReview">
    <div className="sectionHeader"><div><p className="eyebrow">Optional</p><h3>Equipment used</h3></div></div>
    {loading ? <p className="small muted">Loading equipment…</p> : <>
      {suggested ? <p className="small muted">Suggested from your usage. Confirm what you actually used before saving this result.</p> : <p className="small muted">Choose only what you know you used. More than one ammunition type is fine.</p>}
      <label htmlFor="aftercare-gun">Gun</label>
      <select id="aftercare-gun" value={weaponId} onChange={(event) => { setWeaponId(event.target.value); setStatus(""); }}>
        <option value="">Not recorded</option>
        {weapons.map((item) => <option key={item.id} value={item.id}>{weaponOptionLabel(item)}</option>)}
      </select>
      <button type="button" className="secondary smallButton aftercareAddLink" onClick={() => { setAddMode(addMode === "gun" ? null : "gun"); setError(""); }}>+ Add new gun</button>
      <div className="aftercareAmmoList">
        {ammoIds.map((id, index) => <div className="aftercareAmmoRow" key={index}>
          <label htmlFor={`aftercare-ammo-${index}`}>Ammunition {ammoIds.length > 1 ? index + 1 : ""}</label>
          <div className="aftercareAmmoControls">
            <select id={`aftercare-ammo-${index}`} value={id} onChange={(event) => changeAmmo(index, event.target.value)}>
              <option value="">Not recorded</option>
              {ammo.filter((item) => item.id === id || !ammoIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{ammoSummary(item)}</option>)}
            </select>
            <button type="button" className="secondary smallButton" aria-label={`Remove ammunition ${index + 1}`} onClick={() => { setAmmoIds((ids) => ids.filter((_, position) => position !== index)); setStatus(""); }}>Remove</button>
          </div>
        </div>)}
      </div>
      <div className="btns compactActions">
        {ammoIds.length < ammo.length && <button type="button" className="secondary smallButton" onClick={() => { const next = ammo.find((item) => !ammoIds.includes(item.id)); if (next) setAmmoIds((ids) => [...ids, next.id]); }}>+ Add another type</button>}
        <button type="button" className="secondary smallButton" onClick={() => { setAddMode(addMode === "ammo" ? null : "ammo"); setError(""); }}>+ Add new ammunition</button>
      </div>
      {addMode === "ammo" && <form className="subcard aftercareQuickForm" onSubmit={createAmmo}><h4>New ammunition</h4>
        <label>Manufacturer<input required value={newAmmo.manufacturer} onChange={(e) => setNewAmmo({ ...newAmmo, manufacturer: e.target.value })} /></label>
        <label>Product name<input value={newAmmo.product_name} onChange={(e) => setNewAmmo({ ...newAmmo, product_name: e.target.value })} /></label>
        <div className="row"><label>Gauge<input value={newAmmo.gauge} onChange={(e) => setNewAmmo({ ...newAmmo, gauge: e.target.value })} /></label><label>Payload (g)<input required type="number" min="0.1" step="0.1" inputMode="decimal" value={newAmmo.payload_grams} onChange={(e) => setNewAmmo({ ...newAmmo, payload_grams: e.target.value })} /></label></div>
        <label>Shot size<input value={newAmmo.shot_size} onChange={(e) => setNewAmmo({ ...newAmmo, shot_size: e.target.value })} /></label>
        <div className="btns compactActions"><button type="submit" className="smallButton" disabled={saving}>Add ammunition</button><button type="button" className="secondary smallButton" onClick={() => setAddMode(null)}>Cancel</button></div>
      </form>}
      {addMode === "gun" && <form className="subcard aftercareQuickForm" onSubmit={createGun}><h4>New gun</h4>
        <label>Name<input required value={newGun.display_name} onChange={(e) => setNewGun({ ...newGun, display_name: e.target.value })} placeholder="e.g. Blaser F3" /></label>
        <div className="row"><label>Manufacturer<input value={newGun.manufacturer} onChange={(e) => setNewGun({ ...newGun, manufacturer: e.target.value })} /></label><label>Model<input value={newGun.model} onChange={(e) => setNewGun({ ...newGun, model: e.target.value })} /></label></div>
        <label>Gun type<select value={newGun.weapon_type} onChange={(e) => setNewGun({ ...newGun, weapon_type: e.target.value })}><option value="over_under">Over-and-under</option><option value="side_by_side">Side-by-side</option><option value="semi_automatic">Semi-automatic</option><option value="pump_action">Pump-action</option></select></label>
        <label>Gauge<input value={newGun.gauge} onChange={(e) => setNewGun({ ...newGun, gauge: e.target.value })} /></label>
        <div className="btns compactActions"><button type="submit" className="smallButton" disabled={saving}>Add gun</button><button type="button" className="secondary smallButton" onClick={() => setAddMode(null)}>Cancel</button></div>
      </form>}
      <div className="btns compactActions aftercareSave"><button type="button" className="smallButton" disabled={saving || Boolean(addMode)} onClick={() => void save()}>{saving ? "Saving…" : "Save equipment"}</button>{status && <span role="status" className="small muted">{status}</span>}</div>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
