"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type WeaponType = "over_under" | "side_by_side" | "semi_automatic" | "pump_action";
type ChokeKind = "fixed" | "interchangeable";
type Slot = "upper" | "lower" | "left" | "right" | "single";

type Weapon = { id:string; user_id:string; display_name:string; manufacturer:string|null; model:string|null; weapon_type:WeaponType; gauge:string|null; is_default:boolean; created_at:string; updated_at:string };
type Choke = { id:string; weapon_id:string; user_id:string; label:string; manufacturer:string|null; choke_system:string|null; constriction:string|null; choke_kind:ChokeKind; created_at:string; updated_at:string };
type Assignment = { id:string; weapon_id:string; user_id:string; slot:Slot; choke_id:string|null; fixed_choke_label:string|null; created_at:string; updated_at:string };
type Ammo = { id:string; user_id:string; manufacturer:string; product_name:string|null; gauge:string|null; payload_grams:number; shot_size:string|null; notes:string|null; is_default:boolean; created_at:string; updated_at:string };

type WeaponForm = { display_name:string; manufacturer:string; model:string; weapon_type:WeaponType; gauge:string; is_default:boolean };
type ChokeForm = { label:string; manufacturer:string; choke_system:string; constriction:string; choke_kind:ChokeKind };
type AmmoForm = { manufacturer:string; product_name:string; gauge:string; payload_grams:string; shot_size:string; notes:string; is_default:boolean };

const weaponTypes: { value: WeaponType; label: string }[] = [
  { value: "over_under", label: "Over/under" },
  { value: "side_by_side", label: "Side-by-side" },
  { value: "semi_automatic", label: "Semi-automatic" },
  { value: "pump_action", label: "Pump-action" },
];
const chokeKinds: { value: ChokeKind; label: string }[] = [{ value: "interchangeable", label: "Interchangeable" }, { value: "fixed", label: "Fixed" }];
const emptyWeapon: WeaponForm = { display_name:"", manufacturer:"", model:"", weapon_type:"over_under", gauge:"", is_default:false };
const emptyChoke: ChokeForm = { label:"", manufacturer:"", choke_system:"", constriction:"", choke_kind:"interchangeable" };
const emptyAmmo: AmmoForm = { manufacturer:"", product_name:"", gauge:"", payload_grams:"28", shot_size:"", notes:"", is_default:false };

function slotsFor(type: WeaponType): { slot: Slot; label: string }[] {
  if (type === "over_under") return [{ slot: "lower", label: "Lower barrel" }, { slot: "upper", label: "Upper barrel" }];
  if (type === "side_by_side") return [{ slot: "left", label: "Left barrel" }, { slot: "right", label: "Right barrel" }];
  return [{ slot: "single", label: "One choke" }];
}
function weaponTypeLabel(value: WeaponType) { return weaponTypes.find((item) => item.value === value)?.label || value; }
function compactSetup(weapon: Weapon, assignments: Assignment[], chokes: Choke[]) {
  const parts = slotsFor(weapon.weapon_type).map(({ slot, label }) => {
    const assignment = assignments.find((item) => item.weapon_id === weapon.id && item.slot === slot);
    const choke = chokes.find((item) => item.id === assignment?.choke_id);
    const text = choke?.label || assignment?.fixed_choke_label || "Not set";
    return `${label.replace(" barrel", "")}: ${text}`;
  });
  return parts.join(" · ");
}
function clean(value: string) { return value.trim() || null; }
function friendlyError(message: string) {
  if (message.includes("equipment_weapon_choke_same_weapon")) return "That choke does not belong to this weapon.";
  if (message.includes("duplicate") || message.includes("unique")) return "Only one default item is allowed. Refresh and try again.";
  return message || "Something went wrong. Please try again.";
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
  const [weaponForm, setWeaponForm] = useState<WeaponForm>(emptyWeapon);
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const [ammoForm, setAmmoForm] = useState<AmmoForm>(emptyAmmo);
  const [editingAmmo, setEditingAmmo] = useState<string | null>(null);
  const [chokeForms, setChokeForms] = useState<Record<string, ChokeForm>>({});
  const [editingChoke, setEditingChoke] = useState<Record<string, string | null>>({});
  const [fixedLabels, setFixedLabels] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push("/login"); return; }
    setUserId(auth.user.id);
    const [w, c, a, am] = await Promise.all([
      supabase.from("equipment_weapons").select("*").eq("user_id", auth.user.id).order("is_default", { ascending:false }).order("created_at"),
      supabase.from("equipment_weapon_chokes").select("*").eq("user_id", auth.user.id).order("created_at"),
      supabase.from("equipment_weapon_current_choke_assignments").select("*").eq("user_id", auth.user.id),
      supabase.from("equipment_ammunition_profiles").select("*").eq("user_id", auth.user.id).order("is_default", { ascending:false }).order("created_at"),
    ]);
    const err = w.error || c.error || a.error || am.error;
    if (err) setError(friendlyError(err.message));
    setWeapons((w.data || []) as Weapon[]); setChokes((c.data || []) as Choke[]); setAssignments((a.data || []) as Assignment[]); setAmmo((am.data || []) as Ammo[]);
    setLoading(false);
  }
  async function saveWeapon(e: React.FormEvent) {
    e.preventDefault(); if (!userId || busy) return; if (!weaponForm.display_name.trim()) { setError("Weapon display name is required."); return; }
    setBusy(true); setError(""); setSuccess("");
    const payload = { user_id:userId, display_name:weaponForm.display_name.trim(), manufacturer:clean(weaponForm.manufacturer), model:clean(weaponForm.model), weapon_type:weaponForm.weapon_type, gauge:clean(weaponForm.gauge), is_default:weaponForm.is_default };
    const res = editingWeapon ? await supabase.from("equipment_weapons").update(payload).eq("id", editingWeapon).eq("user_id", userId) : await supabase.from("equipment_weapons").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setWeaponForm(emptyWeapon); setEditingWeapon(null); setSuccess("Weapon saved."); await load();
  }
  async function deleteWeapon(id: string) { if (!confirm("Delete this weapon and its chokes?")) return; setBusy(true); const { error } = await supabase.from("equipment_weapons").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (error) setError(friendlyError(error.message)); else { setSuccess("Weapon deleted."); await load(); } }
  async function setDefaultWeapon(id: string) { setBusy(true); const { error } = await supabase.from("equipment_weapons").update({ is_default:true }).eq("id", id).eq("user_id", userId); setBusy(false); if (error) setError(friendlyError(error.message)); else load(); }
  function editWeapon(w: Weapon) { setEditingWeapon(w.id); setWeaponForm({ display_name:w.display_name, manufacturer:w.manufacturer || "", model:w.model || "", weapon_type:w.weapon_type, gauge:w.gauge || "", is_default:w.is_default }); }

  async function saveChoke(e: React.FormEvent, weaponId: string) {
    e.preventDefault(); const form = chokeForms[weaponId] || emptyChoke; if (!form.label.trim()) { setError("Choke label is required."); return; }
    const editId = editingChoke[weaponId]; setBusy(true); setError("");
    const payload = { user_id:userId, weapon_id:weaponId, label:form.label.trim(), manufacturer:clean(form.manufacturer), choke_system:clean(form.choke_system), constriction:clean(form.constriction), choke_kind:form.choke_kind };
    const res = editId ? await supabase.from("equipment_weapon_chokes").update(payload).eq("id", editId).eq("user_id", userId) : await supabase.from("equipment_weapon_chokes").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setChokeForms({ ...chokeForms, [weaponId]: emptyChoke }); setEditingChoke({ ...editingChoke, [weaponId]: null }); setSuccess("Choke saved."); await load();
  }
  async function deleteChoke(id: string) { if (!confirm("Remove this choke? Current setup slots using it will be cleared.")) return; setBusy(true); const { error } = await supabase.from("equipment_weapon_chokes").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (error) setError(friendlyError(error.message)); else load(); }
  async function assignChoke(weapon: Weapon, slot: Slot, chokeId: string, fixedLabel: string) {
    setBusy(true); setError("");
    const payload = { user_id:userId, weapon_id:weapon.id, slot, choke_id:chokeId || null, fixed_choke_label:chokeId ? null : clean(fixedLabel) };
    const { error } = await supabase.from("equipment_weapon_current_choke_assignments").upsert(payload, { onConflict:"weapon_id,slot" });
    setBusy(false); if (error) setError(friendlyError(error.message)); else load();
  }

  async function saveAmmo(e: React.FormEvent) {
    e.preventDefault(); const grams = Number(ammoForm.payload_grams); if (!ammoForm.manufacturer.trim()) { setError("Ammunition manufacturer is required."); return; } if (!Number.isFinite(grams) || grams <= 0) { setError("Payload weight must be greater than zero."); return; }
    setBusy(true); setError(""); setSuccess("");
    const payload = { user_id:userId, manufacturer:ammoForm.manufacturer.trim(), product_name:clean(ammoForm.product_name), gauge:clean(ammoForm.gauge), payload_grams:grams, shot_size:clean(ammoForm.shot_size), notes:clean(ammoForm.notes), is_default:ammoForm.is_default };
    const res = editingAmmo ? await supabase.from("equipment_ammunition_profiles").update(payload).eq("id", editingAmmo).eq("user_id", userId) : await supabase.from("equipment_ammunition_profiles").insert(payload);
    setBusy(false); if (res.error) { setError(friendlyError(res.error.message)); return; }
    setAmmoForm(emptyAmmo); setEditingAmmo(null); setSuccess("Ammunition saved."); await load();
  }
  async function deleteAmmo(id: string) { if (!confirm("Delete this ammunition profile?")) return; setBusy(true); const { error } = await supabase.from("equipment_ammunition_profiles").delete().eq("id", id).eq("user_id", userId); setBusy(false); if (error) setError(friendlyError(error.message)); else { setSuccess("Ammunition deleted."); await load(); } }
  async function setDefaultAmmo(id: string) { setBusy(true); const { error } = await supabase.from("equipment_ammunition_profiles").update({ is_default:true }).eq("id", id).eq("user_id", userId); setBusy(false); if (error) setError(friendlyError(error.message)); else load(); }

  const chokesByWeapon = useMemo(() => chokes.reduce<Record<string, Choke[]>>((groups, choke) => {
    groups[choke.weapon_id] = [...(groups[choke.weapon_id] || []), choke];
    return groups;
  }, {}), [chokes]);
  return <main>
    <div className="heroCard"><div><p className="eyebrow">Equipment</p><h2>Equipment profiles</h2><p>Manage optional weapons, chokes, current choke setup, and ammunition profiles.</p></div><Link className="button secondary" href="/profile">Profile</Link></div>
    {error && <div className="error">{error}</div>}{success && <div className="success">{success}</div>}{loading && <div className="notice">Loading equipment…</div>}

    <section className="card"><div className="sectionHeader"><div><p className="eyebrow">Weapons</p><h2>Weapons</h2></div></div>
      <form onSubmit={saveWeapon} className="subcard"><h3>{editingWeapon ? "Edit weapon" : "Add weapon"}</h3><label>Display name<input value={weaponForm.display_name} onChange={e=>setWeaponForm({...weaponForm,display_name:e.target.value})} required /></label><div className="row"><label>Manufacturer<input value={weaponForm.manufacturer} onChange={e=>setWeaponForm({...weaponForm,manufacturer:e.target.value})} /></label><label>Model<input value={weaponForm.model} onChange={e=>setWeaponForm({...weaponForm,model:e.target.value})} /></label></div><div className="row"><label>Weapon type<select value={weaponForm.weapon_type} onChange={e=>setWeaponForm({...weaponForm,weapon_type:e.target.value as WeaponType})}>{weaponTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label>Gauge<input value={weaponForm.gauge} onChange={e=>setWeaponForm({...weaponForm,gauge:e.target.value})} placeholder="12 gauge" /></label></div><label className="checkboxLabel"><input type="checkbox" checked={weaponForm.is_default} onChange={e=>setWeaponForm({...weaponForm,is_default:e.target.checked})}/> Set as default weapon</label><div className="btns"><button disabled={busy}>{editingWeapon ? "Save weapon" : "Add weapon"}</button>{editingWeapon && <button type="button" className="secondary" onClick={()=>{setEditingWeapon(null);setWeaponForm(emptyWeapon);}}>Cancel</button>}</div></form>
      {weapons.length === 0 && !loading && <div className="emptyState">No weapons yet.</div>}
      {weapons.map(w => <details className="subcard equipmentDetails" key={w.id}><summary><span><strong>{w.display_name}</strong> {w.is_default && <span className="badge badgeGold">Default</span>}<br/><small className="muted">{weaponTypeLabel(w.weapon_type)} · {compactSetup(w, assignments, chokes)}</small></span></summary><div className="equipmentCardBody"><p>{[w.manufacturer,w.model,w.gauge].filter(Boolean).join(" · ") || "No extra weapon details."}</p><div className="btns"><button type="button" className="secondary smallButton" onClick={()=>editWeapon(w)}>Edit</button>{!w.is_default && <button type="button" className="secondary smallButton" onClick={()=>setDefaultWeapon(w.id)}>Set default</button>}<button type="button" className="danger smallButton" onClick={()=>deleteWeapon(w.id)}>Delete</button></div><h3>Current choke setup</h3>{slotsFor(w.weapon_type).map(({slot,label}) => { const current = assignments.find(a=>a.weapon_id===w.id && a.slot===slot); const available = chokesByWeapon[w.id] || []; return <div className="row" key={slot}><label>{label}<select value={current?.choke_id || ""} onChange={e=>assignChoke(w, slot, e.target.value, fixedLabels[w.id]?.[slot] || current?.fixed_choke_label || "")}><option value="">Fixed or not set</option>{available.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Fixed choke label<input value={fixedLabels[w.id]?.[slot] ?? current?.fixed_choke_label ?? ""} onChange={e=>setFixedLabels({...fixedLabels,[w.id]:{...(fixedLabels[w.id]||{}),[slot]:e.target.value}})} onBlur={e=>assignChoke(w, slot, current?.choke_id || "", e.target.value)} placeholder="Fixed Full" /></label></div>; })}<h3>Available chokes</h3>{(chokesByWeapon[w.id] || []).map(c=><div className="equipmentListItem" key={c.id}><span><strong>{c.label}</strong><br/><small className="muted">{c.choke_kind === "fixed" ? "Fixed" : "Interchangeable"}{[c.manufacturer,c.choke_system,c.constriction].filter(Boolean).map(v=>` · ${v}`).join("")}</small></span><span className="btns"><button type="button" className="secondary smallButton" onClick={()=>{setEditingChoke({...editingChoke,[w.id]:c.id});setChokeForms({...chokeForms,[w.id]:{label:c.label,manufacturer:c.manufacturer||"",choke_system:c.choke_system||"",constriction:c.constriction||"",choke_kind:c.choke_kind}})}}>Edit</button><button type="button" className="danger smallButton" onClick={()=>deleteChoke(c.id)}>Remove</button></span></div>)}<form onSubmit={e=>saveChoke(e,w.id)} className="subcard"><h3>{editingChoke[w.id] ? "Edit choke" : "Add choke"}</h3>{(() => { const f = chokeForms[w.id] || emptyChoke; return <><label>Label<input value={f.label} onChange={e=>setChokeForms({...chokeForms,[w.id]:{...f,label:e.target.value}})} required placeholder="1/2" /></label><div className="row"><label>Manufacturer<input value={f.manufacturer} onChange={e=>setChokeForms({...chokeForms,[w.id]:{...f,manufacturer:e.target.value}})} /></label><label>System/model<input value={f.choke_system} onChange={e=>setChokeForms({...chokeForms,[w.id]:{...f,choke_system:e.target.value}})} /></label></div><div className="row"><label>Constriction<input value={f.constriction} onChange={e=>setChokeForms({...chokeForms,[w.id]:{...f,constriction:e.target.value}})} /></label><label>Type<select value={f.choke_kind} onChange={e=>setChokeForms({...chokeForms,[w.id]:{...f,choke_kind:e.target.value as ChokeKind}})}>{chokeKinds.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}</select></label></div><div className="btns"><button disabled={busy}>Save choke</button>{editingChoke[w.id] && <button type="button" className="secondary" onClick={()=>{setEditingChoke({...editingChoke,[w.id]:null});setChokeForms({...chokeForms,[w.id]:emptyChoke});}}>Cancel</button>}</div></>; })()}</form></div></details>)}
    </section>

    <section className="card"><p className="eyebrow">Ammunition</p><h2>Ammunition</h2><form onSubmit={saveAmmo} className="subcard"><h3>{editingAmmo ? "Edit ammunition" : "Add ammunition"}</h3><div className="row"><label>Manufacturer<input value={ammoForm.manufacturer} onChange={e=>setAmmoForm({...ammoForm,manufacturer:e.target.value})} required /></label><label>Product name<input value={ammoForm.product_name} onChange={e=>setAmmoForm({...ammoForm,product_name:e.target.value})} /></label></div><div className="row"><label>Gauge<input value={ammoForm.gauge} onChange={e=>setAmmoForm({...ammoForm,gauge:e.target.value})} /></label><label>Payload grams<input type="number" min="1" step="0.1" value={ammoForm.payload_grams} onChange={e=>setAmmoForm({...ammoForm,payload_grams:e.target.value})} required /></label></div><label>Shot size<input value={ammoForm.shot_size} onChange={e=>setAmmoForm({...ammoForm,shot_size:e.target.value})} /></label><label>Notes<textarea value={ammoForm.notes} onChange={e=>setAmmoForm({...ammoForm,notes:e.target.value})} /></label><label className="checkboxLabel"><input type="checkbox" checked={ammoForm.is_default} onChange={e=>setAmmoForm({...ammoForm,is_default:e.target.checked})}/> Set as default ammunition</label><div className="btns"><button disabled={busy}>{editingAmmo ? "Save ammunition" : "Add ammunition"}</button>{editingAmmo && <button type="button" className="secondary" onClick={()=>{setEditingAmmo(null);setAmmoForm(emptyAmmo);}}>Cancel</button>}</div></form>{ammo.length===0&&!loading&&<div className="emptyState">No ammunition profiles yet.</div>}{ammo.map(a=><div className="subcard equipmentListItem" key={a.id}><span><strong>{a.manufacturer}{a.product_name ? ` · ${a.product_name}` : ""}</strong> {a.is_default && <span className="badge badgeGold">Default</span>}<br/><small className="muted">{[a.gauge, `${a.payload_grams} g`, a.shot_size].filter(Boolean).join(" · ")}</small>{a.notes&&<p>{a.notes}</p>}</span><span className="btns"><button className="secondary smallButton" onClick={()=>{setEditingAmmo(a.id);setAmmoForm({manufacturer:a.manufacturer,product_name:a.product_name||"",gauge:a.gauge||"",payload_grams:String(a.payload_grams),shot_size:a.shot_size||"",notes:a.notes||"",is_default:a.is_default})}}>Edit</button>{!a.is_default&&<button className="secondary smallButton" onClick={()=>setDefaultAmmo(a.id)}>Set default</button>}<button className="danger smallButton" onClick={()=>deleteAmmo(a.id)}>Delete</button></span></div>)}</section>
  </main>;
}
