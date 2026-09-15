"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ReflectionEvidenceItem, ReflectionEvidenceStatus } from "@/lib/ai/reflectionEvidence";

type Row = ReflectionEvidenceItem & { id: string; source_note_updated_at: string; review_status: ReflectionEvidenceStatus };
export function ReflectionEvidenceReview({ sessionId, note }: { sessionId: string; note: { id: string; body: string; updated_at: string } | null }) {
  const [items, setItems] = useState<Row[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function load() { const { data } = await supabase.from("private_reflection_evidence").select("id,category,normalized_value,label,evidence_basis,confidence,reference,review_status,source_note_updated_at").eq("session_id", sessionId).order("created_at", { ascending: false }); setItems((data || []) as Row[]); }
  useEffect(() => { void load(); }, [sessionId]);
  async function interpret() {
    if (!note?.body.trim()) { setMessage("Save a non-empty reflection first."); return; }
    setBusy(true); setMessage("");
    try { const auth = await supabase.auth.getSession(); const token = auth.data.session?.access_token; if (!token) throw new Error("You must be signed in."); const response = await fetch("/api/reflections/interpret", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ noteId: note.id }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "Interpretation failed."); await load(); setMessage(json.items?.length ? "Suggestions are ready for your review." : "No supported evidence was found."); } catch (error: any) { setMessage(error?.message || "Interpretation failed. Your reflection remains saved."); } finally { setBusy(false); }
  }
  function edit(id: string, field: "label" | "normalized_value" | "reference", value: string) { setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item)); }
  async function review(item: Row, review_status: ReflectionEvidenceStatus) { setBusy(true); const { error } = await supabase.from("private_reflection_evidence").update({ label: item.label.trim(), normalized_value: item.normalized_value.trim(), reference: item.reference?.trim() || null, review_status }).eq("id", item.id); setMessage(error ? "That review choice could not be saved." : review_status === "accepted" ? "Evidence accepted." : "Suggestion rejected."); if (!error) await load(); setBusy(false); }
  const visible = items.filter((item) => item.review_status !== "rejected");
  return <div className="reflectionEvidenceReview" aria-labelledby="reflection-evidence-heading">
    <div className="reflectionEvidenceHeader"><div><h3 id="reflection-evidence-heading">Review coaching evidence</h3><p className="small muted">AI can suggest structure only. Nothing is used until you accept it.</p></div><button type="button" className="button secondary smallButton" disabled={busy || !note?.body.trim()} onClick={() => void interpret()}>{busy ? "Working..." : "Interpret reflection"}</button></div>
    {message && <p className="small" role="status">{message}</p>}
    {visible.map((item) => { const stale = !note || item.source_note_updated_at !== note.updated_at; return <article className="reflectionEvidenceItem" key={item.id}>
      <div className="reflectionEvidenceMeta"><strong>{item.evidence_basis === "self_report" ? "Your self-report" : "AI hypothesis"}</strong><span>{item.confidence} confidence</span>{stale && <span className="warningInline">Older reflection</span>}</div>
      <label>Summary<input maxLength={160} value={item.label} disabled={item.review_status === "accepted"} onChange={(e) => edit(item.id, "label", e.target.value)} /></label>
      <div className="reflectionEvidenceFields"><label>Value<input maxLength={80} value={item.normalized_value} disabled={item.review_status === "accepted"} onChange={(e) => edit(item.id, "normalized_value", e.target.value)} /></label><label>Post/course reference<input maxLength={60} value={item.reference || ""} disabled={item.review_status === "accepted"} onChange={(e) => edit(item.id, "reference", e.target.value)} /></label></div>
      {item.review_status === "accepted" ? <p className="successInline">Accepted evidence · {item.evidence_basis === "ai_inference" ? "remains an AI hypothesis" : "confirmed self-report"}</p> : <div className="btns compactActions"><button type="button" disabled={busy || stale || !item.label.trim() || !item.normalized_value.trim()} onClick={() => void review(item, "accepted")}>Accept</button><button type="button" className="button secondary" disabled={busy} onClick={() => void review(item, "rejected")}>Reject</button></div>}
    </article>; })}
  </div>;
}
