"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppBackButton } from "@/app/components/navigation/AppBackButton";
import { applyUserCorrection, summarizeGrid, type NormalizedScorecardAnalysis, type ScorecardCell, type ScorecardOutcome } from "@/lib/scorecards/scorecardAnalysis";

async function fingerprint(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function ImportScorecardPage() {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [sessionType, setSessionType] = useState<"Training" | "Competition">("Training");
  const [discipline, setDiscipline] = useState("");
  const [totalTargets, setTotalTargets] = useState("");
  const [shootingGround, setShootingGround] = useState("");
  const [shooterName, setShooterName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<NormalizedScorecardAnalysis | null>(null);
  const [grid, setGrid] = useState<ScorecardCell[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canSaveTraining = sessionType === "Training" && Boolean(analysis) && grid.length > 0 && discipline.trim().length > 0 && date.trim().length > 0;
  const summary = useMemo(() => summarizeGrid(grid), [grid]);
  const postCount = grid.length ? Math.max(...grid.map((cell) => cell.postNumber)) : analysis?.postCount || 0;

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const selected = event.target.files?.[0] || null;
    if (selected) setFile(selected);
    event.target.value = "";
  }
  async function analyze() {
    if (!file) return;
    setStatus("Analyzing scorecard...");
    setError("");
    const { data: auth } = await supabase.auth.getSession();
    const form = new FormData();
    form.set("image", file);
    form.set("imageFingerprint", await fingerprint(file));
    form.set("totalTargets", totalTargets);
    const response = await fetch("/api/scorecard/analyze", { method: "POST", headers: auth.session?.access_token ? { Authorization: `Bearer ${auth.session.access_token}` } : {}, body: form });
    const json = await response.json();
    if (!response.ok) { setError(json.error?.message || "Analysis failed."); setStatus(""); return; }
    setAnalysis(json.result);
    setGrid(json.result.shooterRows?.[0]?.grid || []);
    setStatus("Review the detected scorecard before saving.");
  }
  function setCell(cell: ScorecardCell, result: ScorecardOutcome) { setGrid((current) => applyUserCorrection(current, cell.postNumber, cell.targetNumber, result)); }
  function editPostCount(value: number) {
    const count = Math.max(1, Math.min(100, Math.trunc(value || 1)));
    setGrid((current) => {
      const next = current.filter((cell) => cell.postNumber <= count);
      const maxPost = next.length ? Math.max(...next.map((cell) => cell.postNumber)) : 0;
      for (let post = maxPost + 1; post <= count; post++) next.push({ postNumber: post, targetNumber: 1, result: "unknown", cellState: "active_blank", rawMark: null, observedMarkCategory: "blank", confidence: "low", warning: "Added during review setup correction." });
      return next.sort((a, b) => a.postNumber - b.postNumber || a.targetNumber - b.targetNumber);
    });
  }
  function editTargets(postNumber: number, value: number) {
    const count = Math.max(1, Math.min(100, Math.trunc(value || 1)));
    setGrid((current) => {
      if (current.some((cell) => cell.postNumber === postNumber && cell.targetNumber > count && (cell.result === "hit" || cell.result === "miss")) && !confirm(`Changing Post ${postNumber} to ${count} targets will remove interpreted cells beyond that target count. Continue?`)) return current;
      const kept = current.filter((cell) => cell.postNumber === postNumber && cell.targetNumber <= count);
      const present = new Set(kept.map((cell) => cell.targetNumber));
      const additions = Array.from({ length: count }, (_, index) => index + 1).filter((target) => !present.has(target)).map((targetNumber) => ({ postNumber, targetNumber, result: "unknown" as ScorecardOutcome, cellState: "active_blank" as const, rawMark: null, observedMarkCategory: "blank" as const, confidence: "low" as const, warning: "Added during review setup correction." }));
      return [...current.filter((cell) => cell.postNumber !== postNumber), ...kept, ...additions].sort((a, b) => a.postNumber - b.postNumber || a.targetNumber - b.targetNumber);
    });
  }
  async function saveTraining() {
    if (!analysis) return;
    if (!discipline.trim()) { setError("Select a discipline before creating the Training Score Sheet."); return; }
    if (!date.trim()) { setError("Choose a date before creating the Training Score Sheet."); return; }
    setStatus("Saving Training Score Sheet...");
    const { data: auth } = await supabase.auth.getSession();
    const response = await fetch("/api/scorecard/training/apply", { method: "POST", headers: { "Content-Type": "application/json", ...(auth.session?.access_token ? { Authorization: `Bearer ${auth.session.access_token}` } : {}) }, body: JSON.stringify({ sessionType, discipline, totalTargets, shootingGround, shooterName, date, analysis, grid, selectedShooterCandidateId: analysis.shooterRows[0]?.candidateId }) });
    const json = await response.json();
    if (!response.ok) { setError(json.error?.message || "Save failed."); setStatus(""); return; }
    router.push(`/training-score-sheets/${json.scoreSheetId}`);
  }

  return <main>
    <div className="card">
      <AppBackButton fallback="/results" />
      <p className="eyebrow">Import scorecard</p>
      <h2>Import scorecard photo</h2>
      <p className="muted">Start with minimal Training metadata, upload a paper scorecard, review the detected structure and targets, then confirm before saving.</p>
      <label>Session type<select value={sessionType} onChange={(event) => setSessionType(event.target.value as "Training" | "Competition")}><option>Training</option><option>Competition</option></select></label>
      <label>Discipline<input value={discipline} onChange={(event) => setDiscipline(event.target.value)} placeholder="Required before saving" /></label>
      <label>Expected total targets<input type="number" min={1} value={totalTargets} onChange={(event) => setTotalTargets(event.target.value)} placeholder="Optional" /></label>
      <label>Shooting ground<input value={shootingGround} onChange={(event) => setShootingGround(event.target.value)} placeholder="Optional" /></label>
      <label>Shooter name<input value={shooterName} onChange={(event) => setShooterName(event.target.value)} placeholder="Optional" /></label>
      <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="btns"><button className="button" type="button" onClick={() => camera.current?.click()}>Take photo</button><button className="button secondary" type="button" onClick={() => library.current?.click()}>Choose from library</button></div>
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={choose} /><input ref={library} hidden type="file" accept="image/*" onChange={choose} />
      {file && <p className="small muted">Selected: {file.name}</p>}
      <button className="button" type="button" disabled={!file || status.startsWith("Analyzing")} onClick={analyze}>Analyze</button>
      {status && <p className="notice small">{status}</p>}{error && <div className="error">{error}</div>}
    </div>
    {grid.length > 0 && <div className="card">
      <h3>Detected scorecard</h3><p className="small muted">{postCount} posts · {summary.totalTargets} targets. Review setup and scores before saving.</p>
      <label className="small">Posts<input type="number" min={1} max={100} value={postCount} onChange={(event) => editPostCount(Number(event.target.value))} /></label>
      <div className="compactSummary">{Array.from({ length: postCount }, (_, index) => { const post = index + 1; const count = grid.filter((cell) => cell.postNumber === post).length || 1; return <label className="small" key={post}>P{post}<input type="number" min={1} max={100} value={count} onChange={(event) => editTargets(post, Number(event.target.value))} /></label>; })}</div>
      {Array.from({ length: postCount }, (_, index) => { const post = index + 1; const cells = grid.filter((cell) => cell.postNumber === post); const ps = summarizeGrid(cells); return <div className="subcard" key={post}><h4>Post {post} · {ps.score}/{cells.length}</h4><div className="scorecardGrid">{cells.map((cell) => <div key={`${cell.postNumber}:${cell.targetNumber}`} className={`scorecardCell ${cell.result}`}><strong>Target {cell.targetNumber}</strong><span>{cell.result === "unknown" ? "Unknown" : cell.result === "hit" ? "Hit" : "Miss"}</span><div className="scorecardCellChoices" aria-label={`Set target ${cell.targetNumber}`}>{(["hit", "miss", "unknown"] as ScorecardOutcome[]).map((choice) => <button type="button" key={choice} className={`scorecardCellChoice ${cell.result === choice ? "selected" : ""}`} aria-pressed={cell.result === choice} onClick={() => setCell(cell, choice)}>{choice === "unknown" ? "?" : choice === "hit" ? "Hit" : "Miss"}</button>)}</div></div>)}</div></div>; })}
      {sessionType === "Training" ? <><button className="button" type="button" disabled={!canSaveTraining} onClick={saveTraining}>Confirm and create Training Score Sheet</button>{!discipline.trim() && <p className="error small">Select a discipline before creating the Training Score Sheet.</p>}{!date.trim() && <p className="error small">Choose a date before creating the Training Score Sheet.</p>}</> : <p className="warning small">Competition imports should use an existing competition session so the reviewed scorecard can be applied to that session.</p>}
    </div>}
  </main>;
}
