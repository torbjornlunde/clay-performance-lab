"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import type { ClayArenaCandidate } from "@/lib/clayarena/types";

const statusLabel = { matched_to_you: "Matched to you", possible_match: "Possible match — review", no_match: "No matching shooter found" } as const;

export default function ClayArenaImportPage() {
  const [url, setUrl] = useState("");
  const [candidates, setCandidates] = useState<ClayArenaCandidate[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const candidate = candidates[selected];
  const [savedSessionId, setSavedSessionId] = useState("");

  useEffect(() => {
    const sharedUrl = new URLSearchParams(window.location.search).get("url");
    if (sharedUrl) setUrl(sharedUrl);
  }, []);

  async function authorization(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function findResult(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null); setCandidates([]); setSavedSessionId("");
    try {
      const response = await fetch("/api/clayarena/parse", { method: "POST", headers: { "Content-Type": "application/json", ...(await authorization()) }, body: JSON.stringify({ url }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setMessage({ kind: "error", text: data?.error || "Could not import this result." });
      setCandidates(data?.candidates || []); setSelected(0);
      if (!data?.candidates?.length) setMessage({ kind: "error", text: "No shooter rows were found on this public results page." });
      else if (data.matchState === "no_match") setMessage({ kind: "error", text: "We could not match your profile name. Choose and carefully review your shooter row." });
    } catch {
      setMessage({ kind: "error", text: "Could not reach ClayArena. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  function update(patch: Partial<ClayArenaCandidate>) { setCandidates((items) => items.map((item, index) => index === selected ? { ...item, ...patch } : item)); }

  async function save() {
    if (!candidate) return; setBusy(true); setMessage(null); setSavedSessionId("");
    try {
      const response = await fetch("/api/clayarena/save", { method: "POST", headers: { "Content-Type": "application/json", ...(await authorization()) }, body: JSON.stringify({ candidate }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.id) setSavedSessionId(data.id);
        return setMessage({ kind: "error", text: data?.error || "Could not save this result." });
      }
      setSavedSessionId(data.id);
      setMessage({ kind: "success", text: "ClayArena result imported." });
    } catch {
      setMessage({ kind: "error", text: "Could not save this result. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <form className="card" onSubmit={findResult}>
      <p className="eyebrow">Result import</p><h2>Import from ClayArena</h2>
      <p>Paste a public competition results link, then review your result before saving.</p>
      <label htmlFor="clayarena-url">ClayArena results URL</label>
      <input id="clayarena-url" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://clayarena.com/en/competitions/.../results/" required />
      <div className="btns"><button disabled={busy}>{busy ? "Finding result..." : "Find my result"}</button><Link className="button secondary" href="/import/result">Use another result service</Link></div>
      {message ? <div className={message.kind}>{message.text}</div> : null}
      {savedSessionId ? <Link className="button" href={`/sessions/${savedSessionId}?context=1#competition-context`}>Open result</Link> : null}
    </form>
    {candidate ? <section className="card">
      <p className="eyebrow">Review before save</p><h2>{candidate.competition}</h2>
      <div className="notice small"><strong>{statusLabel[candidate.matchStatus]}</strong>{candidate.matchStatus === "possible_match" ? " — confirm that this is your row before saving." : ""}</div>
      {candidates.length > 1 ? <><label htmlFor="match-row">Shooter row</label><select id="match-row" value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setSavedSessionId(""); setMessage(null); }}>{candidates.map((item, index) => <option key={item.resultIdentity} value={index}>{item.shooterName} · {item.ownScore}</option>)}</select></> : null}
      <label htmlFor="competition">Competition</label><input id="competition" value={candidate.competition} onChange={(event) => update({ competition: event.target.value })} />
      <label htmlFor="date">Date</label><input id="date" type="date" value={candidate.date || ""} onChange={(event) => update({ date: event.target.value || null })} />
      <label htmlFor="discipline">Discipline</label><select id="discipline" value={candidate.discipline} onChange={(event) => update({ discipline: event.target.value })}>{DISCIPLINE_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
      <label htmlFor="venue">Venue</label><input id="venue" value={candidate.venue || ""} onChange={(event) => update({ venue: event.target.value || null })} placeholder="Not provided" />
      <div className="compactSummaryGrid"><span><strong>Shooter</strong> {candidate.shooterName}</span><span><strong>Category</strong> {candidate.category || "Not provided"}</span><span><strong>Placement</strong> {candidate.placement ?? "Not provided"}</span><span><strong>Source</strong> ClayArena</span></div>
      <label htmlFor="score">Base score</label><input id="score" type="number" min="0" value={candidate.ownScore} onChange={(event) => update({ ownScore: Number(event.target.value) })} />
      <label htmlFor="targets">Total targets</label><input id="targets" type="number" min="1" value={candidate.totalTargets ?? ""} onChange={(event) => update({ totalTargets: event.target.value ? Number(event.target.value) : null })} placeholder="Required" />
      <label htmlFor="rounds">Round scores</label><input id="rounds" value={candidate.seriesScores.join(", ")} onChange={(event) => update({ seriesScores: event.target.value.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0) })} placeholder="For example: 23, 24, 22, 23" />
      <label htmlFor="placement">Placement</label><input id="placement" type="number" min="1" value={candidate.placement ?? ""} onChange={(event) => update({ placement: event.target.value ? Number(event.target.value) : null })} placeholder="Not provided" />
      <p className="small muted">{candidate.winningScore !== null ? `Winning score: ${candidate.winningScore}` : "Winning score not provided"}</p>
      {candidate.warnings.map((warning) => <div className="notice small" key={warning}>{warning}</div>)}
      <div className="btns"><button type="button" onClick={save} disabled={busy || !candidate.date || !candidate.totalTargets}>{busy ? "Saving..." : "Import this result"}</button><Link className="button secondary" href={candidate.sourceUrl} target="_blank">Open source</Link></div>
    </section> : null}
  </main>;
}
