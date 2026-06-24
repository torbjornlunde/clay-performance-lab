"use client";

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
  sortByName,
} from "@/lib/equipment/catalog";
import { supabase } from "@/lib/supabase/client";

type WeaponType = "over_under" | "side_by_side" | "semi_automatic" | "pump_action";
type Slot = "upper" | "lower" | "left" | "right" | "single";
type SetupMode = "interchangeable" | "fixed" | "not_set";
type ChokeConfigurationType = "interchangeable" | "fixed";
type Panel = "add_weapon" | "add_ammo" | `weapon:${string}` | `chokes:${string}` | `adjust_weapon:${string}` | `adjust_ammo:${string}` | null;

type Weapon = { id: string; user_id: string; display_name: string; manufacturer: string | null; model: string | null; weapon_type: WeaponType; gauge: string | null; is_default: boolean; choke_configuration_type?: ChokeConfigurationType | null; initial_shot_count?: number | null; shot_tracking_started_at?: string | null; created_at: string; updated_at: string };
type Choke = { id: string; weapon_id: string; user_id: string; label: string; manufacturer: string | null; choke_system: string | null; constriction: string | null; choke_kind: string; standard_designation?: string | null; fraction_designation?: string | null; model_or_series?: string | null; compatible_choke_system?: string | null; manufacturer_marking?: string | null; constriction_mm?: string | number | null; constriction_inches?: string | number | null; created_at: string; updated_at: string };
type Assignment = { id: string; weapon_id: string; user_id: string; slot: Slot; choke_id: string | null; fixed_choke_label: string | null; setup_mode?: SetupMode | null; fixed_standard_designation?: string | null; fixed_fraction_designation?: string | null; fixed_manufacturer_marking?: string | null; created_at: string; updated_at: string };
type ShotEvent = { id: string; user_id: string; weapon_id: string | null; ammunition_profile_id: string | null; shot_delta: number; event_type: string; note: string | null; created_at: string; updated_at: string };
type Ammo = { id: string; user_id: string; manufacturer: string; product_name: string | null; gauge: string | null; payload_grams: number; shot_size: string | null; notes: string | null; is_default: boolean; choke_configuration_type?: ChokeConfigurationType | null; initial_shot_count?: number | null; shot_tracking_started_at?: string | null; created_at: string; updated_at: string };

type WeaponForm = { display_name: string; manufacturer: string; model: string; weapon_type: WeaponType; gauge: string; customGauge: string; is_default: boolean; choke_configuration_type: ChokeConfigurationType; initial_shot_count: string; displayNameTouched: boolean; fixedSlots: Record<string, SlotDraft> };
type ChokeForm = { standard_designation: string; custom_label: string; manufacturer: string; model_or_series: string; compatible_choke_system: string; manufacturer_marking: string; constriction_mm: string; constriction_inches: string };
type AmmoForm = { manufacturer: string; product_name: string; gauge: string; customGauge: string; payload_grams: string; shot_size: string; notes: string; is_default: boolean; initial_shot_count: string };
type SlotDraft = { mode: SetupMode; choke_id: string; fixed_standard_designation: string; fixed_custom_label: string; fixed_manufacturer_marking: string };

const weaponTypes: { value: WeaponType; label: string }[] = [
  { value: "over_under", label: "Over/under" },
  { value: "side_by_side", label: "Side-by-side" },
  { value: "semi_automatic", label: "Semi-automatic" },
  { value: "pump_action", label: "Pump-action" },
];
const emptyWeapon: WeaponForm = { display_name: "", manufacturer: "", model: "", weapon_type: "over_under", gauge: "12 gauge", customGauge: "", is_default: false, choke_configuration_type: "interchangeable", initial_shot_count: "", displayNameTouched: false, fixedSlots: {} };
const emptyChoke: ChokeForm = { standard_designation: "modified", custom_label: "", manufacturer: "", model_or_series: "", compatible_choke_system: "", manufacturer_marking: "", constriction_mm: "", constriction_inches: "" };
const emptyAmmo: AmmoForm = { manufacturer: "", product_name: "", gauge: "12 gauge", customGauge: "", payload_grams: "28", shot_size: "", notes: "", is_default: false, initial_shot_count: "" };

function slotsFor(type: WeaponType): { slot: Slot; label: string; summary: string }[] {
  if (type === "over_under") return [{ slot: "lower", label: "Lower barrel", summary: "Lower" }, { slot: "upper", label: "Upper barrel", summary: "Upper" }];
  if (type === "side_by_side") return [{ slot: "left", label: "Left barrel", summary: "Left" }, { slot: "right", label: "Right barrel", summary: "Right" }];
  return [{ slot: "single", label: "Choke", summary: "Choke" }];
}
function clean(value: string) { return value.trim() || null; }
function chosenGauge(gauge: string, customGauge: string) { return gauge === OTHER_CUSTOM ? clean(customGauge) : clean(normalizeGauge(gauge)); }
function displayGauge(value: string | null) { return normalizeGauge(value) || value || ""; }
function designationFraction(value: string) { return chokeDesignationByValue(value)?.fraction || null; }
function chokePrimaryLabel(choke: Choke) { return chokeDesignationLabel(choke.standard_designation || chokeValueFromLegacyLabel(choke.label), choke.label); }
function chokeSummary(choke: Choke) { return [choke.manufacturer, choke.model_or_series].filter(Boolean).join(" · ") || chokePrimaryLabel(choke); }
function chokeDetail(choke: Choke) { return chokePrimaryLabel(choke); }
function totalShots(initial?: number | null, delta = 0) { return Math.max((initial || 0) + delta, 0); }
function shotCountText(total: number) { return total > 0 ? `Shots fired: ${new Intl.NumberFormat().format(total)}` : "Shots fired: Not tracked yet"; }
function assignmentMode(assignment?: Assignment): SetupMode { return assignment?.setup_mode || (assignment?.choke_id ? "interchangeable" : assignment?.fixed_choke_label ? "fixed" : "not_set"); }
function fixedText(assignment?: Assignment) { return assignment ? chokeDesignationLabel(assignment.fixed_standard_designation || chokeValueFromLegacyLabel(assignment.fixed_choke_label), assignment.fixed_choke_label) : "Not set"; }
function compactSetup(weapon: Weapon, assignments: Assignment[], chokes: Choke[]) {
  return slotsFor(weapon.weapon_type).map(({ slot, summary }) => {
    const assignment = assignments.find((item) => item.weapon_id === weapon.id && item.slot === slot);
    const choke = chokes.find((item) => item.id === assignment?.choke_id);
    const text = (weapon.choke_configuration_type || "interchangeable") === "fixed" ? fixedText(assignment) : choke ? chokePrimaryLabel(choke) : "Not set";
    return `${summary}: ${text}`;
  }).join(" · ");
}
function parseShotCount(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
function friendlyError(message: string) {
  if (message.includes("equipment_weapon_choke_same_weapon")) return "That choke does not belong to this gun.";
  if (message.includes("shot_count")) return "Shot counts must be whole numbers and cannot be negative.";
  if (message.includes("duplicate") || message.includes("unique")) return "Only one default item is allowed. Refresh and try again.";
  return message || "Something went wrong. Please try again.";
}
function Datalist({ id, options }: { id: string; options: string[] }) { return <datalist id={id}>{options.map((option) => <option key={option} value={option} />)}</datalist>; }

export default function EquipmentPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [chokes, setChokes] = useState<Choke[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ammo, setAmmo] = useState<Ammo[]>([]);
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [weaponForm, setWeaponForm] = useState<WeaponForm>(emptyWeapon);
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const [ammoForm, setAmmoForm] = useState<AmmoForm>(emptyAmmo);
  const [editingAmmo, setEditingAmmo] = useState<string | null>(null);
  const [chokeForms, setChokeForms] = useState<Record<string, ChokeForm>>({});
  const [editingChoke, setEditingChoke] = useState<Record<string, string | null>>({});
  const [setupDrafts, setSetupDrafts] = useState<Record<string, SlotDraft>>({});
  const [shotForm, setShotForm] = useState({ total: "", note: "" });
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    function closeMenus() { setOpenMenu(null); }
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);
  useEffect(() => { if (!success) return; const timer = window.setTimeout(() => setSuccess(""), 2500); return () => window.clearTimeout(timer); }, [success]);

  async function load() {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push("/login"); return; }
    setUserId(auth.user.id);
    const [w, c, a, am, events] = await Promise.all([
      supabase.from("equipment_weapons").select("*").eq("user_id", auth.user.id),
      supabase.from("equipment_weapon_chokes").select("*").eq("user_id", auth.user.id),
      supabase.from("equipment_weapon_current_choke_assignments").select("*").eq("user_id", auth.user.id),
      supabase.from("equipment_ammunition_profiles").select("*").eq("user_id", auth.user.id),
      supabase.from("equipment_shot_events").select("*").eq("user_id", auth.user.id),
    ]);
    const err = w.error || c.error || a.error || am.error || events.error;
    if (err) setError(friendlyError(err.message));
    setWeapons(sortWeapons((w.data || []) as Weapon[]));
    setChokes(sortByName((c.data || []) as Choke[], (choke) => `${choke.manufacturer || ""} ${choke.model_or_series || ""} ${choke.label}`));
    setAssignments((a.data || []) as Assignment[]);
    setAmmo(sortAmmo((am.data || []) as Ammo[]));
    setShotEvents((events.data || []) as ShotEvent[]);
    setLoading(false);
  }

  function shotDeltaFor(target: "weapon" | "ammo", id: string) {
    return shotEvents.filter((event) => target === "weapon" ? event.weapon_id === id : event.ammunition_profile_id === id).reduce((sum, event) => sum + Number(event.shot_delta || 0), 0);
  }

  async function saveShotAdjustment(target: "weapon" | "ammo", id: string, initial: number) {
    const nextTotal = parseShotCount(shotForm.total);
    if (nextTotal === null) { setError("New total shots must be a whole number and cannot be negative."); return; }
    const currentTotal = totalShots(initial, shotDeltaFor(target, id));
    const delta = nextTotal - currentTotal;
    if (delta === 0) { setOpenPanel(null); setShotForm({ total: "", note: "" }); return; }
    setBusy(true); setError("");
    const payload = { user_id: userId, weapon_id: target === "weapon" ? id : null, ammunition_profile_id: target === "ammo" ? id : null, shot_delta: delta, event_type: "manual_adjustment", event_date: new Date().toISOString().slice(0, 10), note: clean(shotForm.note) };
    const { error: adjustError } = await supabase.from("equipment_shot_events").insert(payload);
    setBusy(false);
    if (adjustError) { setError(friendlyError(adjustError.message)); return; }
    setOpenPanel(null); setShotForm({ total: "", note: "" }); setSuccess("Shot total updated."); await load();
  }

  function updateWeaponForm(update: Partial<WeaponForm>) {
    const next = { ...weaponForm, ...update };
    if (("manufacturer" in update || "model" in update) && !next.displayNameTouched) {
      next.display_name = [next.manufacturer, next.model].filter(Boolean).join(" ").trim();
    }
    setWeaponForm(next);
  }
  async function saveWeapon(event: React.FormEvent) {
    event.preventDefault(); if (!userId || busy) return;
    const initialCount = parseShotCount(weaponForm.initial_shot_count);
    if (initialCount === null) { setError("Estimated shots fired must be a whole number and cannot be negative."); return; }
    if (!weaponForm.display_name.trim()) { setError("Display name is required."); return; }
    setBusy(true); setError(""); setSuccess("");
    const existingWeapon = weapons.find((weapon) => weapon.id === editingWeapon);
    if (existingWeapon && existingWeapon.choke_configuration_type && existingWeapon.choke_configuration_type !== weaponForm.choke_configuration_type) {
      const warning = existingWeapon.choke_configuration_type === "interchangeable" ? "Changing this gun to fixed chokes will clear installed interchangeable choke assignments. Physical choke inventory will be kept." : "Changing this gun to interchangeable chokes will clear fixed barrel designations.";
      if (!confirm(warning)) { setBusy(false); return; }
    }
    const payload = { user_id: userId, display_name: weaponForm.display_name.trim(), manufacturer: clean(weaponForm.manufacturer), model: clean(weaponForm.model), weapon_type: weaponForm.weapon_type, gauge: chosenGauge(weaponForm.gauge, weaponForm.customGauge), is_default: weaponForm.is_default, initial_shot_count: initialCount, choke_configuration_type: weaponForm.choke_configuration_type };
    const res = editingWeapon ? await supabase.from("equipment_weapons").update(payload).eq("id", editingWeapon).eq("user_id", userId).select("id").single() : await supabase.from("equipment_weapons").insert(payload).select("id").single();
    if (res.error) { setBusy(false); setError(friendlyError(res.error.message)); return; }
    const savedWeaponId = (res.data as { id: string }).id;
    if (weaponForm.choke_configuration_type === "fixed") {
      const fixedRows = slotsFor(weaponForm.weapon_type).map(({ slot }) => {
        const draft = weaponForm.fixedSlots[slot] || { mode: "fixed" as SetupMode, choke_id: "", fixed_standard_designation: "full", fixed_custom_label: "", fixed_manufacturer_marking: "" };
        const custom = draft.fixed_standard_designation === "other_custom";
        return { user_id: userId, weapon_id: savedWeaponId, slot, setup_mode: "fixed", choke_id: null, fixed_choke_label: custom ? clean(draft.fixed_custom_label) : chokeDesignationLabel(draft.fixed_standard_designation), fixed_standard_designation: custom ? null : draft.fixed_standard_designation, fixed_fraction_designation: custom ? null : designationFraction(draft.fixed_standard_designation), fixed_manufacturer_marking: clean(draft.fixed_manufacturer_marking) };
      });
      const { error: fixedError } = await supabase.from("equipment_weapon_current_choke_assignments").upsert(fixedRows, { onConflict: "weapon_id,slot" });
      if (fixedError) { setBusy(false); setError(friendlyError(fixedError.message)); return; }
    } else if (existingWeapon?.choke_configuration_type === "fixed") {
      await supabase.from("equipment_weapon_current_choke_assignments").delete().eq("weapon_id", savedWeaponId).eq("user_id", userId);
    }
    setBusy(false);
    setWeaponForm(emptyWeapon); setEditingWeapon(null); setOpenPanel(null); setSuccess("Gun saved."); await load();
  }
  function editWeapon(weapon: Weapon) { const normalized = displayGauge(weapon.gauge); const fixedSlots = Object.fromEntries(slotsFor(weapon.weapon_type).map(({ slot }) => [slot, draftFor(weapon.id, slot)])); setEditingWeapon(weapon.id); setOpenPanel("add_weapon"); setOpenMenu(null); setWeaponForm({ display_name: weapon.display_name, manufacturer: weapon.manufacturer || "", model: weapon.model || "", weapon_type: weapon.weapon_type, gauge: GAUGE_OPTIONS.includes(normalized) ? normalized : OTHER_CUSTOM, customGauge: GAUGE_OPTIONS.includes(normalized) ? "" : normalized, is_default: weapon.is_default, choke_configuration_type: weapon.choke_configuration_type || "interchangeable", initial_shot_count: weapon.initial_shot_count ? String(weapon.initial_shot_count) : "", displayNameTouched: true, fixedSlots }); window.setTimeout(() => document.getElementById("equipment-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
  async function deleteWeapon(id: string) { if (!confirm("Delete this gun and its chokes?")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_weapons").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Gun deleted."); await load(); } }
  async function setDefaultWeapon(id: string) { setBusy(true); const { error: defaultError } = await supabase.from("equipment_weapons").update({ is_default: true }).eq("id", id).eq("user_id", userId); setBusy(false); if (defaultError) setError(friendlyError(defaultError.message)); else load(); }

  function draftKey(weaponId: string, slot: Slot) { return `${weaponId}:${slot}`; }
  function draftFor(weaponId: string, slot: Slot): SlotDraft {
    const key = draftKey(weaponId, slot);
    const assignment = assignments.find((item) => item.weapon_id === weaponId && item.slot === slot);
    return setupDrafts[key] || { mode: assignmentMode(assignment), choke_id: assignment?.choke_id || "", fixed_standard_designation: assignment?.fixed_standard_designation || chokeValueFromLegacyLabel(assignment?.fixed_choke_label) || "full", fixed_custom_label: assignment?.fixed_standard_designation ? "" : assignment?.fixed_choke_label || "", fixed_manufacturer_marking: assignment?.fixed_manufacturer_marking || "" };
  }
  function updateDraft(weaponId: string, slot: Slot, update: Partial<SlotDraft>) { const key = draftKey(weaponId, slot); setSetupDrafts({ ...setupDrafts, [key]: { ...draftFor(weaponId, slot), ...update } }); }
  async function saveSetup(weapon: Weapon) {
    setBusy(true); setError("");
    const rows = slotsFor(weapon.weapon_type).map(({ slot }) => {
      const draft = draftFor(weapon.id, slot);
      const fixedIsCustom = draft.fixed_standard_designation === "other_custom";
      const fixedLabel = fixedIsCustom ? draft.fixed_custom_label : chokeDesignationLabel(draft.fixed_standard_designation);
      const mode: SetupMode = draft.choke_id ? "interchangeable" : "not_set";
      return { user_id: userId, weapon_id: weapon.id, slot, setup_mode: mode, choke_id: draft.choke_id || null, fixed_choke_label: null, fixed_standard_designation: null, fixed_fraction_designation: null, fixed_manufacturer_marking: null };
    });
    const { error: saveError } = await supabase.from("equipment_weapon_current_choke_assignments").upsert(rows, { onConflict: "weapon_id,slot" });
    setBusy(false); if (saveError) setError(friendlyError(saveError.message)); else { setSuccess("Choke setup saved."); await load(); }
  }

  function chokeFormFor(weaponId: string) { return chokeForms[weaponId] || emptyChoke; }
  function updateChokeForm(weaponId: string, update: Partial<ChokeForm>) { setChokeForms({ ...chokeForms, [weaponId]: { ...chokeFormFor(weaponId), ...update } }); }
  async function saveChoke(event: React.FormEvent, weaponId: string) {
    event.preventDefault(); const form = chokeFormFor(weaponId); const isCustom = form.standard_designation === "other_custom"; const label = isCustom ? form.custom_label.trim() : chokeDesignationLabel(form.standard_designation);
    if (!label) { setError("Choose a choke designation or enter a custom choke label."); return; }
    const editId = editingChoke[weaponId];
    const duplicate = !editId && (chokesByWeapon[weaponId] || []).some((choke) => (choke.standard_designation || chokeValueFromLegacyLabel(choke.label) || choke.label) === (isCustom ? label : form.standard_designation) && (choke.manufacturer || "").toLowerCase() === form.manufacturer.trim().toLowerCase() && (choke.model_or_series || "").toLowerCase() === form.model_or_series.trim().toLowerCase());
    if (duplicate && !confirm("This looks like a choke already registered for this gun. Add it anyway?")) return;
    setBusy(true); setError("");
    const payload = { user_id: userId, weapon_id: weaponId, label, manufacturer: clean(form.manufacturer), choke_system: clean(form.compatible_choke_system), constriction: null, choke_kind: "interchangeable", standard_designation: isCustom ? null : form.standard_designation, fraction_designation: designationFraction(form.standard_designation), model_or_series: clean(form.model_or_series), compatible_choke_system: clean(form.compatible_choke_system), manufacturer_marking: clean(form.manufacturer_marking), constriction_mm: clean(form.constriction_mm), constriction_inches: clean(form.constriction_inches) };
    const res = editId ? await supabase.from("equipment_weapon_chokes").update(payload).eq("id", editId).eq("user_id", userId) : await supabase.from("equipment_weapon_chokes").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setChokeForms({ ...chokeForms, [weaponId]: emptyChoke }); setEditingChoke({ ...editingChoke, [weaponId]: null }); setSuccess("Choke saved."); await load();
  }
  function editChoke(weaponId: string, choke: Choke) { const standard = choke.standard_designation || chokeValueFromLegacyLabel(choke.label) || "other_custom"; setEditingChoke({ ...editingChoke, [weaponId]: choke.id }); setChokeForms({ ...chokeForms, [weaponId]: { standard_designation: standard, custom_label: standard === "other_custom" ? choke.label : "", manufacturer: choke.manufacturer || "", model_or_series: choke.model_or_series || "", compatible_choke_system: choke.compatible_choke_system || choke.choke_system || "", manufacturer_marking: choke.manufacturer_marking || "", constriction_mm: String(choke.constriction_mm || ""), constriction_inches: String(choke.constriction_inches || "") } }); }
  async function deleteChoke(id: string) { if (!confirm("Remove this choke? Current setup slots using it will be cleared.")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_weapon_chokes").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else load(); }

  async function saveAmmo(event: React.FormEvent) {
    event.preventDefault(); const grams = Number(ammoForm.payload_grams); const initialCount = parseShotCount(ammoForm.initial_shot_count);
    if (!ammoForm.manufacturer.trim()) { setError("Ammunition manufacturer is required."); return; }
    if (!Number.isFinite(grams) || grams <= 0) { setError("Payload weight must be greater than zero."); return; }
    if (initialCount === null) { setError("Estimated shots fired must be a whole number and cannot be negative."); return; }
    setBusy(true); setError(""); setSuccess("");
    const payload = { user_id: userId, manufacturer: ammoForm.manufacturer.trim(), product_name: clean(ammoForm.product_name), gauge: chosenGauge(ammoForm.gauge, ammoForm.customGauge), payload_grams: grams, shot_size: clean(ammoForm.shot_size), notes: clean(ammoForm.notes), is_default: ammoForm.is_default, initial_shot_count: initialCount };
    const res = editingAmmo ? await supabase.from("equipment_ammunition_profiles").update(payload).eq("id", editingAmmo).eq("user_id", userId) : await supabase.from("equipment_ammunition_profiles").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setAmmoForm(emptyAmmo); setEditingAmmo(null); setOpenPanel(null); setSuccess("Ammunition saved."); await load();
  }
  function editAmmo(profile: Ammo) { const normalized = displayGauge(profile.gauge); setEditingAmmo(profile.id); setOpenPanel("add_ammo"); setAmmoForm({ manufacturer: profile.manufacturer, product_name: profile.product_name || "", gauge: GAUGE_OPTIONS.includes(normalized) ? normalized : OTHER_CUSTOM, customGauge: GAUGE_OPTIONS.includes(normalized) ? "" : normalized, payload_grams: String(profile.payload_grams), shot_size: profile.shot_size || "", notes: profile.notes || "", is_default: profile.is_default, initial_shot_count: profile.initial_shot_count ? String(profile.initial_shot_count) : "" }); }
  async function deleteAmmo(id: string) { if (!confirm("Delete this ammunition profile?")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_ammunition_profiles").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Ammunition deleted."); await load(); } }
  async function setDefaultAmmo(id: string) { setBusy(true); const { error: defaultError } = await supabase.from("equipment_ammunition_profiles").update({ is_default: true }).eq("id", id).eq("user_id", userId); setBusy(false); if (defaultError) setError(friendlyError(defaultError.message)); else load(); }

  const chokesByWeapon = useMemo(() => chokes.reduce<Record<string, Choke[]>>((groups, choke) => { if (choke.choke_kind !== "fixed") groups[choke.weapon_id] = [...(groups[choke.weapon_id] || []), choke]; return groups; }, {}), [chokes]);
  const modelOptions = [...(SHOTGUN_MODELS_BY_MANUFACTURER[weaponForm.manufacturer] || []), OTHER_CUSTOM];

  return <main>
    <Datalist id="shotgun-manufacturers" options={SHOTGUN_MANUFACTURERS} /><Datalist id="shotgun-models" options={modelOptions} /><Datalist id="choke-manufacturers" options={CHOKE_MANUFACTURERS} />
    <section className="pageIntro"><h2>Equipment</h2><p>Manage your guns, chokes and ammunition.</p></section>
    {error && <div className="error">{error}</div>}{success && <div className="success">{success}</div>}{loading && <div className="notice">Loading equipment…</div>}

    <section className="card"><div className="sectionHeader"><div><p className="eyebrow">My guns</p><h2>My guns</h2></div><button type="button" className="smallButton secondary" onClick={() => { setOpenPanel(openPanel === "add_weapon" ? null : "add_weapon"); setEditingWeapon(null); setWeaponForm(emptyWeapon); }}>Add gun</button></div>{openPanel === "add_weapon" && <WeaponFormView form={weaponForm} editing={Boolean(editingWeapon)} busy={busy} modelOptions={modelOptions} onSubmit={saveWeapon} onChange={updateWeaponForm} onCancel={() => { setOpenPanel(null); setEditingWeapon(null); setWeaponForm(emptyWeapon); }} />}{weapons.length === 0 && !loading && <div className="emptyState">No guns yet.</div>}{weapons.map((weapon) => { const expanded = openPanel === `weapon:${weapon.id}` || openPanel === `chokes:${weapon.id}`; return <details className="subcard equipmentDetails" key={weapon.id} open={expanded} onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) setOpenPanel(`weapon:${weapon.id}`); else setOpenPanel(null); }}><summary><span><strong>{weapon.display_name}</strong> {weapon.is_default && <span className="badge badgeGold">Default</span>}<br /><small className="muted">{[displayGauge(weapon.gauge), weapon.is_default ? "Default" : null].filter(Boolean).join(" · ")}</small><br /><small className="muted">{[weapon.manufacturer, weapon.model].filter(Boolean).join(" · ")}</small><br /><small>{compactSetup(weapon, assignments, chokes)}</small><br /><small className="muted">{shotCountText(totalShots(weapon.initial_shot_count, shotDeltaFor("weapon", weapon.id)))}</small></span></summary>{expanded && <div className="equipmentCardBody"><div className="equipmentToolbar"><ActionMenu id={`gun-${weapon.id}`} openMenu={openMenu} setOpenMenu={setOpenMenu}><button type="button" onClick={() => editWeapon(weapon)}>Edit</button><button type="button" onClick={() => { setOpenPanel(`adjust_weapon:${weapon.id}`); setShotForm({ total: String(totalShots(weapon.initial_shot_count, shotDeltaFor("weapon", weapon.id))), note: "" }); }}>Adjust shots</button>{(weapon.choke_configuration_type || "interchangeable") === "interchangeable" && <button type="button" onClick={() => setOpenPanel(`chokes:${weapon.id}`)}>Manage chokes</button>}{!weapon.is_default && <button type="button" onClick={() => setDefaultWeapon(weapon.id)}>Set default</button>}<button type="button" className="danger" onClick={() => deleteWeapon(weapon.id)}>Delete</button></ActionMenu></div>{openPanel === `adjust_weapon:${weapon.id}` ? <ShotAdjuster currentTotal={totalShots(weapon.initial_shot_count, shotDeltaFor("weapon", weapon.id))} form={shotForm} busy={busy} onChange={setShotForm} onSave={() => saveShotAdjustment("weapon", weapon.id, weapon.initial_shot_count || 0)} onCancel={() => setOpenPanel(`weapon:${weapon.id}`)} /> : (weapon.choke_configuration_type || "interchangeable") === "fixed" ? <FixedSummary weapon={weapon} assignments={assignments} /> : <><h3>Current choke setup</h3><SetupEditor weapon={weapon} chokes={chokesByWeapon[weapon.id] || []} slots={slotsFor(weapon.weapon_type)} draftFor={draftFor} updateDraft={updateDraft} onSave={() => saveSetup(weapon)} busy={busy} /></>}{openPanel === `chokes:${weapon.id}` && <ChokeManager weaponId={weapon.id} chokes={chokesByWeapon[weapon.id] || []} form={chokeFormFor(weapon.id)} editing={Boolean(editingChoke[weapon.id])} busy={busy} onSubmit={saveChoke} onChange={updateChokeForm} onEdit={editChoke} onDelete={deleteChoke} openMenu={openMenu} setOpenMenu={setOpenMenu} onCancel={() => { setEditingChoke({ ...editingChoke, [weapon.id]: null }); setChokeForms({ ...chokeForms, [weapon.id]: emptyChoke }); setOpenPanel(`weapon:${weapon.id}`); }} />}</div>}</details>; })}</section>

    <section className="card"><div className="sectionHeader"><div><p className="eyebrow">My ammunition</p><h2>My ammunition</h2></div><button type="button" className="smallButton secondary" onClick={() => { setOpenPanel(openPanel === "add_ammo" ? null : "add_ammo"); setEditingAmmo(null); setAmmoForm(emptyAmmo); }}>Add ammunition</button></div>{openPanel === "add_ammo" && <AmmoFormView form={ammoForm} editing={Boolean(editingAmmo)} busy={busy} onSubmit={saveAmmo} onChange={(update) => setAmmoForm({ ...ammoForm, ...update })} onCancel={() => { setOpenPanel(null); setEditingAmmo(null); setAmmoForm(emptyAmmo); }} />}{ammo.length === 0 && !loading && <div className="emptyState">No ammunition profiles yet.</div>}{ammo.map((profile) => <div className="subcard equipmentListItem" key={profile.id}><span><strong>{[profile.manufacturer, profile.product_name].filter(Boolean).join(" ")}</strong> {profile.is_default && <span className="badge badgeGold">Default</span>}<br /><small className="muted">{[displayGauge(profile.gauge), `${profile.payload_grams} g`, profile.shot_size].filter(Boolean).join(" · ")}</small><br /><small className="muted">{shotCountText(totalShots(profile.initial_shot_count, shotDeltaFor("ammo", profile.id)))}</small></span><ActionMenu id={`ammo-${profile.id}`} openMenu={openMenu} setOpenMenu={setOpenMenu}><button type="button" onClick={() => editAmmo(profile)}>Edit</button><button type="button" onClick={() => { setOpenPanel(`adjust_ammo:${profile.id}`); setShotForm({ total: String(totalShots(profile.initial_shot_count, shotDeltaFor("ammo", profile.id))), note: "" }); }}>Adjust shots</button>{!profile.is_default && <button type="button" onClick={() => setDefaultAmmo(profile.id)}>Set default</button>}<button type="button" className="danger" onClick={() => deleteAmmo(profile.id)}>Delete</button></ActionMenu>{openPanel === `adjust_ammo:${profile.id}` && <ShotAdjuster currentTotal={totalShots(profile.initial_shot_count, shotDeltaFor("ammo", profile.id))} form={shotForm} busy={busy} onChange={setShotForm} onSave={() => saveShotAdjustment("ammo", profile.id, profile.initial_shot_count || 0)} onCancel={() => setOpenPanel(null)} />}</div>)}</section>
  </main>;
}

function sortWeapons(values: Weapon[]) { return [...values].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base", numeric: true })); }
function sortAmmo(values: Ammo[]) { return [...values].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.manufacturer.localeCompare(b.manufacturer, undefined, { sensitivity: "base", numeric: true }) || (a.product_name || "").localeCompare(b.product_name || "", undefined, { sensitivity: "base", numeric: true })); }

function WeaponFormView({ form, editing, busy, modelOptions, onSubmit, onChange, onCancel }: { form: WeaponForm; editing: boolean; busy: boolean; modelOptions: string[]; onSubmit: (event: React.FormEvent) => void; onChange: (update: Partial<WeaponForm>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="subcard compactForm"><Datalist id="weapon-form-models" options={modelOptions} /><h3>{editing ? "Edit gun" : "Add gun"}</h3><div className="row"><label>Manufacturer<input list="shotgun-manufacturers" value={form.manufacturer} onChange={(event) => onChange({ manufacturer: event.target.value, model: "" })} /></label><label>Model<input list="weapon-form-models" value={form.model} onChange={(event) => onChange({ model: event.target.value === OTHER_CUSTOM ? "" : event.target.value })} /></label></div><div className="row"><label>Gun type<select value={form.weapon_type} onChange={(event) => onChange({ weapon_type: event.target.value as WeaponType })}>{weaponTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label>Gauge<select value={form.gauge} onChange={(event) => onChange({ gauge: event.target.value })}>{GAUGE_OPTIONS.map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label></div>{form.gauge === OTHER_CUSTOM && <label>Custom gauge<input value={form.customGauge} onChange={(event) => onChange({ customGauge: event.target.value })} /></label>}<label>Display name<input value={form.display_name} onChange={(event) => onChange({ display_name: event.target.value, displayNameTouched: true })} required /></label><label className="checkboxLabel"><input type="checkbox" checked={form.is_default} onChange={(event) => onChange({ is_default: event.target.checked })} /> Set as default</label><label>Choke setup<select value={form.choke_configuration_type} onChange={(event) => onChange({ choke_configuration_type: event.target.value as ChokeConfigurationType })}><option value="interchangeable">Interchangeable chokes</option><option value="fixed">Fixed chokes</option></select></label>{form.choke_configuration_type === "fixed" && <div className="subcard"><h3>Fixed choke designations</h3>{slotsFor(form.weapon_type).map(({ slot, label }) => { const draft = form.fixedSlots[slot] || { mode: "fixed" as SetupMode, choke_id: "", fixed_standard_designation: "full", fixed_custom_label: "", fixed_manufacturer_marking: "" }; return <div className="setupRow" key={slot}><strong>{label}</strong><select value={draft.fixed_standard_designation} onChange={(event) => onChange({ fixedSlots: { ...form.fixedSlots, [slot]: { ...draft, fixed_standard_designation: event.target.value } } })}>{STANDARD_CHOKE_DESIGNATIONS.map((designation) => <option key={designation.value} value={designation.value}>{chokeDesignationLabel(designation.value)}</option>)}</select>{draft.fixed_standard_designation === "other_custom" && <input value={draft.fixed_custom_label} onChange={(event) => onChange({ fixedSlots: { ...form.fixedSlots, [slot]: { ...draft, fixed_custom_label: event.target.value } } })} placeholder="Custom label" />}</div>; })}</div>}<details><summary>Advanced details</summary><label>Estimated shots fired before app tracking<input type="number" min="0" step="1" value={form.initial_shot_count} onChange={(event) => onChange({ initial_shot_count: event.target.value })} /><span className="small muted">Optional. Future logged equipment use will be added to this starting number.</span></label></details><div className="btns"><button disabled={busy}>{editing ? "Save gun" : "Add gun"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></form>;
}

function SetupEditor({ weapon, chokes, slots, draftFor, updateDraft, onSave, busy }: { weapon: Weapon; chokes: Choke[]; slots: { slot: Slot; label: string }[]; draftFor: (weaponId: string, slot: Slot) => SlotDraft; updateDraft: (weaponId: string, slot: Slot, update: Partial<SlotDraft>) => void; onSave: () => void; busy: boolean }) {
  return <div className="setupTable">{slots.map(({ slot, label }) => { const draft = draftFor(weapon.id, slot); return <div className="setupRow" key={slot}><strong>{label}</strong><select value={draft.choke_id} onChange={(event) => updateDraft(weapon.id, slot, { mode: "interchangeable", choke_id: event.target.value })}><option value="">Not set</option>{chokes.map((choke) => <option key={choke.id} value={choke.id}>{chokeSummary(choke)} · {chokeDetail(choke)}</option>)}</select></div>; })}<div className="btns"><button type="button" className="smallButton" onClick={onSave} disabled={busy}>Save setup</button></div></div>;
}

function FixedSummary({ weapon, assignments }: { weapon: Weapon; assignments: Assignment[] }) {
  return <div className="setupTable"><h3>Fixed choke setup</h3>{slotsFor(weapon.weapon_type).map(({ slot, label }) => <div className="setupRow" key={slot}><strong>{label}</strong><span>{fixedText(assignments.find((assignment) => assignment.weapon_id === weapon.id && assignment.slot === slot))}</span></div>)}<p className="small muted">Use Edit to change fixed choke designations.</p></div>;
}

function ShotAdjuster({ currentTotal, form, busy, onChange, onSave, onCancel }: { currentTotal: number; form: { total: string; note: string }; busy: boolean; onChange: (form: { total: string; note: string }) => void; onSave: () => void; onCancel: () => void }) {
  return <div className="subcard compactForm"><h3>Adjust shots</h3><p className="muted">Current total shots: <strong>{new Intl.NumberFormat().format(currentTotal)}</strong></p><label>New total shots<input type="number" min="0" step="1" value={form.total} onChange={(event) => onChange({ ...form, total: event.target.value })} /></label><label>Reason or note<textarea value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} /></label><div className="btns"><button type="button" onClick={onSave} disabled={busy}>Save</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></div>;
}
function ChokeManager({ weaponId, chokes, form, editing, busy, onSubmit, onChange, onEdit, onDelete, openMenu, setOpenMenu, onCancel }: { weaponId: string; chokes: Choke[]; form: ChokeForm; editing: boolean; busy: boolean; onSubmit: (event: React.FormEvent, weaponId: string) => void; onChange: (weaponId: string, update: Partial<ChokeForm>) => void; onEdit: (weaponId: string, choke: Choke) => void; onDelete: (id: string) => void; openMenu: string | null; setOpenMenu: (id: string | null) => void; onCancel: () => void }) {
  const systemOptions = [...(CHOKE_SYSTEMS_BY_MANUFACTURER[form.manufacturer] || []), OTHER_CUSTOM];
  return <div className="subcard"><Datalist id={`choke-systems-${weaponId}`} options={systemOptions} /><h3>Manage chokes</h3>{chokes.length === 0 && <p className="muted">No interchangeable chokes registered yet.</p>}{chokes.map((choke) => <div className="equipmentListItem compactItem" key={choke.id}><span><strong>{chokeSummary(choke)}</strong><br /><small className="muted">{chokeDetail(choke)}</small></span><ActionMenu id={`choke-${choke.id}`} openMenu={openMenu} setOpenMenu={setOpenMenu}><button type="button" onClick={() => onEdit(weaponId, choke)}>Edit</button><button type="button" className="danger" onClick={() => onDelete(choke.id)}>Remove</button></ActionMenu></div>)}<form onSubmit={(event) => onSubmit(event, weaponId)} className="compactForm"><h3>{editing ? "Edit choke" : "Add choke"}</h3><label>Standard designation<select value={form.standard_designation} onChange={(event) => onChange(weaponId, { standard_designation: event.target.value })}>{STANDARD_CHOKE_DESIGNATIONS.map((designation) => <option key={designation.value} value={designation.value}>{chokeDesignationLabel(designation.value)}</option>)}</select></label>{form.standard_designation === "other_custom" && <label>Custom designation<input value={form.custom_label} onChange={(event) => onChange(weaponId, { custom_label: event.target.value })} /></label>}<div className="row"><label>Manufacturer<input list="choke-manufacturers" value={form.manufacturer} onChange={(event) => onChange(weaponId, { manufacturer: event.target.value })} /></label><label>Choke model/series<input value={form.model_or_series} onChange={(event) => onChange(weaponId, { model_or_series: event.target.value })} /></label></div><details><summary>Advanced details</summary><label>Manufacturer marking<input value={form.manufacturer_marking} onChange={(event) => onChange(weaponId, { manufacturer_marking: event.target.value })} /></label><label>Compatible choke system<input list={`choke-systems-${weaponId}`} value={form.compatible_choke_system} onChange={(event) => onChange(weaponId, { compatible_choke_system: event.target.value === OTHER_CUSTOM ? "" : event.target.value })} /></label><div className="row"><label>Constriction mm<input type="number" step="0.001" min="0" value={form.constriction_mm} onChange={(event) => onChange(weaponId, { constriction_mm: event.target.value })} /></label><label>Constriction inches<input type="number" step="0.0001" min="0" value={form.constriction_inches} onChange={(event) => onChange(weaponId, { constriction_inches: event.target.value })} /></label></div></details><div className="btns"><button disabled={busy}>{editing ? "Save choke" : "Add choke"}</button><button type="button" className="secondary" onClick={onCancel}>Close</button></div></form></div>;
}

function AmmoFormView({ form, editing, busy, onSubmit, onChange, onCancel }: { form: AmmoForm; editing: boolean; busy: boolean; onSubmit: (event: React.FormEvent) => void; onChange: (update: Partial<AmmoForm>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="subcard compactForm"><h3>{editing ? "Edit ammunition" : "Add ammunition"}</h3><div className="row"><label>Manufacturer<input value={form.manufacturer} onChange={(event) => onChange({ manufacturer: event.target.value })} required /></label><label>Product name<input value={form.product_name} onChange={(event) => onChange({ product_name: event.target.value })} /></label></div><div className="row"><label>Gauge<select value={form.gauge} onChange={(event) => onChange({ gauge: event.target.value })}>{GAUGE_OPTIONS.map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label><label>Payload<input type="number" min="1" step="0.1" value={form.payload_grams} onChange={(event) => onChange({ payload_grams: event.target.value })} required /></label></div>{form.gauge === OTHER_CUSTOM && <label>Custom gauge<input value={form.customGauge} onChange={(event) => onChange({ customGauge: event.target.value })} /></label>}<label>Shot size<input value={form.shot_size} onChange={(event) => onChange({ shot_size: event.target.value })} /></label><label className="checkboxLabel"><input type="checkbox" checked={form.is_default} onChange={(event) => onChange({ is_default: event.target.checked })} /> Set as default</label><details><summary>Advanced details</summary><label>Estimated shots fired before app tracking<input type="number" min="0" step="1" value={form.initial_shot_count} onChange={(event) => onChange({ initial_shot_count: event.target.value })} /><span className="small muted">Optional. Future logged equipment use will be added to this starting number.</span></label><label>Notes<textarea value={form.notes} onChange={(event) => onChange({ notes: event.target.value })} /></label></details><div className="btns"><button disabled={busy}>{editing ? "Save ammunition" : "Add ammunition"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></form>;
}
function ActionMenu({ id, openMenu, setOpenMenu, children }: { id: string; openMenu: string | null; setOpenMenu: (id: string | null) => void; children: React.ReactNode }) { return <details className="actionMenu" open={openMenu === id} onClick={(event) => event.stopPropagation()} onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement).open; setOpenMenu(open ? id : null); }}><summary>Actions</summary><div onClick={() => setOpenMenu(null)}>{children}</div></details>; }
