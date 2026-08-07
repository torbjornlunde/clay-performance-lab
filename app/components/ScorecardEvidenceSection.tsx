"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { deleteScorecardEvidence, replaceScorecardEvidence, SCORECARD_EVIDENCE_BUCKET, SCORECARD_EVIDENCE_TYPES, ScorecardEvidence, uploadScorecardEvidence, validateScorecardEvidenceFile } from "@/lib/scorecardEvidence";

type DisplayEvidence = ScorecardEvidence & { signedUrl?: string };

export default function ScorecardEvidenceSection({ sessionId, userId, courseCount }: { sessionId: string; userId: string; courseCount: number }) {
  const [items, setItems] = useState<DisplayEvidence[]>([]);
  const [courseNumber, setCourseNumber] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState<DisplayEvidence | null>(null);
  const replaceId = useRef<string | null>(null);

  async function load() {
    const result = await supabase.from("competition_scorecard_evidence").select("*").eq("session_id", sessionId).order("created_at");
    if (result.error) { setMessage(result.error.message); return; }
    const rows = (result.data || []) as ScorecardEvidence[];
    const signed = await Promise.all(rows.map(async (row) => {
      const url = await supabase.storage.from(SCORECARD_EVIDENCE_BUCKET).createSignedUrl(row.storage_path, 300);
      return { ...row, signedUrl: url.data?.signedUrl };
    }));
    setItems(signed);
  }

  useEffect(() => { void load(); }, [sessionId]);

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setMessage(""); setBusy("upload");
    try {
      for (const file of files) {
        const problem = validateScorecardEvidenceFile(file); if (problem) throw new Error(problem);
        await uploadScorecardEvidence(supabase, { userId, sessionId, courseNumber, file });
      }
      setMessage(`${files.length} photo${files.length === 1 ? "" : "s"} attached.`); await load();
    } catch (error) { setMessage((error as Error).message || "Photo upload failed."); }
    finally { setBusy(null); }
  }

  async function reassign(item: DisplayEvidence, value: string) {
    setBusy(item.id); setMessage("");
    const next = value ? Number(value) : null;
    const result = await supabase.from("competition_scorecard_evidence").update({ course_number: next }).eq("id", item.id);
    if (result.error) setMessage(result.error.message); else { setItems((old) => old.map((row) => row.id === item.id ? { ...row, course_number: next } : row)); setMessage("Photo assignment updated."); }
    setBusy(null);
  }

  async function replace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; const id = replaceId.current; event.target.value = "";
    if (!file || !id) return;
    const original = items.find((item) => item.id === id); if (!original) return;
    setBusy(id); setMessage("");
    try { await replaceScorecardEvidence(supabase, original, file); setMessage("Photo replaced."); await load(); }
    catch (error) { setMessage(`${(error as Error).message || "Replacement failed."} The original photo is unchanged.`); }
    finally { setBusy(null); replaceId.current = null; }
  }

  async function remove(item: DisplayEvidence) {
    if (!window.confirm("Remove only this scorecard evidence photo? This cannot be undone.")) return;
    setBusy(item.id); setMessage("");
    try { await deleteScorecardEvidence(supabase, item); setItems((old) => old.filter((row) => row.id !== item.id)); setMessage("Photo removed."); if (viewer?.id === item.id) setViewer(null); }
    catch (error) { setMessage((error as Error).message || "Photo could not be removed."); }
    finally { setBusy(null); }
  }

  const courseOptions = Array.from({ length: Math.max(courseCount, 0) }, (_, index) => index + 1);
  return <section className="card scorecardEvidenceSection" aria-labelledby="scorecard-evidence-title">
    <div><p className="eyebrow">Private originals</p><h2 id="scorecard-evidence-title">Scorecard evidence</h2><p className="small muted">Keep photos with this Competition. Photos are not analysed and do not change scores.</p></div>
    <div className="scorecardEvidenceUpload">
      <label>Attach to<select value={courseNumber ?? ""} onChange={(e) => setCourseNumber(e.target.value ? Number(e.target.value) : null)}><option value="">Whole session / unknown course</option>{courseOptions.map((n) => <option key={n} value={n}>Course {n}</option>)}</select></label>
      <label className={`button smallButton ${busy ? "disabled" : ""}`}> {busy === "upload" ? "Uploading…" : "Add photos"}<input className="visuallyHidden" type="file" accept={SCORECARD_EVIDENCE_TYPES.join(",")} multiple disabled={Boolean(busy)} onChange={chooseFiles} /></label>
    </div>
    {message && <p className="small" role="status">{message}</p>}
    {items.length === 0 ? <p className="small muted">No scorecard evidence attached.</p> : <div className="scorecardEvidenceGrid">{items.map((item) => <article key={item.id} className="scorecardEvidenceItem">
      <button type="button" className="scorecardEvidenceThumb" onClick={() => item.signedUrl && setViewer(item)} aria-label={`Open ${item.course_number ? `Course ${item.course_number}` : "whole session"} scorecard photo`}>{item.signedUrl ? <img src={item.signedUrl} alt="Private scorecard evidence" /> : <span>Image unavailable</span>}</button>
      <strong>{item.course_number ? `Course ${item.course_number}` : "Whole session / unknown course"}</strong>
      <select aria-label="Assign photo" value={item.course_number ?? ""} disabled={busy === item.id} onChange={(e) => void reassign(item, e.target.value)}><option value="">Whole session / unknown course</option>{courseOptions.map((n) => <option key={n} value={n}>Course {n}</option>)}</select>
      <div className="scorecardEvidenceActions"><label className="button secondary smallButton">Replace<input className="visuallyHidden" type="file" accept={SCORECARD_EVIDENCE_TYPES.join(",")} onClick={() => { replaceId.current = item.id; }} onChange={replace} /></label><button type="button" className="button danger smallButton" disabled={busy === item.id} onClick={() => void remove(item)}>Remove</button></div>
    </article>)}</div>}
    {viewer?.signedUrl && <div className="scorecardEvidenceViewer" role="dialog" aria-modal="true" aria-label="Scorecard evidence viewer"><button type="button" className="button scorecardEvidenceClose" onClick={() => setViewer(null)}>Close</button><img src={viewer.signedUrl} alt={viewer.course_number ? `Scorecard evidence for Course ${viewer.course_number}` : "Scorecard evidence for whole session or unknown course"} /></div>}
  </section>;
}
