"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { postTargetUnitLabel } from "@/lib/disciplines";
import { directions, distances, difficulties, Draft, emptyPosts, ensurePostCount, isDescribed, PostTargets, PresentationType, presentationLabels, rowsFromPosts, speeds, targetTypes, template } from "@/lib/targets/postTargets";

const MAX_POSTS = 50;
const draftKey = (sessionId: string) => `cpl:post-target-draft:v1:${sessionId}`;
const now = () => new Date().toISOString();

type Props = { session: any; courseRows: Array<{ course_number: number }> };

type Status = "Saved on device" | "Unsynced changes" | "Syncing" | "Synced" | "Sync failed" | "Offline — saved on device" | "Waiting for connection";

export function PostTargetEditor({ session, courseRows }: Props) {
  const unit = postTargetUnitLabel(session.discipline);
  const [postCount, setPostCountState] = useState(initialPostCount(session, courseRows));
  const [posts, setPosts] = useState<PostTargets[]>(() => emptyPosts(initialPostCount(session, courseRows)));
  const [current, setCurrent] = useState(1);
  const [status, setStatus] = useState<Status>(typeof navigator !== "undefined" && !navigator.onLine ? "Offline — saved on device" : "Saved on device");
  const [error, setError] = useState("");
  const [serverRows, setServerRows] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string | undefined>();
  const [recovery, setRecovery] = useState<{ draft: Draft; serverDraft: Draft } | null>(null);

  useEffect(() => {
    loadServerAndDraft();
    const updateOnline = () => setStatus((old) => navigator.onLine ? (old === "Offline — saved on device" || old === "Waiting for connection" ? "Unsynced changes" : old) : "Offline — saved on device");
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  function saveLocal(nextPosts: PostTargets[], nextCount = postCount, unsynced = true, syncedAt = lastSync) {
    const draft: Draft = { schemaVersion: 1, sessionId: session.id, postCount: nextCount, posts: nextPosts, lastLocalUpdateAt: now(), lastServerSyncAt: syncedAt, hasUnsyncedChanges: unsynced };
    localStorage.setItem(draftKey(session.id), JSON.stringify(draft));
    setStatus(navigator.onLine ? (unsynced ? "Unsynced changes" : "Synced") : "Offline — saved on device");
  }

  async function loadServerAndDraft() {
    const { data } = await supabase.from("session_post_targets").select("*").eq("session_id", session.id).order("post_number").order("target_position");
    const rows = data || [];
    setServerRows(rows);
    const serverDraft = draftFromRows(rows, session.id, initialPostCount(session, courseRows), false);
    const raw = localStorage.getItem(draftKey(session.id));
    const local = raw ? safeDraft(raw, session.id) : null;
    if (local?.hasUnsyncedChanges && new Date(local.lastLocalUpdateAt).getTime() > new Date(serverDraft.lastLocalUpdateAt).getTime()) { setRecovery({ draft: local, serverDraft }); return; }
    applyDraft(local && !local.hasUnsyncedChanges ? local : serverDraft, false);
  }

  function applyDraft(draft: Draft, unsynced: boolean) {
    setPostCountState(draft.postCount); setPosts(ensurePostCount(draft.posts, draft.postCount)); setCurrent(1); setLastSync(draft.lastServerSyncAt); saveLocal(ensurePostCount(draft.posts, draft.postCount), draft.postCount, unsynced, draft.lastServerSyncAt);
  }

  function mutate(nextPosts: PostTargets[], nextCount = postCount) { setPosts(nextPosts); setPostCountState(nextCount); saveLocal(nextPosts, nextCount, true); }

  function setPostCount(nextCount: number) {
    nextCount = Math.min(MAX_POSTS, Math.max(1, nextCount));
    if (nextCount < postCount) {
      const removed = posts.slice(nextCount);
      if (removed.some((post) => post.presentations.length > 0 || post.presentations.some((p) => p.targets.some(isDescribed)))) {
        if (!window.confirm(`${unit}s above ${nextCount} contain target definitions. They will be removed only when Save and sync succeeds. Continue?`)) return;
      }
    }
    mutate(ensurePostCount(posts, nextCount), nextCount); setCurrent((old) => Math.min(old, nextCount));
  }

  function replaceCurrent(nextPresentations: PostTargets["presentations"], action: string) {
    const post = posts[current - 1];
    const hasData = post.presentations.length > 0 && post.presentations.some((p) => p.targets.some(isDescribed));
    const sameBlank = JSON.stringify(post.presentations.map((p) => p.presentation_type)) === JSON.stringify(nextPresentations.map((p) => p.presentation_type)) && !hasData;
    if (post.presentations.length > 0 && !sameBlank && !window.confirm(`${action} will replace the existing presentation structure and target descriptions for this ${unit.toLowerCase()}. Continue?`)) return;
    mutate(posts.map((p, i) => i === current - 1 ? { post_number: current, presentations: nextPresentations } : p));
  }

  function addPresentation(type: PresentationType) { const post = posts[current - 1]; replacePost({ ...post, presentations: [...post.presentations, { presentation_number: post.presentations.length + 1, presentation_type: type, targets: [] }] }); }
  function removePresentation(index: number) { const p = posts[current - 1].presentations[index]; if (p.targets.some(isDescribed) && !window.confirm("This presentation contains target descriptions. Remove the full presentation and renumber later target positions?")) return; replacePost({ ...posts[current - 1], presentations: posts[current - 1].presentations.filter((_, i) => i !== index) }); }
  function changePresentation(index: number, type: PresentationType) { const p = posts[current - 1].presentations[index]; if (p.targets.some(isDescribed) && !window.confirm("Changing this structure may move descriptions to a different clay. Continue?")) return; replacePost({ ...posts[current - 1], presentations: posts[current - 1].presentations.map((x, i) => i === index ? { ...x, presentation_type: type } : x) }); }
  function replacePost(post: PostTargets) { mutate(posts.map((p, i) => i === current - 1 ? ensurePostCount([post], 1)[0] : p)); }
  function updateTarget(presentationIndex: number, targetIndex: number, field: string, value: string) { const post = posts[current - 1]; replacePost({ ...post, presentations: post.presentations.map((p, pi) => pi !== presentationIndex ? p : { ...p, targets: p.targets.map((t, ti) => ti === targetIndex ? { ...t, [field]: value } : t) }) }); }

  async function sync() {
    if (!navigator.onLine) { setStatus("Waiting for connection"); return; }
    const rows = rowsFromPosts(session.id, posts);
    if (rows.length === 0 && serverRows.length > 0 && !window.confirm("This will delete all server target definitions for this session. Continue?")) return;
    setStatus("Syncing"); setError("");
    const syncedAt = now();
    const { error: countError } = await supabase.from("sessions").update({ post_count: postCount }).eq("id", session.id);
    if (countError) return fail(countError.message);
    if (rows.length) { const { error: upsertError } = await supabase.from("session_post_targets").upsert(rows, { onConflict: "session_id,post_number,target_position" }); if (upsertError) return fail(upsertError.message); }
    const keep = new Set(rows.map((r) => `${r.post_number}:${r.target_position}`));
    const stale = serverRows.filter((r) => !keep.has(`${r.post_number}:${r.target_position}`) || r.post_number > postCount);
    for (const row of stale) { const { error: deleteError } = await supabase.from("session_post_targets").delete().eq("id", row.id); if (deleteError) return fail(deleteError.message); }
    setLastSync(syncedAt); saveLocal(posts, postCount, false, syncedAt); setStatus("Synced"); await loadServerAndDraft();
  }
  function fail(message: string) { setError(message); setStatus("Sync failed"); saveLocal(posts, postCount, true); }

  const post = posts[current - 1] || { post_number: current, presentations: [] };
  const currentTargets = post.presentations.flatMap((p) => p.targets);
  const describedCurrent = currentTargets.filter(isDescribed).length;
  const allTargets = posts.flatMap((p) => p.presentations.flatMap((x) => x.targets));
  const describedAll = allTargets.filter(isDescribed).length;

  return <div className="card postTargetEditor"><h2>Describe {unit.toLowerCase()}s and targets</h2><p className="small muted">{session.name}. Stable mapping: session → {unit.toLowerCase()} number → target position.</p>
    {recovery && <div className="subcard warning"><h3>Recover local draft?</h3><p className="small">A newer unsynced local draft ({new Date(recovery.draft.lastLocalUpdateAt).toLocaleString()}) exists. Server version: {new Date(recovery.serverDraft.lastLocalUpdateAt).toLocaleString()}.</p><div className="btns"><button onClick={() => { applyDraft(recovery.draft, true); setRecovery(null); }}>Restore local draft</button><button className="secondary" onClick={() => { applyDraft(recovery.serverDraft, false); setRecovery(null); }}>Use server version</button></div></div>}
    <div className="subcard"><div className="row"><div><label>Number of {unit.toLowerCase()}s</label><input type="number" min={1} max={MAX_POSTS} value={postCount} onChange={(e)=>setPostCount(Number(e.target.value)||1)} /></div><div><label>{unit}</label><select value={current} onChange={(e)=>setCurrent(Number(e.target.value))}>{Array.from({length:postCount},(_,i)=><option key={i+1} value={i+1}>{unit} {i+1}</option>)}</select></div></div><div className="btns"><button className="secondary" disabled={current<=1} onClick={()=>setCurrent(current-1)}>Previous</button><button className="secondary" disabled={current>=postCount} onClick={()=>setCurrent(current+1)}>Next</button></div><p className="small muted">{unit} {current}: {currentTargets.length} target positions, {describedCurrent} described. Overall: {describedAll} / {allTargets.length} described.</p><p className="small"><strong>{status}</strong>{lastSync ? ` · Last synced ${new Date(lastSync).toLocaleString()}` : ""}</p>{error && <div className="error">{error}</div>}<div className="btns"><button onClick={sync}>{status === "Sync failed" ? "Retry sync" : "Save and sync"}</button><Link href={`/sessions/${session.id}`} className="button secondary">Session</Link></div></div>
    <div className="subcard"><h3>Fast setup for {unit} {current}</h3><div className="btns"><button className="secondary" onClick={()=>replaceCurrent(template("report"), "5 report pairs")}>5 report pairs</button><button className="secondary" onClick={()=>replaceCurrent(template("simultaneous"), "5 simultaneous pairs")}>5 simultaneous pairs</button><button className="secondary" onClick={()=>replaceCurrent(template("singles"), "10 singles")}>10 singles</button><button className="secondary" onClick={()=>replaceCurrent([], "Clear post")}>Clear {unit.toLowerCase()}</button></div><div className="btns"><button onClick={()=>addPresentation("single")}>Add single</button><button onClick={()=>addPresentation("report_pair")}>Add report pair</button><button onClick={()=>addPresentation("simultaneous_pair")}>Add simultaneous pair</button><button onClick={()=>addPresentation("other_pair")}>Add other pair</button></div></div>
    {post.presentations.map((p, pi)=><div className="subcard presentationCard" key={pi}><div className="row"><div><h3>Presentation {p.presentation_number} · {presentationLabels[p.presentation_type]}</h3></div><div><label>Structure</label><select value={p.presentation_type} onChange={(e)=>changePresentation(pi, e.target.value as PresentationType)}>{Object.entries(presentationLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div></div><button className="secondary" onClick={()=>removePresentation(pi)}>Remove presentation</button>{p.targets.map((t, ti)=><div className="subcard targetCard" key={t.target_position}><h4>Target position {t.target_position}{p.targets.length>1 ? ` · Pair target ${t.position_in_presentation}` : ""}</h4><div className="row"><div><label>Target type</label><select value={t.target_type} onChange={(e)=>updateTarget(pi,ti,"target_type",e.target.value)}>{targetTypes.map((x)=><option key={x}>{x}</option>)}</select></div><div><label>Direction</label><select value={t.direction} onChange={(e)=>updateTarget(pi,ti,"direction",e.target.value)}>{directions.map((x)=><option key={x}>{x}</option>)}</select></div></div><details><summary>More target details</summary><label>Speed</label><select value={t.speed} onChange={(e)=>updateTarget(pi,ti,"speed",e.target.value)}>{speeds.map((x)=><option key={x}>{x}</option>)}</select><label>Distance</label><select value={t.distance} onChange={(e)=>updateTarget(pi,ti,"distance",e.target.value)}>{distances.map((x)=><option key={x}>{x}</option>)}</select><label>Difficulty</label><select value={t.difficulty} onChange={(e)=>updateTarget(pi,ti,"difficulty",e.target.value)}>{difficulties.map((x)=><option key={x}>{x}</option>)}</select><label>Notes</label><textarea value={t.notes} onChange={(e)=>updateTarget(pi,ti,"notes",e.target.value)} placeholder="Optional lead, hold point or visual note" /></details></div>)}</div>)}
  </div>;
}
function initialPostCount(session: any, courseRows: Array<{ course_number: number }>) { return Math.max(1, Math.min(MAX_POSTS, Number(session.post_count || session.course_count || courseRows.length || 1))); }
function safeDraft(raw: string, sessionId: string): Draft | null { try { const d = JSON.parse(raw); return d?.schemaVersion === 1 && d?.sessionId === sessionId ? d : null; } catch { return null; } }
function draftFromRows(rows: any[], sessionId: string, count: number, unsynced: boolean): Draft { const posts = emptyPosts(count); for (const row of rows) { const p = posts[row.post_number - 1] ||= { post_number: row.post_number, presentations: [] }; let pres = p.presentations.find((x) => x.presentation_number === row.presentation_number); if (!pres) { pres = { presentation_number: row.presentation_number, presentation_type: row.presentation_type, targets: [] }; p.presentations.push(pres); } pres.targets.push({ target_position: row.target_position, position_in_presentation: row.position_in_presentation, target_type: row.target_type || "Unknown", direction: row.direction || "Unknown", speed: row.speed || "Unknown", distance: row.distance || "Unknown", difficulty: row.difficulty || "Unknown", notes: row.notes || "" }); }
  const normalized = ensurePostCount(posts, Math.max(count, posts.length)); const newest = rows.map((r)=>r.updated_at || r.created_at).sort().at(-1) || now(); return { schemaVersion: 1, sessionId, postCount: normalized.length, posts: normalized, lastLocalUpdateAt: newest, lastServerSyncAt: newest, hasUnsyncedChanges: unsynced }; }
