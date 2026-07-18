"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildDuplicateSuggestions, normalizeShootingGroundName, type DistinctGroundName, type UserShootingGround, type UserShootingGroundAlias } from "@/lib/shootingGrounds/aliases";
import { supabase } from "@/lib/supabase/client";

type GroundNameRpcRow = { source: string; alias_name: string | null; normalized_alias: string | null; record_count: number | string; latest_date: string | null; user_shooting_ground_id: string | null };

type MergeDraft = { displayName: string; selected: Set<string> };

function keyFor(item: DistinctGroundName) { return `${item.source}::${item.name}`; }
function sourceLabel(source: string) {
  if (source === "sessions") return "Competition sessions";
  if (source === "training_logs") return "Practice logs";
  if (source === "training_score_sheets") return "Training score sheets";
  return source;
}
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "No date"; }

function summarizeGroundRows(rows: DistinctGroundName[]) {
  const map = new Map<string, DistinctGroundName>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = map.get(key);
    if (!current) map.set(key, row);
    else {
      current.count += row.count;
      if ((row.latestDate || "") > (current.latestDate || "")) current.latestDate = row.latestDate;
      current.assignedGroundId ||= row.assignedGroundId;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function ShootingGroundSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groundNames, setGroundNames] = useState<DistinctGroundName[]>([]);
  const [grounds, setGrounds] = useState<UserShootingGround[]>([]);
  const [draft, setDraft] = useState<MergeDraft>({ displayName: "", selected: new Set() });

  async function load() {
    setLoading(true); setError(null);
    const [{ data: nameRows, error: namesError }, { data: groundRows, error: groundError }, { data: aliasRows, error: aliasError }] = await Promise.all([
      supabase.rpc("list_user_shooting_ground_names").returns<GroundNameRpcRow[]>(),
      supabase.from("user_shooting_grounds").select("id,display_name,normalized_display_name,country_code,municipality").order("display_name").returns<UserShootingGround[]>(),
      supabase.from("user_shooting_ground_aliases").select("id,user_shooting_ground_id,alias_name,normalized_alias,source").order("alias_name").returns<UserShootingGroundAlias[]>(),
    ]);
    const firstError = namesError || groundError || aliasError;
    if (firstError) setError(firstError.message);
    const listedNames = Array.isArray(nameRows) ? nameRows as GroundNameRpcRow[] : [];
    const rows: DistinctGroundName[] = listedNames.flatMap((row: GroundNameRpcRow) => {
      const name = row.alias_name?.trim();
      if (!name) return [];
      return [{ name, normalizedName: row.normalized_alias || normalizeShootingGroundName(name), source: row.source as DistinctGroundName["source"], count: Number(row.record_count) || 0, latestDate: row.latest_date, assignedGroundId: row.user_shooting_ground_id }];
    });
    const aliasesByGround = new Map<string, UserShootingGroundAlias[]>();
    for (const alias of aliasRows || []) aliasesByGround.set(alias.user_shooting_ground_id, [...(aliasesByGround.get(alias.user_shooting_ground_id) || []), alias]);
    setGroundNames(summarizeGroundRows(rows));
    setGrounds((groundRows || []).map((ground) => ({ ...ground, aliases: aliasesByGround.get(ground.id) || [] })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const unmergedGroundNames = useMemo(() => groundNames.filter((item) => !item.assignedGroundId), [groundNames]);
  const mergedSourceNames = useMemo(() => groundNames.filter((item) => item.assignedGroundId), [groundNames]);
  const suggestions = useMemo(() => buildDuplicateSuggestions(unmergedGroundNames), [unmergedGroundNames]);
  const selectedItems = unmergedGroundNames.filter((item) => draft.selected.has(keyFor(item)));
  const canMerge = draft.displayName.trim().length > 0 && selectedItems.length > 0 && !saving;

  function selectGroup(group: DistinctGroundName[]) {
    setDraft({ displayName: group[0]?.name || "", selected: new Set(group.map(keyFor)) });
    setMessage(null); setError(null);
  }
  function toggle(item: DistinctGroundName, checked: boolean) {
    setDraft((current) => { const selected = new Set(current.selected); checked ? selected.add(keyFor(item)) : selected.delete(keyFor(item)); return { ...current, displayName: current.displayName || item.name, selected }; });
  }
  async function mergeSelected() {
    if (!canMerge) { setError("Choose at least one name and a main name before merging."); return; }
    setSaving(true); setError(null); setMessage(null);
    const { data: groundId, error: groundError } = await supabase.rpc("create_user_shooting_ground", { p_display_name: draft.displayName.trim() }).returns<string>();
    if (groundError || !groundId) { setError(groundError?.message || "Could not create the shooting ground."); setSaving(false); return; }
    for (const item of selectedItems) {
      const { error: aliasError } = await supabase.rpc("attach_user_shooting_ground_alias", { p_ground_id: groundId, p_alias_name: item.name, p_source: item.source }).returns<string>();
      if (aliasError) { setError(`Could not attach alias "${item.name}": ${aliasError.message}`); setSaving(false); return; }
      const { error: assignError } = await supabase.rpc("assign_user_shooting_ground_alias", { p_ground_id: groundId, p_alias_name: item.name, p_source: item.source }).returns<number>();
      if (assignError) { setError(`Could not assign records for "${item.name}": ${assignError.message}`); setSaving(false); return; }
    }
    setMessage(`Merged ${selectedItems.length} name${selectedItems.length === 1 ? "" : "s"} into ${draft.displayName.trim()}. Original source names were preserved.`);
    setDraft({ displayName: "", selected: new Set() });
    setSaving(false); await load();
  }
  async function removeAlias(alias: UserShootingGroundAlias) {
    if (!confirm(`Remove alias "${alias.alias_name}"? Original records will keep their source names.`)) return;
    setSaving(true); setError(null); setMessage(null);
    const { error: removeError } = await supabase.rpc("remove_user_shooting_ground_alias", { p_alias_id: alias.id });
    if (removeError) { setError(`Could not remove alias "${alias.alias_name}": ${removeError.message}`); setSaving(false); return; }
    setMessage("Alias removed. Original records were not renamed or deleted."); setSaving(false); await load();
  }

  return <main className="settingsMain shootingGroundsPage">
    <Link href="/settings" className="button secondary smallButton">Back to settings</Link>
    <div className="settingsIntro"><p className="eyebrow">Personal data cleanup</p><h2>Clean up shooting grounds</h2><p className="muted">Merge different names that refer to the same shooting ground. Original names from imports are preserved.</p></div>
    {error && <p className="errorText">{error}</p>}{message && <p className="successText">{message}</p>}
    <section className="card"><h3>Merge shooting grounds</h3><label>Main name</label><input value={draft.displayName} onChange={(e) => setDraft((current) => ({ ...current, displayName: e.target.value }))} placeholder="Enter or choose the canonical display name" /> <button className="button" disabled={!canMerge} onClick={mergeSelected}>{saving ? "Saving..." : "Merge selected"}</button><p className="small muted">Selected names: {selectedItems.length || "none"}. Every merge is personal to your account.</p></section>
    <section className="card"><h3>Suggested duplicates</h3>{loading ? <p>Loading shooting ground names...</p> : suggestions.length === 0 ? <p className="muted">No duplicate suggestions found yet.</p> : suggestions.map((group, index) => <div className="groundGroup" key={index}><div><strong>{group[0].name}</strong><p className="small muted">{group.length} similar names · {group.reduce((sum, item) => sum + item.count, 0)} records</p></div><button className="button secondary" onClick={() => selectGroup(group)}>Use this as main name</button><details><summary>Show details</summary>{group.map((item) => <GroundCheckbox key={keyFor(item)} item={item} checked={draft.selected.has(keyFor(item))} onChange={toggle} />)}</details></div>)}</section>
    <section className="card"><h3>Unmerged shooting ground names</h3>{loading ? <p>Loading shooting ground names...</p> : unmergedGroundNames.length === 0 ? <p className="muted">No unmerged shooting ground names found in your sessions or training logs.</p> : unmergedGroundNames.map((item) => <GroundCheckbox key={keyFor(item)} item={item} checked={draft.selected.has(keyFor(item))} onChange={toggle} />)}{mergedSourceNames.length > 0 && <details className="mergedSourceNames"><summary>Show merged source names</summary><p className="small muted">These names are already attached to a merged shooting ground and are not selectable cleanup candidates.</p>{mergedSourceNames.map((item) => <GroundNameSummary key={keyFor(item)} item={item} />)}</details>}</section>
    <section className="card"><h3>Merged shooting grounds</h3>{grounds.length === 0 ? <p className="muted">No merged shooting grounds yet.</p> : grounds.map((ground) => <div className="groundGroup" key={ground.id}><strong>{ground.display_name}</strong><p className="small muted">Aliases</p>{ground.aliases?.length ? ground.aliases.map((alias) => <div className="aliasRow" key={alias.id}><span>{alias.alias_name} <small className="muted">· {sourceLabel(alias.source || "")}</small></span><button className="button secondary smallButton" disabled={saving} onClick={() => removeAlias(alias)}>Remove alias</button></div>) : <p className="muted">No aliases saved yet.</p>}</div>)}</section>
  </main>;
}

function GroundCheckbox({ item, checked, onChange }: { item: DistinctGroundName; checked: boolean; onChange: (item: DistinctGroundName, checked: boolean) => void }) {
  return <label className="groundNameOption"><input type="checkbox" checked={checked} onChange={(event) => onChange(item, event.target.checked)} /><GroundNameText item={item} /></label>;
}

function GroundNameSummary({ item }: { item: DistinctGroundName }) {
  return <div className="groundNameOption readOnly"><GroundNameText item={item} /></div>;
}

function GroundNameText({ item }: { item: DistinctGroundName }) {
  return <span><strong>{item.name}</strong><small>{item.count} record{item.count === 1 ? "" : "s"} · {sourceLabel(item.source)} · latest {formatDate(item.latestDate)}{item.assignedGroundId ? " · already merged" : ""}</small></span>;
}
