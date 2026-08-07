"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  createEvidenceMutationGuard, createScorecardEvidenceSignedUrl,
  deleteScorecardEvidence, reassignScorecardEvidence, replaceScorecardEvidence,
  SCORECARD_EVIDENCE_TYPES, type ScorecardEvidence, uploadScorecardEvidence,
} from "@/lib/scorecardEvidence";

type DisplayEvidence = ScorecardEvidence & { signedUrl?: string };

export default function ScorecardEvidenceSection({ sessionId, userId, courseCount }: { sessionId: string; userId: string; courseCount: number }) {
  const [items, setItems] = useState<DisplayEvidence[]>([]);
  const [courseNumber, setCourseNumber] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState<{ item: DisplayEvidence; signedUrl: string } | null>(null);
  const replaceId = useRef<string | null>(null);
  const mutationGuard = useRef(createEvidenceMutationGuard());
  const thumbnailRefreshes = useRef(new Set<string>());

  async function signed(row: ScorecardEvidence) {
    try { return { ...row, signedUrl: await createScorecardEvidenceSignedUrl(supabase, row.storage_path) }; }
    catch { return row; }
  }

  async function load() {
    const result = await supabase.from("competition_scorecard_evidence").select("*").eq("session_id", sessionId).order("created_at");
    if (result.error) { setMessage(result.error.message); return; }
    setItems(await Promise.all(((result.data || []) as ScorecardEvidence[]).map(signed)));
  }
  useEffect(() => { void load(); }, [sessionId]);

  async function runMutation(operation: () => Promise<void>) {
    if (mutationGuard.current.active) return;
    setBusy(true);
    await mutationGuard.current.run(operation);
    setBusy(false);
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.target.value = "";
    if (!files.length || mutationGuard.current.active) return;
    void runMutation(async () => {
      setMessage("");
      try {
        for (const file of files) await uploadScorecardEvidence(supabase, { userId, sessionId, courseNumber, file });
        setMessage(`${files.length} photo${files.length === 1 ? "" : "s"} attached.`); await load();
      } catch (error) { setMessage((error as Error).message || "Photo upload failed."); }
    });
  }

  function reassign(item: DisplayEvidence, value: string) {
    if (mutationGuard.current.active) return;
    const next = value ? Number(value) : null;
    void runMutation(async () => {
      setMessage("");
      try {
        const updated = await reassignScorecardEvidence(supabase, item.id, next);
        setItems((old) => old.map((row) => row.id === item.id ? { ...row, ...updated } : row));
        setMessage("Photo assignment updated.");
      } catch (error) { setMessage((error as Error).message || "Photo assignment could not be updated."); }
    });
  }

  function replace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; const id = replaceId.current; event.target.value = "";
    if (!file || !id || mutationGuard.current.active) return;
    const original = items.find((item) => item.id === id); if (!original) return;
    void runMutation(async () => {
      setMessage("");
      try {
        const result = await replaceScorecardEvidence(supabase, original, file);
        setMessage(result.cleanupWarning || "Photo replaced."); await load();
      } catch (error) { setMessage(`${(error as Error).message || "Replacement failed."} The original photo is unchanged.`); }
      finally { replaceId.current = null; }
    });
  }

  function remove(item: DisplayEvidence) {
    if (mutationGuard.current.active || !window.confirm("Remove only this scorecard evidence photo? This cannot be undone.")) return;
    void runMutation(async () => {
      setMessage("");
      try {
        const result = await deleteScorecardEvidence(supabase, item);
        setItems((old) => old.filter((row) => row.id !== item.id));
        if (viewer?.item.id === item.id) setViewer(null);
        setMessage(result.cleanupWarning || "Photo removed.");
      } catch (error) { setMessage((error as Error).message || "Photo could not be removed."); }
    });
  }

  async function openViewer(item: DisplayEvidence) {
    setMessage("");
    try { setViewer({ item, signedUrl: await createScorecardEvidenceSignedUrl(supabase, item.storage_path) }); }
    catch (error) { setMessage((error as Error).message || "Private image could not be opened."); }
  }

  async function refreshThumbnailOnce(item: DisplayEvidence) {
    if (thumbnailRefreshes.current.has(item.id)) return;
    thumbnailRefreshes.current.add(item.id);
    try {
      const signedUrl = await createScorecardEvidenceSignedUrl(supabase, item.storage_path);
      setItems((old) => old.map((row) => row.id === item.id ? { ...row, signedUrl } : row));
    } catch { /* A single bounded refresh failed; leave the unavailable state. */ }
  }

  const courseOptions = Array.from({ length: Math.max(courseCount, 0) }, (_, index) => index + 1);
  return <section className="card scorecardEvidenceSection" aria-labelledby="scorecard-evidence-title">
    <div><p className="eyebrow">Private originals</p><h2 id="scorecard-evidence-title">Scorecard evidence</h2><p className="small muted">Keep photos with this Competition. Photos are not analysed and do not change scores.</p></div>
    <div className="scorecardEvidenceUpload">
      <label>Attach to<select value={courseNumber ?? ""} disabled={busy} onChange={(e) => setCourseNumber(e.target.value ? Number(e.target.value) : null)}><option value="">Whole session / unknown course</option>{courseOptions.map((n) => <option key={n} value={n}>Course {n}</option>)}</select></label>
      <label className={`button smallButton ${busy ? "disabled" : ""}`}>{busy ? "Working…" : "Add photos"}<input className="visuallyHidden" type="file" accept={SCORECARD_EVIDENCE_TYPES.join(",")} multiple disabled={busy} onChange={chooseFiles} /></label>
    </div>
    {message && <p className="small" role="status">{message}</p>}
    {items.length === 0 ? <p className="small muted">No scorecard evidence attached.</p> : <div className="scorecardEvidenceGrid">{items.map((item) => <article key={item.id} className="scorecardEvidenceItem">
      <button type="button" className="scorecardEvidenceThumb" disabled={busy} onClick={() => void openViewer(item)} aria-label={`Open ${item.course_number ? `Course ${item.course_number}` : "whole session"} scorecard photo`}>{item.signedUrl ? <img src={item.signedUrl} onError={() => void refreshThumbnailOnce(item)} alt="Private scorecard evidence" /> : <span>Image unavailable</span>}</button>
      <strong>{item.course_number ? `Course ${item.course_number}` : "Whole session / unknown course"}</strong>
      <select aria-label="Assign photo" value={item.course_number ?? ""} disabled={busy} onChange={(e) => reassign(item, e.target.value)}><option value="">Whole session / unknown course</option>{courseOptions.map((n) => <option key={n} value={n}>Course {n}</option>)}</select>
      <div className="scorecardEvidenceActions"><label className={`button secondary smallButton ${busy ? "disabled" : ""}`}>Replace<input className="visuallyHidden" type="file" accept={SCORECARD_EVIDENCE_TYPES.join(",")} disabled={busy} onClick={() => { replaceId.current = item.id; }} onChange={replace} /></label><button type="button" className="button danger smallButton" disabled={busy} onClick={() => remove(item)}>Remove</button></div>
    </article>)}</div>}
    {viewer && <div className="scorecardEvidenceViewer" role="dialog" aria-modal="true" aria-label="Scorecard evidence viewer"><button type="button" className="button scorecardEvidenceClose" onClick={() => setViewer(null)}>Close</button><img src={viewer.signedUrl} alt={viewer.item.course_number ? `Scorecard evidence for Course ${viewer.item.course_number}` : "Scorecard evidence for whole session or unknown course"} /></div>}
  </section>;
}
