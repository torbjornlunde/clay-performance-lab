"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHOKE_MANUFACTURERS,
  CHOKE_SYSTEMS_BY_MANUFACTURER,
  GAUGE_OPTIONS,
  OTHER_CUSTOM,
  SHOTGUN_MANUFACTURERS,
  SHOTGUN_MODELS_BY_MANUFACTURER,
  STANDARD_CHOKE_DESIGNATIONS,
  chokeDesignationByValue,
  chokeDesignationLabel,
  chokeValueFromLegacyLabel,
  normalizeGauge,
} from "@/lib/equipment/catalog";
import { supabase } from "@/lib/supabase/client";

type WeaponType = "over_under" | "side_by_side" | "semi_automatic" | "pump_action";
type Slot = "upper" | "lower" | "left" | "right" | "single";
type SetupMode = "interchangeable" | "fixed" | "not_set";

type Weapon = { id: string; user_id: string; display_name: string; manufacturer: string | null; model: string | null; weapon_type: WeaponType; gauge: string | null; is_default: boolean; created_at: string; updated_at: string };
type Choke = { id: string; weapon_id: string; user_id: string; label: string; manufacturer: string | null; choke_system: string | null; constriction: string | null; choke_kind: string; standard_designation?: string | null; fraction_designation?: string | null; model_or_series?: string | null; compatible_choke_system?: string | null; manufacturer_marking?: string | null; constriction_mm?: string | number | null; constriction_inches?: string | number | null; created_at: string; updated_at: string };
type Assignment = { id: string; weapon_id: string; user_id: string; slot: Slot; choke_id: string | null; fixed_choke_label: string | null; setup_mode?: SetupMode | null; fixed_standard_designation?: string | null; fixed_fraction_designation?: string | null; fixed_manufacturer_marking?: string | null; created_at: string; updated_at: string };
type Ammo = { id: string; user_id: string; manufacturer: string; product_name: string | null; gauge: string | null; payload_grams: number; shot_size: string | null; notes: string | null; is_default: boolean; created_at: string; updated_at: string };

type WeaponForm = { display_name: string; manufacturer: string; model: string; weapon_type: WeaponType; gauge: string; customGauge: string; is_default: boolean };
type ChokeForm = { standard_designation: string; custom_label: string; manufacturer: string; model_or_series: string; compatible_choke_system: string; manufacturer_marking: string; constriction_mm: string; constriction_inches: string; choke_kind: "interchangeable" | "fixed" };
type AmmoForm = { manufacturer: string; product_name: string; gauge: string; customGauge: string; payload_grams: string; shot_size: string; notes: string; is_default: boolean };
type FixedSlotForm = { standard_designation: string; custom_label: string; manufacturer_marking: string };

const weaponTypes: { value: WeaponType; label: string }[] = [
  { value: "over_under", label: "Over/under" },
  { value: "side_by_side", label: "Side-by-side" },
  { value: "semi_automatic", label: "Semi-automatic" },
  { value: "pump_action", label: "Pump-action" },
];
const emptyWeapon: WeaponForm = { display_name: "", manufacturer: "", model: "", weapon_type: "over_under", gauge: "12 gauge", customGauge: "", is_default: false };
const emptyChoke: ChokeForm = { standard_designation: "improved_cylinder", custom_label: "", manufacturer: "", model_or_series: "", compatible_choke_system: "", manufacturer_marking: "", constriction_mm: "", constriction_inches: "", choke_kind: "interchangeable" };
const emptyAmmo: AmmoForm = { manufacturer: "", product_name: "", gauge: "12 gauge", customGauge: "", payload_grams: "28", shot_size: "", notes: "", is_default: false };

function slotsFor(type: WeaponType): { slot: Slot; label: string; summary: string }[] {
  if (type === "over_under") return [{ slot: "lower", label: "Lower barrel", summary: "Lower" }, { slot: "upper", label: "Upper barrel", summary: "Upper" }];
  if (type === "side_by_side") return [{ slot: "left", label: "Left barrel", summary: "Left" }, { slot: "right", label: "Right barrel", summary: "Right" }];
  return [{ slot: "single", label: "One choke", summary: "Choke" }];
}
function weaponTypeLabel(value: WeaponType) { return weaponTypes.find((item) => item.value === value)?.label || value; }
function clean(value: string) { return value.trim() || null; }
function chosenGauge(gauge: string, customGauge: string) { return gauge === OTHER_CUSTOM ? clean(customGauge) : clean(normalizeGauge(gauge)); }
function displayGauge(value: string | null) { return normalizeGauge(value) || value || ""; }
function designationFraction(value: string) { return chokeDesignationByValue(value)?.fraction || null; }
function chokePrimaryLabel(choke: Choke) { return chokeDesignationLabel(choke.standard_designation || chokeValueFromLegacyLabel(choke.label), choke.label); }
function chokeSummary(choke: Choke) {
  return [choke.manufacturer, choke.model_or_series, choke.compatible_choke_system || choke.choke_system, chokePrimaryLabel(choke), choke.manufacturer_marking, choke.constriction_mm ? `${choke.constriction_mm} mm` : null, choke.constriction_inches ? `${choke.constriction_inches} in` : null, choke.constriction].filter(Boolean).join(" · ");
}
function fixedSummary(assignment: Assignment) {
  const value = assignment.fixed_standard_designation || chokeValueFromLegacyLabel(assignment.fixed_choke_label);
  return ["Fixed", chokeDesignationLabel(value, assignment.fixed_choke_label), assignment.fixed_manufacturer_marking].filter(Boolean).join(" · ");
}
function compactSetup(weapon: Weapon, assignments: Assignment[], chokes: Choke[]) {
  return slotsFor(weapon.weapon_type).map(({ slot, summary }) => {
    const assignment = assignments.find((item) => item.weapon_id === weapon.id && item.slot === slot);
    const mode = assignment?.setup_mode || (assignment?.choke_id ? "interchangeable" : assignment?.fixed_choke_label ? "fixed" : "not_set");
    const choke = chokes.find((item) => item.id === assignment?.choke_id);
    const text = mode === "interchangeable" && choke ? chokePrimaryLabel(choke) : mode === "fixed" && assignment ? fixedSummary(assignment) : "Not set";
    return `${summary}: ${text}`;
  }).join(" · ");
}
function friendlyError(message: string) {
  if (message.includes("equipment_weapon_choke_same_weapon")) return "That choke does not belong to this weapon.";
  if (message.includes("duplicate") || message.includes("unique")) return "Only one default item is allowed. Refresh and try again.";
  return message || "Something went wrong. Please try again.";
}
function Datalist({ id, options }: { id: string; options: string[] }) {
  return <datalist id={id}>{options.map((option) => <option key={option} value={option} />)}</datalist>;
}

export default function EquipmentPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [chokes, setChokes] = useState<Choke[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ammo, setAmmo] = useState<Ammo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showWeaponForm, setShowWeaponForm] = useState(false);
  const [showAmmoForm, setShowAmmoForm] = useState(false);
  const [openChokeForms, setOpenChokeForms] = useState<Record<string, boolean>>({});
  const [weaponForm, setWeaponForm] = useState<WeaponForm>(emptyWeapon);
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const [ammoForm, setAmmoForm] = useState<AmmoForm>(emptyAmmo);
  const [editingAmmo, setEditingAmmo] = useState<string | null>(null);
  const [chokeForms, setChokeForms] = useState<Record<string, ChokeForm>>({});
  const [editingChoke, setEditingChoke] = useState<Record<string, string | null>>({});
  const [slotModes, setSlotModes] = useState<Record<string, SetupMode>>({});
  const [fixedSlotForms, setFixedSlotForms] = useState<Record<string, FixedSlotForm>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push("/login"); return; }
    setUserId(auth.user.id);
    const [w, c, a, am] = await Promise.all([
      supabase.from("equipment_weapons").select("*").eq("user_id", auth.user.id).order("is_default", { ascending: false }).order("created_at"),
      supabase.from("equipment_weapon_chokes").select("*").eq("user_id", auth.user.id).order("created_at"),
      supabase.from("equipment_weapon_current_choke_assignments").select("*").eq("user_id", auth.user.id),
      supabase.from("equipment_ammunition_profiles").select("*").eq("user_id", auth.user.id).order("is_default", { ascending: false }).order("created_at"),
    ]);
    const err = w.error || c.error || a.error || am.error;
    if (err) setError(friendlyError(err.message));
    setWeapons((w.data || []) as Weapon[]); setChokes((c.data || []) as Choke[]); setAssignments((a.data || []) as Assignment[]); setAmmo((am.data || []) as Ammo[]);
    setLoading(false);
  }

  async function saveWeapon(event: React.FormEvent) {
    event.preventDefault(); if (!userId || busy) return; if (!weaponForm.display_name.trim()) { setError("Weapon display name is required."); return; }
    setBusy(true); setError(""); setSuccess("");
    const payload = { user_id: userId, display_name: weaponForm.display_name.trim(), manufacturer: clean(weaponForm.manufacturer), model: clean(weaponForm.model), weapon_type: weaponForm.weapon_type, gauge: chosenGauge(weaponForm.gauge, weaponForm.customGauge), is_default: weaponForm.is_default };
    const res = editingWeapon ? await supabase.from("equipment_weapons").update(payload).eq("id", editingWeapon).eq("user_id", userId) : await supabase.from("equipment_weapons").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setWeaponForm(emptyWeapon); setEditingWeapon(null); setShowWeaponForm(false); setSuccess("Weapon saved."); await load();
  }
  async function deleteWeapon(id: string) { if (!confirm("Delete this weapon and its chokes?")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_weapons").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Weapon deleted."); await load(); } }
  async function setDefaultWeapon(id: string) { setBusy(true); const { error: defaultError } = await supabase.from("equipment_weapons").update({ is_default: true }).eq("id", id).eq("user_id", userId); setBusy(false); if (defaultError) setError(friendlyError(defaultError.message)); else load(); }
  function editWeapon(weapon: Weapon) { const normalized = displayGauge(weapon.gauge); setEditingWeapon(weapon.id); setShowWeaponForm(true); setWeaponForm({ display_name: weapon.display_name, manufacturer: weapon.manufacturer || "", model: weapon.model || "", weapon_type: weapon.weapon_type, gauge: GAUGE_OPTIONS.includes(normalized) ? normalized : OTHER_CUSTOM, customGauge: GAUGE_OPTIONS.includes(normalized) ? "" : normalized, is_default: weapon.is_default }); }

  function chokeFormFor(weaponId: string) { return chokeForms[weaponId] || emptyChoke; }
  function updateChokeForm(weaponId: string, update: Partial<ChokeForm>) { setChokeForms({ ...chokeForms, [weaponId]: { ...chokeFormFor(weaponId), ...update } }); }
  async function saveChoke(event: React.FormEvent, weaponId: string) {
    event.preventDefault(); const form = chokeFormFor(weaponId); const isCustom = form.standard_designation === "other_custom"; const label = isCustom ? form.custom_label.trim() : chokeDesignationLabel(form.standard_designation);
    if (!label) { setError("Choose a standard choke designation or enter a custom choke label."); return; }
    const editId = editingChoke[weaponId]; setBusy(true); setError("");
    const payload = { user_id: userId, weapon_id: weaponId, label, manufacturer: clean(form.manufacturer), choke_system: clean(form.compatible_choke_system), constriction: null, choke_kind: form.choke_kind, standard_designation: isCustom ? null : form.standard_designation, fraction_designation: designationFraction(form.standard_designation), model_or_series: clean(form.model_or_series), compatible_choke_system: clean(form.compatible_choke_system), manufacturer_marking: clean(form.manufacturer_marking), constriction_mm: clean(form.constriction_mm), constriction_inches: clean(form.constriction_inches) };
    const res = editId ? await supabase.from("equipment_weapon_chokes").update(payload).eq("id", editId).eq("user_id", userId) : await supabase.from("equipment_weapon_chokes").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setChokeForms({ ...chokeForms, [weaponId]: emptyChoke }); setEditingChoke({ ...editingChoke, [weaponId]: null }); setOpenChokeForms({ ...openChokeForms, [weaponId]: false }); setSuccess("Choke saved."); await load();
  }
  async function deleteChoke(id: string) { if (!confirm("Remove this choke? Current setup slots using it will be cleared.")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_weapon_chokes").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else load(); }
  function editChoke(weaponId: string, choke: Choke) { const standard = choke.standard_designation || chokeValueFromLegacyLabel(choke.label) || "other_custom"; setEditingChoke({ ...editingChoke, [weaponId]: choke.id }); setOpenChokeForms({ ...openChokeForms, [weaponId]: true }); setChokeForms({ ...chokeForms, [weaponId]: { standard_designation: standard, custom_label: standard === "other_custom" ? choke.label : "", manufacturer: choke.manufacturer || "", model_or_series: choke.model_or_series || "", compatible_choke_system: choke.compatible_choke_system || choke.choke_system || "", manufacturer_marking: choke.manufacturer_marking || "", constriction_mm: String(choke.constriction_mm || ""), constriction_inches: String(choke.constriction_inches || ""), choke_kind: choke.choke_kind === "fixed" ? "fixed" : "interchangeable" } }); }

  function slotKey(weaponId: string, slot: Slot) { return `${weaponId}:${slot}`; }
  function fixedFormFor(key: string, assignment?: Assignment): FixedSlotForm { return fixedSlotForms[key] || { standard_designation: assignment?.fixed_standard_designation || chokeValueFromLegacyLabel(assignment?.fixed_choke_label) || "full", custom_label: assignment?.fixed_standard_designation ? "" : assignment?.fixed_choke_label || "", manufacturer_marking: assignment?.fixed_manufacturer_marking || "" }; }
  async function saveSlot(weapon: Weapon, slot: Slot, mode: SetupMode, chokeId = "", fixedForm?: FixedSlotForm) {
    setBusy(true); setError("");
    const fixedIsCustom = fixedForm?.standard_designation === "other_custom";
    const fixedLabel = fixedForm ? (fixedIsCustom ? fixedForm.custom_label : chokeDesignationLabel(fixedForm.standard_designation)) : null;
    const payload = { user_id: userId, weapon_id: weapon.id, slot, setup_mode: mode, choke_id: mode === "interchangeable" ? chokeId || null : null, fixed_choke_label: mode === "fixed" ? clean(fixedLabel || "") : null, fixed_standard_designation: mode === "fixed" && !fixedIsCustom ? fixedForm?.standard_designation || null : null, fixed_fraction_designation: mode === "fixed" && !fixedIsCustom ? designationFraction(fixedForm?.standard_designation || "") : null, fixed_manufacturer_marking: mode === "fixed" ? clean(fixedForm?.manufacturer_marking || "") : null };
    const { error: saveError } = await supabase.from("equipment_weapon_current_choke_assignments").upsert(payload, { onConflict: "weapon_id,slot" });
    setBusy(false); if (saveError) setError(friendlyError(saveError.message)); else load();
  }

  async function saveAmmo(event: React.FormEvent) {
    event.preventDefault(); const grams = Number(ammoForm.payload_grams); if (!ammoForm.manufacturer.trim()) { setError("Ammunition manufacturer is required."); return; } if (!Number.isFinite(grams) || grams <= 0) { setError("Payload weight must be greater than zero."); return; }
    setBusy(true); setError(""); setSuccess("");
    const payload = { user_id: userId, manufacturer: ammoForm.manufacturer.trim(), product_name: clean(ammoForm.product_name), gauge: chosenGauge(ammoForm.gauge, ammoForm.customGauge), payload_grams: grams, shot_size: clean(ammoForm.shot_size), notes: clean(ammoForm.notes), is_default: ammoForm.is_default };
    const res = editingAmmo ? await supabase.from("equipment_ammunition_profiles").update(payload).eq("id", editingAmmo).eq("user_id", userId) : await supabase.from("equipment_ammunition_profiles").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setAmmoForm(emptyAmmo); setEditingAmmo(null); setShowAmmoForm(false); setSuccess("Ammunition saved."); await load();
  }
  async function deleteAmmo(id: string) { if (!confirm("Delete this ammunition profile?")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_ammunition_profiles").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Ammunition deleted."); await load(); } }
  async function setDefaultAmmo(id: string) { setBusy(true); const { error: defaultError } = await supabase.from("equipment_ammunition_profiles").update({ is_default: true }).eq("id", id).eq("user_id", userId); setBusy(false); if (defaultError) setError(friendlyError(defaultError.message)); else load(); }
  function editAmmo(profile: Ammo) { const normalized = displayGauge(profile.gauge); setEditingAmmo(profile.id); setShowAmmoForm(true); setAmmoForm({ manufacturer: profile.manufacturer, product_name: profile.product_name || "", gauge: GAUGE_OPTIONS.includes(normalized) ? normalized : OTHER_CUSTOM, customGauge: GAUGE_OPTIONS.includes(normalized) ? "" : normalized, payload_grams: String(profile.payload_grams), shot_size: profile.shot_size || "", notes: profile.notes || "", is_default: profile.is_default }); }

  const chokesByWeapon = useMemo(() => chokes.reduce<Record<string, Choke[]>>((groups, choke) => { groups[choke.weapon_id] = [...(groups[choke.weapon_id] || []), choke]; return groups; }, {}), [chokes]);
  const modelOptions = [...(SHOTGUN_MODELS_BY_MANUFACTURER[weaponForm.manufacturer] || []), OTHER_CUSTOM];

  return <main>
    <Datalist id="shotgun-manufacturers" options={SHOTGUN_MANUFACTURERS} /><Datalist id="shotgun-models" options={modelOptions} /><Datalist id="choke-manufacturers" options={CHOKE_MANUFACTURERS} />
    <div className="heroCard"><div><p className="eyebrow">Equipment</p><h2>Equipment profiles</h2><p>Manage optional weapons, chokes, current choke setup, and ammunition profiles.</p></div><Link className="button secondary" href="/profile">Profile</Link></div>
    {error && <div className="error">{error}</div>}{success && <div className="success">{success}</div>}{loading && <div className="notice">Loading equipment…</div>}

    <section className="card"><div className="sectionHeader"><div><p className="eyebrow">Weapons</p><h2>Weapons</h2></div><button type="button" className="smallButton secondary" onClick={() => { setShowWeaponForm((value) => !value); setEditingWeapon(null); setWeaponForm(emptyWeapon); }}>{showWeaponForm ? "Hide form" : "Add weapon"}</button></div>
      {showWeaponForm && <form onSubmit={saveWeapon} className="subcard"><h3>{editingWeapon ? "Edit weapon" : "Add weapon"}</h3><label>Display name<input value={weaponForm.display_name} onChange={(event) => setWeaponForm({ ...weaponForm, display_name: event.target.value })} required /></label><div className="row"><label>Manufacturer<input list="shotgun-manufacturers" value={weaponForm.manufacturer} onChange={(event) => setWeaponForm({ ...weaponForm, manufacturer: event.target.value, model: "" })} placeholder="Select or type" /></label><label>Model<input list="shotgun-models" value={weaponForm.model} onChange={(event) => setWeaponForm({ ...weaponForm, model: event.target.value === OTHER_CUSTOM ? "" : event.target.value })} placeholder="Select or type" /></label></div><div className="row"><label>Weapon type<select value={weaponForm.weapon_type} onChange={(event) => setWeaponForm({ ...weaponForm, weapon_type: event.target.value as WeaponType })}>{weaponTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label>Gauge<select value={weaponForm.gauge} onChange={(event) => setWeaponForm({ ...weaponForm, gauge: event.target.value })}>{GAUGE_OPTIONS.map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label></div>{weaponForm.gauge === OTHER_CUSTOM && <label>Custom gauge<input value={weaponForm.customGauge} onChange={(event) => setWeaponForm({ ...weaponForm, customGauge: event.target.value })} /></label>}<label className="checkboxLabel"><input type="checkbox" checked={weaponForm.is_default} onChange={(event) => setWeaponForm({ ...weaponForm, is_default: event.target.checked })} /> Set as default weapon</label><div className="btns"><button disabled={busy}>{editingWeapon ? "Save weapon" : "Add weapon"}</button>{editingWeapon && <button type="button" className="secondary" onClick={() => { setEditingWeapon(null); setWeaponForm(emptyWeapon); setShowWeaponForm(false); }}>Cancel</button>}</div></form>}
      {weapons.length === 0 && !loading && <div className="emptyState">No weapons yet.</div>}
      {weapons.map((weapon) => <details className="subcard equipmentDetails" key={weapon.id}><summary><span><strong>{weapon.display_name}</strong> {weapon.is_default && <span className="badge badgeGold">Default</span>}<br /><small className="muted">{[weapon.manufacturer, weapon.model, displayGauge(weapon.gauge)].filter(Boolean).join(" · ") || weaponTypeLabel(weapon.weapon_type)} · {compactSetup(weapon, assignments, chokes)}</small></span></summary><div className="equipmentCardBody"><p>{[weapon.manufacturer, weapon.model, displayGauge(weapon.gauge)].filter(Boolean).join(" · ") || "No extra weapon details."}</p><div className="btns"><button type="button" className="secondary smallButton" onClick={() => editWeapon(weapon)}>Edit</button>{!weapon.is_default && <button type="button" className="secondary smallButton" onClick={() => setDefaultWeapon(weapon.id)}>Set default</button>}<button type="button" className="danger smallButton" onClick={() => deleteWeapon(weapon.id)}>Delete</button></div><h3>Current choke setup</h3>{slotsFor(weapon.weapon_type).map(({ slot, label }) => { const key = slotKey(weapon.id, slot); const current = assignments.find((assignment) => assignment.weapon_id === weapon.id && assignment.slot === slot); const mode = slotModes[key] || current?.setup_mode || (current?.choke_id ? "interchangeable" : current?.fixed_choke_label ? "fixed" : "not_set"); const fixedForm = fixedFormFor(key, current); const available = chokesByWeapon[weapon.id] || []; return <div className="subcard" key={slot}><div className="row"><label>{label}<select value={mode} onChange={(event) => { const nextMode = event.target.value as SetupMode; setSlotModes({ ...slotModes, [key]: nextMode }); if (nextMode === "not_set") saveSlot(weapon, slot, nextMode); }}><option value="not_set">Not set</option><option value="interchangeable">Interchangeable choke</option><option value="fixed">Fixed choke</option></select></label>{mode === "interchangeable" && <label>Installed choke<select value={current?.choke_id || ""} onChange={(event) => saveSlot(weapon, slot, "interchangeable", event.target.value)}><option value="">Select choke</option>{available.map((choke) => <option key={choke.id} value={choke.id}>{chokeSummary(choke)}</option>)}</select></label>}</div>{mode === "fixed" && <><div className="row"><label>Fixed choke designation<select value={fixedForm.standard_designation} onChange={(event) => setFixedSlotForms({ ...fixedSlotForms, [key]: { ...fixedForm, standard_designation: event.target.value } })}>{STANDARD_CHOKE_DESIGNATIONS.map((designation) => <option key={designation.value} value={designation.value}>{chokeDesignationLabel(designation.value)}</option>)}</select></label><label>Manufacturer marking or note<input value={fixedForm.manufacturer_marking} onChange={(event) => setFixedSlotForms({ ...fixedSlotForms, [key]: { ...fixedForm, manufacturer_marking: event.target.value } })} placeholder="U2, 3 notches, Gold" /></label></div>{fixedForm.standard_designation === "other_custom" && <label>Custom fixed choke label<input value={fixedForm.custom_label} onChange={(event) => setFixedSlotForms({ ...fixedSlotForms, [key]: { ...fixedForm, custom_label: event.target.value } })} /></label>}<div className="btns"><button type="button" className="smallButton" onClick={() => saveSlot(weapon, slot, "fixed", "", fixedForm)}>Save fixed choke</button></div></>}</div>; })}<h3>Available chokes</h3>{(chokesByWeapon[weapon.id] || []).map((choke) => <div className="equipmentListItem" key={choke.id}><span><strong>{chokeSummary(choke)}</strong><br /><small className="muted">{choke.choke_kind === "fixed" ? "Fixed inventory reference" : "Interchangeable"}</small></span><span className="btns"><button type="button" className="secondary smallButton" onClick={() => editChoke(weapon.id, choke)}>Edit</button><button type="button" className="danger smallButton" onClick={() => deleteChoke(choke.id)}>Remove</button></span></div>)}<div className="btns"><button type="button" className="secondary smallButton" onClick={() => setOpenChokeForms({ ...openChokeForms, [weapon.id]: !openChokeForms[weapon.id] })}>{openChokeForms[weapon.id] ? "Hide choke form" : "Add choke"}</button></div>{openChokeForms[weapon.id] && <ChokeFormView weaponId={weapon.id} form={chokeFormFor(weapon.id)} editing={Boolean(editingChoke[weapon.id])} busy={busy} onSubmit={saveChoke} onChange={updateChokeForm} onCancel={() => { setEditingChoke({ ...editingChoke, [weapon.id]: null }); setChokeForms({ ...chokeForms, [weapon.id]: emptyChoke }); setOpenChokeForms({ ...openChokeForms, [weapon.id]: false }); }} />}</div></details>)}
    </section>

    <section className="card"><div className="sectionHeader"><div><p className="eyebrow">Ammunition</p><h2>Ammunition</h2></div><button type="button" className="smallButton secondary" onClick={() => { setShowAmmoForm((value) => !value); setEditingAmmo(null); setAmmoForm(emptyAmmo); }}>{showAmmoForm ? "Hide form" : "Add ammunition"}</button></div>{showAmmoForm && <form onSubmit={saveAmmo} className="subcard"><h3>{editingAmmo ? "Edit ammunition" : "Add ammunition"}</h3><div className="row"><label>Manufacturer<input value={ammoForm.manufacturer} onChange={(event) => setAmmoForm({ ...ammoForm, manufacturer: event.target.value })} required /></label><label>Product name<input value={ammoForm.product_name} onChange={(event) => setAmmoForm({ ...ammoForm, product_name: event.target.value })} /></label></div><div className="row"><label>Gauge<select value={ammoForm.gauge} onChange={(event) => setAmmoForm({ ...ammoForm, gauge: event.target.value })}>{GAUGE_OPTIONS.map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label><label>Payload grams<input type="number" min="1" step="0.1" value={ammoForm.payload_grams} onChange={(event) => setAmmoForm({ ...ammoForm, payload_grams: event.target.value })} required /></label></div>{ammoForm.gauge === OTHER_CUSTOM && <label>Custom gauge<input value={ammoForm.customGauge} onChange={(event) => setAmmoForm({ ...ammoForm, customGauge: event.target.value })} /></label>}<label>Shot size<input value={ammoForm.shot_size} onChange={(event) => setAmmoForm({ ...ammoForm, shot_size: event.target.value })} /></label><label>Notes<textarea value={ammoForm.notes} onChange={(event) => setAmmoForm({ ...ammoForm, notes: event.target.value })} /></label><label className="checkboxLabel"><input type="checkbox" checked={ammoForm.is_default} onChange={(event) => setAmmoForm({ ...ammoForm, is_default: event.target.checked })} /> Set as default ammunition</label><div className="btns"><button disabled={busy}>{editingAmmo ? "Save ammunition" : "Add ammunition"}</button>{editingAmmo && <button type="button" className="secondary" onClick={() => { setEditingAmmo(null); setAmmoForm(emptyAmmo); setShowAmmoForm(false); }}>Cancel</button>}</div></form>}{ammo.length === 0 && !loading && <div className="emptyState">No ammunition profiles yet.</div>}{ammo.map((profile) => <div className="subcard equipmentListItem" key={profile.id}><span><strong>{profile.manufacturer}{profile.product_name ? ` · ${profile.product_name}` : ""}</strong> {profile.is_default && <span className="badge badgeGold">Default</span>}<br /><small className="muted">{[displayGauge(profile.gauge), `${profile.payload_grams} g`, profile.shot_size].filter(Boolean).join(" · ")}</small>{profile.notes && <p>{profile.notes}</p>}</span><span className="btns"><button className="secondary smallButton" onClick={() => editAmmo(profile)}>Edit</button>{!profile.is_default && <button className="secondary smallButton" onClick={() => setDefaultAmmo(profile.id)}>Set default</button>}<button className="danger smallButton" onClick={() => deleteAmmo(profile.id)}>Delete</button></span></div>)}</section>
  </main>;
}

function ChokeFormView({ weaponId, form, editing, busy, onSubmit, onChange, onCancel }: { weaponId: string; form: ChokeForm; editing: boolean; busy: boolean; onSubmit: (event: React.FormEvent, weaponId: string) => void; onChange: (weaponId: string, update: Partial<ChokeForm>) => void; onCancel: () => void }) {
  const systemOptions = [...(CHOKE_SYSTEMS_BY_MANUFACTURER[form.manufacturer] || []), OTHER_CUSTOM];
  return <form onSubmit={(event) => onSubmit(event, weaponId)} className="subcard"><Datalist id={`choke-systems-${weaponId}`} options={systemOptions} /><h3>{editing ? "Edit choke" : "Add choke"}</h3><div className="row"><label>Standard designation<select value={form.standard_designation} onChange={(event) => onChange(weaponId, { standard_designation: event.target.value })}>{STANDARD_CHOKE_DESIGNATIONS.map((designation) => <option key={designation.value} value={designation.value}>{chokeDesignationLabel(designation.value)}</option>)}</select></label><label>Manufacturer marking<input value={form.manufacturer_marking} onChange={(event) => onChange(weaponId, { manufacturer_marking: event.target.value })} placeholder="U1, M, 3 notches" /></label></div>{form.standard_designation === "other_custom" && <label>Custom choke designation<input value={form.custom_label} onChange={(event) => onChange(weaponId, { custom_label: event.target.value })} /></label>}<div className="row"><label>Manufacturer<input list="choke-manufacturers" value={form.manufacturer} onChange={(event) => onChange(weaponId, { manufacturer: event.target.value })} placeholder="Select or type" /></label><label>Choke model or series<input value={form.model_or_series} onChange={(event) => onChange(weaponId, { model_or_series: event.target.value })} placeholder="Spectrum" /></label></div><label>Compatible choke system<input list={`choke-systems-${weaponId}`} value={form.compatible_choke_system} onChange={(event) => onChange(weaponId, { compatible_choke_system: event.target.value === OTHER_CUSTOM ? "" : event.target.value })} placeholder="User confirmed system" /></label><div className="row"><label>Constriction mm<input type="number" step="0.001" min="0" inputMode="decimal" value={form.constriction_mm} onChange={(event) => onChange(weaponId, { constriction_mm: event.target.value })} /></label><label>Constriction inches<input type="number" step="0.0001" min="0" inputMode="decimal" value={form.constriction_inches} onChange={(event) => onChange(weaponId, { constriction_inches: event.target.value })} /></label></div><label>Inventory type<select value={form.choke_kind} onChange={(event) => onChange(weaponId, { choke_kind: event.target.value as ChokeForm["choke_kind"] })}><option value="interchangeable">Interchangeable</option><option value="fixed">Fixed reference</option></select></label><div className="btns"><button disabled={busy}>{editing ? "Save choke" : "Add choke"}</button>{editing && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}</div></form>;
}
