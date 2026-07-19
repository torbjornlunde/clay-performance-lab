"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  AMMUNITION_MANUFACTURERS,
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
import { formatLastServicedDate, normalizeLastServicedDate, todayDateInputValue } from "@/lib/equipment/serviceDates";
import { supabase } from "@/lib/supabase/client";

type WeaponType = "over_under" | "side_by_side" | "semi_automatic" | "pump_action";
type Slot = "upper" | "lower" | "left" | "right" | "single";
type SetupMode = "interchangeable" | "fixed" | "not_set";
type ChokeConfigurationType = "interchangeable" | "fixed";
type Panel = "add_weapon" | "add_ammo" | `chokes:${string}` | `adjust_weapon:${string}` | `adjust_ammo:${string}` | null;

type Weapon = { id: string; user_id: string; display_name: string; manufacturer: string | null; model: string | null; weapon_type: WeaponType; gauge: string | null; is_default: boolean; last_serviced_on?: string | null; choke_configuration_type?: ChokeConfigurationType | null; initial_shot_count?: number | null; shot_tracking_started_at?: string | null; created_at: string; updated_at: string };
type Choke = { id: string; weapon_id: string; user_id: string; label: string; manufacturer: string | null; choke_system: string | null; constriction: string | null; choke_kind: string; standard_designation?: string | null; fraction_designation?: string | null; model_or_series?: string | null; compatible_choke_system?: string | null; manufacturer_marking?: string | null; constriction_mm?: string | number | null; constriction_inches?: string | number | null; created_at: string; updated_at: string };
type Assignment = { id: string; weapon_id: string; user_id: string; slot: Slot; choke_id: string | null; fixed_choke_label: string | null; setup_mode?: SetupMode | null; fixed_standard_designation?: string | null; fixed_fraction_designation?: string | null; fixed_manufacturer_marking?: string | null; created_at: string; updated_at: string };
type ShotEvent = { id: string; user_id: string; weapon_id: string | null; ammunition_profile_id: string | null; shot_delta: number; event_type: string; note: string | null; created_at: string; updated_at: string };
type Ammo = { id: string; user_id: string; manufacturer: string; product_name: string | null; gauge: string | null; payload_grams: number; shot_size: string | null; notes: string | null; is_default: boolean; initial_shot_count?: number | null; shot_tracking_started_at?: string | null; created_at: string; updated_at: string };

type WeaponForm = { display_name: string; manufacturer: string; model: string; weapon_type: WeaponType; gauge: string; customGauge: string; is_default: boolean; last_serviced_on: string; choke_configuration_type: ChokeConfigurationType; initial_shot_count: string; displayNameTouched: boolean; fixedSlots: Record<string, SlotDraft> };
type ChokeForm = { standard_designation: string; custom_label: string; manufacturer: string; model_or_series: string; compatible_choke_system: string; manufacturer_marking: string; constriction_mm: string; constriction_inches: string };
type AmmoForm = { manufacturer: string; product_name: string; gauge: string; customGauge: string; payload_grams: string; shot_size: string; notes: string; is_default: boolean; initial_shot_count: string };
type SlotDraft = { mode: SetupMode; choke_id: string; fixed_standard_designation: string; fixed_custom_label: string; fixed_manufacturer_marking: string };
type ChokeSelectorState = { weaponId: string; slot: Slot; label: string } | null;

const weaponTypes: { value: WeaponType; label: string }[] = [
  { value: "over_under", label: "Over/under" },
  { value: "side_by_side", label: "Side-by-side" },
  { value: "semi_automatic", label: "Semi-automatic" },
  { value: "pump_action", label: "Pump-action" },
];
const emptyWeapon: WeaponForm = { display_name: "", manufacturer: "", model: "", weapon_type: "over_under", gauge: "12 gauge", customGauge: "", is_default: false, last_serviced_on: "", choke_configuration_type: "interchangeable", initial_shot_count: "", displayNameTouched: false, fixedSlots: {} };
const emptyChoke: ChokeForm = { standard_designation: "modified", custom_label: "", manufacturer: "", model_or_series: "", compatible_choke_system: "", manufacturer_marking: "", constriction_mm: "", constriction_inches: "" };
const emptyAmmo: AmmoForm = { manufacturer: "", product_name: "", gauge: "12 gauge", customGauge: "", payload_grams: "28", shot_size: "", notes: "", is_default: false, initial_shot_count: "" };
const designationOrder = new Map(STANDARD_CHOKE_DESIGNATIONS.map((designation, index) => [designation.value, index]));

function slotsFor(type: WeaponType): { slot: Slot; label: string; summary: string }[] {
  if (type === "over_under") return [{ slot: "lower", label: "Lower barrel", summary: "Lower" }, { slot: "upper", label: "Upper barrel", summary: "Upper" }];
  if (type === "side_by_side") return [{ slot: "left", label: "Left barrel", summary: "Left" }, { slot: "right", label: "Right barrel", summary: "Right" }];
  return [{ slot: "single", label: "Choke", summary: "Choke" }];
}
function clean(value: string) { return value.trim() || null; }
function canonicalValue(value: string, options: string[]) { return options.find((option) => option.toLowerCase() === value.trim().toLowerCase()) || value; }
function chosenGauge(gauge: string, customGauge: string) { return gauge === OTHER_CUSTOM ? clean(customGauge) : clean(normalizeGauge(gauge)); }
function displayGauge(value: string | null) { return normalizeGauge(value) || value || ""; }
function designationFraction(value: string) { return chokeDesignationByValue(value)?.fraction || null; }
function chokePrimaryLabel(choke: Choke) { return chokeDesignationLabel(choke.standard_designation || chokeValueFromLegacyLabel(choke.label), choke.label); }
function chokeSecondaryLabel(choke: Choke) { return [choke.manufacturer, choke.model_or_series].filter(Boolean).join(" · "); }
function chokeTertiaryLabel(choke: Choke) { return [choke.compatible_choke_system || choke.choke_system, choke.manufacturer_marking, choke.constriction_mm ? `${choke.constriction_mm} mm` : null, choke.constriction_inches ? `${choke.constriction_inches}\"` : null].filter(Boolean).join(" · "); }
function totalShots(initial?: number | null, delta = 0) { return Math.max((initial || 0) + delta, 0); }
function shotCountText(total: number, label: "gun" | "ammo") { const prefix = label === "gun" ? "Total shots" : "Cartridges used"; return total > 0 ? `${prefix}: ${new Intl.NumberFormat().format(total)}` : `${prefix}: Not set`; }
function lastServicedText(value?: string | null) { return `Last serviced: ${formatLastServicedDate(value)}`; }
function formatShotSize(value: string | null | undefined) { const normalized = (value || "").trim().replace(",", ".").replace(/^no\.?\s*/i, ""); return normalized ? `No. ${normalized}` : ""; }
function normalizeShotSizeInput(value: string) { return value.trim().replace(",", ".").replace(/^no\.?\s*/i, ""); }
function assignmentMode(assignment?: Assignment): SetupMode { return assignment?.setup_mode || (assignment?.choke_id ? "interchangeable" : assignment?.fixed_choke_label ? "fixed" : "not_set"); }
function fixedText(assignment?: Assignment) { return assignment ? chokeDesignationLabel(assignment.fixed_standard_designation || chokeValueFromLegacyLabel(assignment.fixed_choke_label), assignment.fixed_choke_label) : "Not set"; }
function weaponTechnicalSummary(weapon: Weapon) { return [weapon.manufacturer, weapon.model, displayGauge(weapon.gauge)].filter(Boolean).join(" · "); }
function weaponOptionLabel(weapon: Weapon) { const technical = weaponTechnicalSummary(weapon); return technical && technical !== weapon.display_name ? `${weapon.display_name} — ${technical}` : weapon.display_name; }
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
function sortChokesForSelection(values: Choke[]) {
  return [...values].sort((a, b) => {
    const aValue = a.standard_designation || chokeValueFromLegacyLabel(a.label) || "other_custom";
    const bValue = b.standard_designation || chokeValueFromLegacyLabel(b.label) || "other_custom";
    return (designationOrder.get(aValue) ?? 999) - (designationOrder.get(bValue) ?? 999) || chokeSecondaryLabel(a).localeCompare(chokeSecondaryLabel(b), undefined, { sensitivity: "base", numeric: true });
  });
}

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
  const [expandedGunId, setExpandedGunId] = useState<string | null>(null);
  const [expandedAmmoId, setExpandedAmmoId] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [weaponForm, setWeaponForm] = useState<WeaponForm>(emptyWeapon);
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const [ammoForm, setAmmoForm] = useState<AmmoForm>(emptyAmmo);
  const [editingAmmo, setEditingAmmo] = useState<string | null>(null);
  const [chokeForm, setChokeForm] = useState<ChokeForm>(emptyChoke);
  const [editingChokeId, setEditingChokeId] = useState<string | null>(null);
  const [editingChokeWeaponId, setEditingChokeWeaponId] = useState<string | null>(null);
  const [setupDrafts, setSetupDrafts] = useState<Record<string, SlotDraft>>({});
  const [shotForm, setShotForm] = useState({ total: "", note: "" });
  const [activeChokeSelector, setActiveChokeSelector] = useState<ChokeSelectorState>(null);

  useEffect(() => { load(); }, []);
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
    setChokes(sortChokesForSelection((c.data || []) as Choke[]));
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
    setOpenPanel(null); setShotForm({ total: "", note: "" }); setSuccess(target === "weapon" ? "Shot count updated." : "Usage count updated."); await load();
  }

  function updateWeaponForm(update: Partial<WeaponForm>) {
    const next = { ...weaponForm, ...update };
    if (("manufacturer" in update || "model" in update) && !next.displayNameTouched) next.display_name = [next.manufacturer, next.model].filter(Boolean).join(" ").trim();
    setWeaponForm(next);
  }
  async function saveWeapon(event: React.FormEvent) {
    event.preventDefault(); if (!userId || busy) return;
    const initialCount = parseShotCount(weaponForm.initial_shot_count);
    if (initialCount === null) { setError("Estimated shots fired must be a whole number and cannot be negative."); return; }
    if (!weaponForm.display_name.trim()) { setError("Display name is required."); return; }
    const lastServiced = normalizeLastServicedDate(weaponForm.last_serviced_on);
    if (!lastServiced.ok) { setError(lastServiced.message); return; }
    setBusy(true); setError(""); setSuccess("");
    const existingWeapon = weapons.find((weapon) => weapon.id === editingWeapon);
    if (existingWeapon && existingWeapon.choke_configuration_type && existingWeapon.choke_configuration_type !== weaponForm.choke_configuration_type) {
      const warning = existingWeapon.choke_configuration_type === "interchangeable" ? "Changing this gun to fixed chokes will clear installed interchangeable choke assignments. Physical choke inventory will be kept." : "Changing this gun to interchangeable chokes will clear fixed barrel designations.";
      if (!confirm(warning)) { setBusy(false); return; }
    }
    const manufacturer = canonicalValue(weaponForm.manufacturer, SHOTGUN_MANUFACTURERS);
    const model = canonicalValue(weaponForm.model, modelOptions);
    const payload = { user_id: userId, display_name: weaponForm.display_name.trim(), manufacturer: clean(manufacturer), model: clean(model), weapon_type: weaponForm.weapon_type, gauge: chosenGauge(weaponForm.gauge, weaponForm.customGauge), is_default: weaponForm.is_default, last_serviced_on: lastServiced.value, initial_shot_count: initialCount, choke_configuration_type: weaponForm.choke_configuration_type };
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
    } else if (existingWeapon?.choke_configuration_type === "fixed") await supabase.from("equipment_weapon_current_choke_assignments").delete().eq("weapon_id", savedWeaponId).eq("user_id", userId);
    setBusy(false); setWeaponForm(emptyWeapon); setEditingWeapon(null); setOpenPanel(null); setSuccess("Gun saved."); await load();
  }
  function editWeapon(weapon: Weapon) { setExpandedGunId(weapon.id); const normalized = displayGauge(weapon.gauge); const fixedSlots = Object.fromEntries(slotsFor(weapon.weapon_type).map(({ slot }) => [slot, draftFor(weapon.id, slot)])); setEditingWeapon(weapon.id); setOpenPanel("add_weapon"); setWeaponForm({ display_name: weapon.display_name, manufacturer: weapon.manufacturer || "", model: weapon.model || "", weapon_type: weapon.weapon_type, gauge: GAUGE_OPTIONS.includes(normalized) ? normalized : OTHER_CUSTOM, customGauge: GAUGE_OPTIONS.includes(normalized) ? "" : normalized, is_default: weapon.is_default, last_serviced_on: weapon.last_serviced_on || "", choke_configuration_type: weapon.choke_configuration_type || "interchangeable", initial_shot_count: weapon.initial_shot_count ? String(weapon.initial_shot_count) : "", displayNameTouched: true, fixedSlots }); }
  async function deleteWeapon(id: string) { if (!confirm("Delete this gun and its chokes?")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_weapons").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Gun deleted."); await load(); } }
  async function setDefaultWeapon(id: string) { setBusy(true); const { error: defaultError } = await supabase.from("equipment_weapons").update({ is_default: true }).eq("id", id).eq("user_id", userId); setBusy(false); if (defaultError) setError(friendlyError(defaultError.message)); else { setSuccess("Default gun updated."); load(); } }

  function draftKey(weaponId: string, slot: Slot) { return `${weaponId}:${slot}`; }
  function draftFor(weaponId: string, slot: Slot): SlotDraft {
    const key = draftKey(weaponId, slot);
    const assignment = assignments.find((item) => item.weapon_id === weaponId && item.slot === slot);
    return setupDrafts[key] || { mode: assignmentMode(assignment), choke_id: assignment?.choke_id || "", fixed_standard_designation: assignment?.fixed_standard_designation || chokeValueFromLegacyLabel(assignment?.fixed_choke_label) || "full", fixed_custom_label: assignment?.fixed_standard_designation ? "" : assignment?.fixed_choke_label || "", fixed_manufacturer_marking: assignment?.fixed_manufacturer_marking || "" };
  }
  function updateDraft(weaponId: string, slot: Slot, update: Partial<SlotDraft>) { const key = draftKey(weaponId, slot); setSetupDrafts({ ...setupDrafts, [key]: { ...draftFor(weaponId, slot), ...update } }); }
  async function saveInstalledChoke(weaponId: string, slot: Slot, chokeId: string) {
    const previous = draftFor(weaponId, slot);
    updateDraft(weaponId, slot, { mode: chokeId ? "interchangeable" : "not_set", choke_id: chokeId });
    setActiveChokeSelector(null); setBusy(true); setError("");
    const row = { user_id: userId, weapon_id: weaponId, slot, setup_mode: chokeId ? "interchangeable" : "not_set", choke_id: chokeId || null, fixed_choke_label: null, fixed_standard_designation: null, fixed_fraction_designation: null, fixed_manufacturer_marking: null };
    const { error: saveError } = await supabase.from("equipment_weapon_current_choke_assignments").upsert(row, { onConflict: "weapon_id,slot" });
    setBusy(false);
    if (saveError) { updateDraft(weaponId, slot, previous); setError(friendlyError(saveError.message)); return; }
    setSuccess("Choke updated."); await load();
  }

  function updateChokeForm(update: Partial<ChokeForm>) { setChokeForm({ ...chokeForm, ...update }); }
  async function saveChoke(event: React.FormEvent, weaponId: string) {
    event.preventDefault(); const isCustom = chokeForm.standard_designation === "other_custom"; const label = isCustom ? chokeForm.custom_label.trim() : chokeDesignationLabel(chokeForm.standard_designation);
    if (!label) { setError("Choose a choke designation or enter a custom choke label."); return; }
    const editId = editingChokeWeaponId === weaponId ? editingChokeId : null;
    const duplicate = !editId && (chokesByWeapon[weaponId] || []).some((choke) => (choke.standard_designation || chokeValueFromLegacyLabel(choke.label) || choke.label) === (isCustom ? label : chokeForm.standard_designation) && (choke.manufacturer || "").toLowerCase() === chokeForm.manufacturer.trim().toLowerCase() && (choke.model_or_series || "").toLowerCase() === chokeForm.model_or_series.trim().toLowerCase());
    if (duplicate && !confirm("This looks like a choke already registered for this gun. Add it anyway?")) return;
    setBusy(true); setError("");
    const manufacturer = canonicalValue(chokeForm.manufacturer, CHOKE_MANUFACTURERS);
    const payload = { user_id: userId, weapon_id: weaponId, label, manufacturer: clean(manufacturer), choke_system: clean(chokeForm.compatible_choke_system), constriction: null, choke_kind: "interchangeable", standard_designation: isCustom ? null : chokeForm.standard_designation, fraction_designation: designationFraction(chokeForm.standard_designation), model_or_series: clean(chokeForm.model_or_series), compatible_choke_system: clean(chokeForm.compatible_choke_system), manufacturer_marking: clean(chokeForm.manufacturer_marking), constriction_mm: clean(chokeForm.constriction_mm), constriction_inches: clean(chokeForm.constriction_inches) };
    const res = editId ? await supabase.from("equipment_weapon_chokes").update(payload).eq("id", editId).eq("user_id", userId) : await supabase.from("equipment_weapon_chokes").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setChokeForm(emptyChoke); setEditingChokeId(null); setEditingChokeWeaponId(null); setSuccess("Choke saved."); await load();
  }
  function editChoke(weaponId: string, choke: Choke) {
    const standard = choke.standard_designation || chokeValueFromLegacyLabel(choke.label) || "other_custom";
    setOpenPanel(`chokes:${weaponId}`); setEditingChokeId(choke.id); setEditingChokeWeaponId(weaponId);
    setChokeForm({ standard_designation: standard, custom_label: standard === "other_custom" ? choke.label : "", manufacturer: choke.manufacturer || "", model_or_series: choke.model_or_series || "", compatible_choke_system: choke.compatible_choke_system || choke.choke_system || "", manufacturer_marking: choke.manufacturer_marking || "", constriction_mm: String(choke.constriction_mm || ""), constriction_inches: String(choke.constriction_inches || "") });
  }
  function cancelChokeEdit() { setEditingChokeId(null); setEditingChokeWeaponId(null); setChokeForm(emptyChoke); }
  async function deleteChoke(id: string) { if (!confirm("Remove this choke? Current setup slots using it will be cleared.")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_weapon_chokes").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Choke removed."); await load(); } }

  async function saveAmmo(event: React.FormEvent) {
    event.preventDefault(); const grams = Number(ammoForm.payload_grams); const initialCount = parseShotCount(ammoForm.initial_shot_count);
    if (!ammoForm.manufacturer.trim()) { setError("Ammunition manufacturer is required."); return; }
    if (!Number.isFinite(grams) || grams <= 0) { setError("Payload weight must be greater than zero."); return; }
    if (initialCount === null) { setError("Estimated cartridges used must be a whole number and cannot be negative."); return; }
    setBusy(true); setError(""); setSuccess("");
    const manufacturer = canonicalValue(ammoForm.manufacturer, AMMUNITION_MANUFACTURERS);
    const payload = { user_id: userId, manufacturer: manufacturer.trim(), product_name: clean(ammoForm.product_name), gauge: chosenGauge(ammoForm.gauge, ammoForm.customGauge), payload_grams: grams, shot_size: clean(normalizeShotSizeInput(ammoForm.shot_size)), notes: clean(ammoForm.notes), is_default: ammoForm.is_default, initial_shot_count: initialCount };
    const res = editingAmmo ? await supabase.from("equipment_ammunition_profiles").update(payload).eq("id", editingAmmo).eq("user_id", userId) : await supabase.from("equipment_ammunition_profiles").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setAmmoForm(emptyAmmo); setEditingAmmo(null); setOpenPanel(null); setSuccess("Ammunition saved."); await load();
  }
  function editAmmo(profile: Ammo) { const normalized = displayGauge(profile.gauge); setExpandedAmmoId(profile.id); setEditingAmmo(profile.id); setOpenPanel("add_ammo"); setAmmoForm({ manufacturer: profile.manufacturer, product_name: profile.product_name || "", gauge: GAUGE_OPTIONS.includes(normalized) ? normalized : OTHER_CUSTOM, customGauge: GAUGE_OPTIONS.includes(normalized) ? "" : normalized, payload_grams: String(profile.payload_grams), shot_size: normalizeShotSizeInput(profile.shot_size || ""), notes: profile.notes || "", is_default: profile.is_default, initial_shot_count: profile.initial_shot_count ? String(profile.initial_shot_count) : "" }); }
  async function deleteAmmo(id: string) { if (!confirm("Delete this ammunition profile?")) return; setBusy(true); const { error: deleteError } = await supabase.from("equipment_ammunition_profiles").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (deleteError) setError(friendlyError(deleteError.message)); else { setSuccess("Ammunition deleted."); await load(); } }
  async function setDefaultAmmo(id: string) { setBusy(true); const { error: defaultError } = await supabase.from("equipment_ammunition_profiles").update({ is_default: true }).eq("id", id).eq("user_id", userId); setBusy(false); if (defaultError) setError(friendlyError(defaultError.message)); else { setSuccess("Default ammunition updated."); load(); } }

  const chokesByWeapon = useMemo(() => chokes.reduce<Record<string, Choke[]>>((groups, choke) => { if (choke.choke_kind !== "fixed") groups[choke.weapon_id] = [...(groups[choke.weapon_id] || []), choke]; return groups; }, {}), [chokes]);
  const modelOptions = [...(SHOTGUN_MODELS_BY_MANUFACTURER[weaponForm.manufacturer] || []), OTHER_CUSTOM];
  const activeChokeWeapon = typeof openPanel === "string" && openPanel.startsWith("chokes:") ? weapons.find((weapon) => weapon.id === openPanel.slice("chokes:".length)) || null : null;

  return <main>
    <section className="pageIntro"><h2>Equipment</h2><p>Manage your guns, chokes and ammunition.</p></section>
    {error && <div className="error">{error}</div>}{success && <div className="success">{success}</div>}{loading && <div className="notice">Loading equipment…</div>}

    <section className="card"><div className="sectionHeader equipmentSectionHeader"><div><p className="eyebrow">My guns</p><h2>My guns</h2></div><div className="equipmentSectionActions"><label>Default gun<select value={weapons.find((weapon) => weapon.is_default)?.id || ""} disabled={weapons.length === 0} onChange={(event) => setDefaultWeapon(event.target.value)}><option value="">{weapons.length === 0 ? "No guns yet" : "Select default"}</option>{weapons.map((weapon) => <option key={weapon.id} value={weapon.id}>{weaponOptionLabel(weapon)}</option>)}</select></label><button type="button" className="smallButton secondary" onClick={() => { setOpenPanel(openPanel === "add_weapon" ? null : "add_weapon"); setEditingWeapon(null); setWeaponForm(emptyWeapon); }}>Add gun</button></div></div>{weapons.length === 0 && !loading && <div className="emptyState">No guns yet.</div>}{weapons.map((weapon) => { const expanded = expandedGunId === weapon.id; return <div className="subcard equipmentDetails" key={weapon.id}><div className="equipmentCardHeader"><span><strong>{weapon.display_name}</strong> {weapon.is_default && <span className="badge badgeGold">Default</span>}<br /><small className="muted">{weaponTechnicalSummary(weapon)}</small><br /><small>{compactSetup(weapon, assignments, chokes)}</small><br /><small className="muted">{shotCountText(totalShots(weapon.initial_shot_count, shotDeltaFor("weapon", weapon.id)), "gun")}</small><br /><small className="muted">{lastServicedText(weapon.last_serviced_on)}</small></span><button type="button" className="secondary smallButton" aria-label={expanded ? "Collapse gun" : "Expand gun"} onClick={(event) => { event.stopPropagation(); setExpandedGunId(expanded ? null : weapon.id); setOpenPanel(null); }}>{expanded ? "▴" : "▾"}</button></div>{expanded && <div className="equipmentCardBody"><div className="equipmentToolbar"><button type="button" className="secondary smallButton" onClick={() => editWeapon(weapon)}>Edit gun</button><button type="button" className="secondary smallButton" onClick={() => { setExpandedGunId(weapon.id); setOpenPanel(`adjust_weapon:${weapon.id}`); setShotForm({ total: String(totalShots(weapon.initial_shot_count, shotDeltaFor("weapon", weapon.id))), note: "" }); }}>Update shot count</button>{(weapon.choke_configuration_type || "interchangeable") === "interchangeable" && <button type="button" className="secondary smallButton" onClick={() => { setExpandedGunId(weapon.id); setOpenPanel(`chokes:${weapon.id}`); cancelChokeEdit(); }}>Manage chokes</button>}<button type="button" className="danger smallButton" onClick={() => deleteWeapon(weapon.id)}>Delete</button></div>{openPanel === `adjust_weapon:${weapon.id}` ? <ShotAdjuster kind="gun" currentTotal={totalShots(weapon.initial_shot_count, shotDeltaFor("weapon", weapon.id))} form={shotForm} busy={busy} onChange={setShotForm} onSave={() => saveShotAdjustment("weapon", weapon.id, weapon.initial_shot_count || 0)} onCancel={() => setOpenPanel(null)} /> : (weapon.choke_configuration_type || "interchangeable") === "fixed" ? <FixedSummary weapon={weapon} assignments={assignments} /> : <><h3>Current choke setup</h3><SetupEditor weapon={weapon} chokes={chokesByWeapon[weapon.id] || []} slots={slotsFor(weapon.weapon_type)} draftFor={draftFor} openSelector={(slot, label) => setActiveChokeSelector({ weaponId: weapon.id, slot, label })} /></>}</div>}</div>; })}</section>

    <section className="card"><div className="sectionHeader equipmentSectionHeader"><div><p className="eyebrow">My ammunition</p><h2>My ammunition</h2></div><div className="equipmentSectionActions"><label>Default ammunition<select value={ammo.find((profile) => profile.is_default)?.id || ""} disabled={ammo.length === 0} onChange={(event) => setDefaultAmmo(event.target.value)}><option value="">{ammo.length === 0 ? "No ammunition yet" : "Select default"}</option>{ammo.map((profile) => <option key={profile.id} value={profile.id}>{[profile.manufacturer, profile.product_name].filter(Boolean).join(" · ")}</option>)}</select></label><button type="button" className="smallButton secondary" onClick={() => { setOpenPanel(openPanel === "add_ammo" ? null : "add_ammo"); setEditingAmmo(null); setAmmoForm(emptyAmmo); }}>Add ammunition</button></div></div>{ammo.length === 0 && !loading && <div className="emptyState">No ammunition profiles yet.</div>}{ammo.map((profile) => { const expanded = expandedAmmoId === profile.id; return <div className="subcard equipmentDetails" key={profile.id}><div className="equipmentCardHeader"><span><strong>{[profile.manufacturer, profile.product_name].filter(Boolean).join(" · ")}</strong> {profile.is_default && <span className="badge badgeGold">Default</span>}<br /><small className="muted">{[displayGauge(profile.gauge), `${profile.payload_grams} g`, formatShotSize(profile.shot_size)].filter(Boolean).join(" · ")}</small><br /><small className="muted">{shotCountText(totalShots(profile.initial_shot_count, shotDeltaFor("ammo", profile.id)), "ammo")}</small></span><button type="button" className="secondary smallButton" aria-label={expanded ? "Collapse ammunition" : "Expand ammunition"} onClick={(event) => { event.stopPropagation(); setExpandedAmmoId(expanded ? null : profile.id); setOpenPanel(null); }}>{expanded ? "▴" : "▾"}</button></div>{expanded && <div className="equipmentCardBody"><div className="equipmentToolbar"><button type="button" className="secondary smallButton" onClick={() => editAmmo(profile)}>Edit ammunition</button><button type="button" className="secondary smallButton" onClick={() => { setExpandedAmmoId(profile.id); setOpenPanel(`adjust_ammo:${profile.id}`); setShotForm({ total: String(totalShots(profile.initial_shot_count, shotDeltaFor("ammo", profile.id))), note: "" }); }}>Update usage count</button><button type="button" className="danger smallButton" onClick={() => deleteAmmo(profile.id)}>Delete</button></div>{openPanel === `adjust_ammo:${profile.id}` && <ShotAdjuster kind="ammo" currentTotal={totalShots(profile.initial_shot_count, shotDeltaFor("ammo", profile.id))} form={shotForm} busy={busy} onChange={setShotForm} onSave={() => saveShotAdjustment("ammo", profile.id, profile.initial_shot_count || 0)} onCancel={() => setOpenPanel(null)} />}</div>}</div>; })}</section>
    {openPanel === "add_weapon" && <MobileSheet title={editingWeapon ? "Edit gun" : "Add gun"} subtitle={editingWeapon ? weapons.find((weapon) => weapon.id === editingWeapon)?.display_name : undefined} onClose={() => { setOpenPanel(null); setEditingWeapon(null); setWeaponForm(emptyWeapon); }}><WeaponFormView form={weaponForm} editing={Boolean(editingWeapon)} busy={busy} modelOptions={modelOptions} onSubmit={saveWeapon} onChange={updateWeaponForm} onCancel={() => { setOpenPanel(null); setEditingWeapon(null); setWeaponForm(emptyWeapon); }} /></MobileSheet>}
    {openPanel === "add_ammo" && <MobileSheet title={editingAmmo ? "Edit ammunition" : "Add ammunition"} subtitle={editingAmmo ? ammo.find((profile) => profile.id === editingAmmo)?.manufacturer : undefined} onClose={() => { setOpenPanel(null); setEditingAmmo(null); setAmmoForm(emptyAmmo); }}><AmmoFormView form={ammoForm} editing={Boolean(editingAmmo)} busy={busy} onSubmit={saveAmmo} onChange={(update) => setAmmoForm({ ...ammoForm, ...update })} onCancel={() => { setOpenPanel(null); setEditingAmmo(null); setAmmoForm(emptyAmmo); }} /></MobileSheet>}

    {activeChokeWeapon && <MobileSheet title="Manage chokes" subtitle={activeChokeWeapon.display_name} onClose={() => { setOpenPanel(null); cancelChokeEdit(); }}><ChokeManager weaponId={activeChokeWeapon.id} chokes={chokesByWeapon[activeChokeWeapon.id] || []} form={chokeForm} editing={editingChokeWeaponId === activeChokeWeapon.id && Boolean(editingChokeId)} busy={busy} onSubmit={saveChoke} onChange={updateChokeForm} onEdit={editChoke} onDelete={deleteChoke} onCancel={cancelChokeEdit} /></MobileSheet>}

    {activeChokeSelector && <ChokeSelectionSheet title={`Select ${activeChokeSelector.label.toLowerCase()} choke`} chokes={chokesByWeapon[activeChokeSelector.weaponId] || []} selectedId={draftFor(activeChokeSelector.weaponId, activeChokeSelector.slot).choke_id} onSelect={(chokeId) => saveInstalledChoke(activeChokeSelector.weaponId, activeChokeSelector.slot, chokeId)} onClose={() => setActiveChokeSelector(null)} />}
  </main>;
}

function sortWeapons(values: Weapon[]) { return [...values].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base", numeric: true })); }
function sortAmmo(values: Ammo[]) { return [...values].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.manufacturer.localeCompare(b.manufacturer, undefined, { sensitivity: "base", numeric: true }) || (a.product_name || "").localeCompare(b.product_name || "", undefined, { sensitivity: "base", numeric: true })); }

function MobileSheet({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const latestOnCloseRef = useRef(onClose);

  useEffect(() => { latestOnCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    setMounted(true);
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    window.setTimeout(() => panelRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") latestOnCloseRef.current(); }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  function handleClose() { latestOnCloseRef.current(); }

  if (!mounted) return null;
  return createPortal(<div className="sheetBackdrop" role="presentation" onMouseDown={handleClose}><div className="mobileSheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef} onMouseDown={(event) => event.stopPropagation()}><div className="sheetHeader"><div><h3>{title}</h3>{subtitle && <p className="muted">{subtitle}</p>}</div><button type="button" className="secondary smallButton" onClick={handleClose}>Close</button></div><div className="sheetContent">{children}</div></div></div>, document.body);
}

function ResponsiveSelector({ label, value, options, onChange, placeholder }: { label: string; value: string; options: string[]; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const known = options.some((option) => option.toLowerCase() === value.trim().toLowerCase());
  const [customMode, setCustomMode] = useState(Boolean(value && !known));
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  const title = `Select ${label.toLowerCase()}`;
  useEffect(() => { if (value && !known) setCustomMode(true); }, [known, value]);
  return <div className="selectorField"><span>{label}</span><button type="button" className="selectorButton" onClick={() => { setQuery(""); setOpen(true); }}><span>{value || placeholder || `Select or enter ${label.toLowerCase()}`}</span><span aria-hidden="true">⌄</span></button>{(customMode || options.length === 0) && <input className="customSelectorInput" value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} autoComplete="off" enterKeyHint="done" />}{open && <MobileSheet title={title} onClose={() => setOpen(false)}><label className="sheetSearchLabel">Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" autoComplete="off" enterKeyHint="search" /></label><div className="sheetOptionList">{filtered.map((option) => <button type="button" className="sheetOption" key={option} onClick={() => { if (option === OTHER_CUSTOM) { setCustomMode(true); onChange(""); } else { setCustomMode(false); onChange(option); } setOpen(false); }}><strong>{option}</strong></button>)}{!options.includes(OTHER_CUSTOM) && <button type="button" className="sheetOption" onClick={() => { setCustomMode(true); onChange(value); setOpen(false); }}><strong>Other / Custom</strong></button>}</div></MobileSheet>}</div>;
}

function WeaponFormView({ form, editing, busy, modelOptions, onSubmit, onChange, onCancel }: { form: WeaponForm; editing: boolean; busy: boolean; modelOptions: string[]; onSubmit: (event: React.FormEvent) => void; onChange: (update: Partial<WeaponForm>) => void; onCancel: () => void }) {
  return <form id="equipment-editor" onSubmit={onSubmit} className="subcard compactForm"><h3>{editing ? "Edit gun" : "Add gun"}</h3><div className="row"><ResponsiveSelector label="Manufacturer" value={form.manufacturer} options={SHOTGUN_MANUFACTURERS} onChange={(value) => onChange({ manufacturer: canonicalValue(value, SHOTGUN_MANUFACTURERS), model: "" })} /><ResponsiveSelector label="Model" value={form.model} options={modelOptions} onChange={(value) => onChange({ model: canonicalValue(value, modelOptions) })} /></div><div className="row"><label>Gun type<select value={form.weapon_type} onChange={(event) => onChange({ weapon_type: event.target.value as WeaponType })}>{weaponTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label>Gauge<select value={form.gauge} onChange={(event) => onChange({ gauge: event.target.value })}>{GAUGE_OPTIONS.map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label></div>{form.gauge === OTHER_CUSTOM && <label>Custom gauge<input value={form.customGauge} onChange={(event) => onChange({ customGauge: event.target.value })} /></label>}<label>Custom display name<input value={form.display_name} onChange={(event) => onChange({ display_name: event.target.value, displayNameTouched: true })} placeholder="Blaser F3 81 cm" required /><span className="small muted">Use a friendly name for this gun or barrel setup. Brand, model and gauge stay saved separately.</span></label><label className="checkboxLabel"><input type="checkbox" checked={form.is_default} onChange={(event) => onChange({ is_default: event.target.checked })} /> Set as default</label><label>Choke setup<select value={form.choke_configuration_type} onChange={(event) => onChange({ choke_configuration_type: event.target.value as ChokeConfigurationType })}><option value="interchangeable">Interchangeable chokes</option><option value="fixed">Fixed chokes</option></select></label>{form.choke_configuration_type === "fixed" && <div className="subcard"><h3>Fixed choke designations</h3>{slotsFor(form.weapon_type).map(({ slot, label }) => { const draft = form.fixedSlots[slot] || { mode: "fixed" as SetupMode, choke_id: "", fixed_standard_designation: "full", fixed_custom_label: "", fixed_manufacturer_marking: "" }; return <div className="setupRow" key={slot}><strong>{label}</strong><select value={draft.fixed_standard_designation} onChange={(event) => onChange({ fixedSlots: { ...form.fixedSlots, [slot]: { ...draft, fixed_standard_designation: event.target.value } } })}>{STANDARD_CHOKE_DESIGNATIONS.map((designation) => <option key={designation.value} value={designation.value}>{chokeDesignationLabel(designation.value)}</option>)}</select>{draft.fixed_standard_designation === "other_custom" && <input value={draft.fixed_custom_label} onChange={(event) => onChange({ fixedSlots: { ...form.fixedSlots, [slot]: { ...draft, fixed_custom_label: event.target.value } } })} placeholder="Custom label" />}</div>; })}</div>}<details><summary>Advanced details</summary><label>Last serviced<input type="date" max={todayDateInputValue()} value={form.last_serviced_on} onChange={(event) => onChange({ last_serviced_on: event.target.value })} /><span className="small muted">Optional. Record the most recent completed service for this gun.</span></label><label>Estimated shots fired before app tracking<input type="number" min="0" step="1" value={form.initial_shot_count} onChange={(event) => onChange({ initial_shot_count: event.target.value })} /><span className="small muted">Optional. Future logged equipment use will be added to this starting number.</span></label></details><div className="btns"><button disabled={busy}>{editing ? "Save gun" : "Add gun"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></form>;
}

function SetupEditor({ weapon, chokes, slots, draftFor, openSelector }: { weapon: Weapon; chokes: Choke[]; slots: { slot: Slot; label: string }[]; draftFor: (weaponId: string, slot: Slot) => SlotDraft; openSelector: (slot: Slot, label: string) => void }) {
  return <div className="setupTable fastSetup">{slots.map(({ slot, label }) => { const draft = draftFor(weapon.id, slot); const choke = chokes.find((item) => item.id === draft.choke_id); return <button type="button" className="chokeSelectRow" key={slot} onClick={() => openSelector(slot, label)}><span className="muted">{label}</span><strong>{choke ? chokePrimaryLabel(choke) : "Not set"}</strong>{choke && chokeSecondaryLabel(choke) && <small>{chokeSecondaryLabel(choke)}</small>}</button>; })}</div>;
}

function FixedSummary({ weapon, assignments }: { weapon: Weapon; assignments: Assignment[] }) {
  return <div className="setupTable"><h3>Fixed choke setup</h3>{slotsFor(weapon.weapon_type).map(({ slot, label }) => <div className="setupRow" key={slot}><strong>{label}</strong><span>{fixedText(assignments.find((assignment) => assignment.weapon_id === weapon.id && assignment.slot === slot))}</span></div>)}<p className="small muted">Use Edit to change fixed choke designations.</p></div>;
}

function ChokeSelectionSheet({ title, chokes, selectedId, onSelect, onClose }: { title: string; chokes: Choke[]; selectedId: string; onSelect: (chokeId: string) => void; onClose: () => void }) {
  return <MobileSheet title={title} onClose={onClose}><div className="sheetOptionList"><button type="button" className="chokeOption" onClick={() => onSelect("")}><strong>Not set</strong></button>{sortChokesForSelection(chokes).map((choke) => <button type="button" className={`chokeOption ${selectedId === choke.id ? "selected" : ""}`} key={choke.id} onClick={() => onSelect(choke.id)}><strong>{chokePrimaryLabel(choke)}</strong>{chokeSecondaryLabel(choke) && <small>{chokeSecondaryLabel(choke)}</small>}</button>)}</div></MobileSheet>;
}

function ShotAdjuster({ kind, currentTotal, form, busy, onChange, onSave, onCancel }: { kind: "gun" | "ammo"; currentTotal: number; form: { total: string; note: string }; busy: boolean; onChange: (form: { total: string; note: string }) => void; onSave: () => void; onCancel: () => void }) {
  const title = kind === "gun" ? "Update total shots" : "Update cartridges used";
  const copy = kind === "gun" ? "Enter the estimated total number of cartridges fired with this gun. Future training and competition logs can update this automatically." : "Enter the estimated total number of cartridges used from this ammunition profile. Future logs can update this automatically.";
  return <div className="subcard compactForm"><h3>{title}</h3><p className="muted">{copy}</p><p className="muted">Current total: <strong>{new Intl.NumberFormat().format(currentTotal)}</strong></p><label>New total<input type="number" min="0" step="1" value={form.total} onChange={(event) => onChange({ ...form, total: event.target.value })} /></label><label>Optional note<textarea value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} /></label><div className="btns"><button type="button" onClick={onSave} disabled={busy}>Save</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></div>;
}
function ChokeManager({ weaponId, chokes, form, editing, busy, onSubmit, onChange, onEdit, onDelete, onCancel }: { weaponId: string; chokes: Choke[]; form: ChokeForm; editing: boolean; busy: boolean; onSubmit: (event: React.FormEvent, weaponId: string) => void; onChange: (update: Partial<ChokeForm>) => void; onEdit: (weaponId: string, choke: Choke) => void; onDelete: (id: string) => void; onCancel: () => void }) {
  const systemOptions = [...(CHOKE_SYSTEMS_BY_MANUFACTURER[form.manufacturer] || []), OTHER_CUSTOM];
  return <div className="subcard"><h3>Manage chokes</h3>{chokes.length === 0 && <p className="muted">No interchangeable chokes registered yet.</p>}{sortChokesForSelection(chokes).map((choke) => <div className="equipmentListItem compactItem" key={choke.id}><span><strong>{chokePrimaryLabel(choke)}</strong><br />{chokeSecondaryLabel(choke) && <small className="muted">{chokeSecondaryLabel(choke)}</small>}</span><span className="equipmentToolbar"><button type="button" className="secondary smallButton" onClick={() => onEdit(weaponId, choke)}>Edit</button><button type="button" className="danger smallButton" onClick={() => onDelete(choke.id)}>Remove</button></span></div>)}<form id="choke-editor" onSubmit={(event) => onSubmit(event, weaponId)} className="compactForm"><h3>{editing ? "Edit choke" : "Add choke"}</h3><label>Standard designation<select value={form.standard_designation} onChange={(event) => onChange({ standard_designation: event.target.value })}>{STANDARD_CHOKE_DESIGNATIONS.map((designation) => <option key={designation.value} value={designation.value}>{chokeDesignationLabel(designation.value)}</option>)}</select></label>{form.standard_designation === "other_custom" && <label>Custom designation<input value={form.custom_label} onChange={(event) => onChange({ custom_label: event.target.value })} /></label>}<div className="row"><ResponsiveSelector label="Manufacturer" value={form.manufacturer} options={CHOKE_MANUFACTURERS} onChange={(value) => onChange({ manufacturer: canonicalValue(value, CHOKE_MANUFACTURERS) })} /><ResponsiveSelector label="Model/series" value={form.model_or_series} options={[]} onChange={(value) => onChange({ model_or_series: value })} /></div><details><summary>Advanced details</summary><ResponsiveSelector label="Compatible choke system" value={form.compatible_choke_system} options={systemOptions} onChange={(value) => onChange({ compatible_choke_system: value })} /><label>Manufacturer marking<input value={form.manufacturer_marking} onChange={(event) => onChange({ manufacturer_marking: event.target.value })} /></label><div className="row"><label>Constriction mm<input type="number" step="0.001" min="0" value={form.constriction_mm} onChange={(event) => onChange({ constriction_mm: event.target.value })} /></label><label>Constriction inches<input type="number" step="0.0001" min="0" value={form.constriction_inches} onChange={(event) => onChange({ constriction_inches: event.target.value })} /></label></div></details><div className="btns"><button disabled={busy}>{editing ? "Save choke" : "Add choke"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></form></div>;
}

function AmmoFormView({ form, editing, busy, onSubmit, onChange, onCancel }: { form: AmmoForm; editing: boolean; busy: boolean; onSubmit: (event: React.FormEvent) => void; onChange: (update: Partial<AmmoForm>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="subcard compactForm"><h3>{editing ? "Edit ammunition" : "Add ammunition"}</h3><div className="row"><ResponsiveSelector label="Manufacturer" value={form.manufacturer} options={AMMUNITION_MANUFACTURERS} onChange={(value) => onChange({ manufacturer: canonicalValue(value, AMMUNITION_MANUFACTURERS) })} /><label>Product name<input value={form.product_name} onChange={(event) => onChange({ product_name: event.target.value })} /></label></div><div className="ammoCompactRow"><label>Gauge<select value={form.gauge} onChange={(event) => onChange({ gauge: event.target.value })}>{GAUGE_OPTIONS.map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label><label>Payload<input type="number" inputMode="decimal" min="1" step="0.1" value={form.payload_grams} onChange={(event) => onChange({ payload_grams: event.target.value })} required /><span className="small muted">g</span></label><label>Shot size<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9])?" value={form.shot_size} onChange={(event) => onChange({ shot_size: normalizeShotSizeInput(event.target.value) })} placeholder="7.5" /></label></div>{form.gauge === OTHER_CUSTOM && <label>Custom gauge<input value={form.customGauge} onChange={(event) => onChange({ customGauge: event.target.value })} /></label>}<label className="checkboxLabel"><input type="checkbox" checked={form.is_default} onChange={(event) => onChange({ is_default: event.target.checked })} /> Set as default</label><details><summary>Advanced details</summary><label>Estimated cartridges used before app tracking<input type="number" min="0" step="1" value={form.initial_shot_count} onChange={(event) => onChange({ initial_shot_count: event.target.value })} /><span className="small muted">Optional. Future logged equipment use will be added to this starting number.</span></label><label>Notes<textarea value={form.notes} onChange={(event) => onChange({ notes: event.target.value })} /></label></details><div className="btns"><button disabled={busy}>{editing ? "Save ammunition" : "Add ammunition"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div></form>;
}
