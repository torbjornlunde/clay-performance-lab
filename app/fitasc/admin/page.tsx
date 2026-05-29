"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getAllSchemeNumbers, getExpectedPresentationRows, pairPresentationForScheme, getPresentationLabel } from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

type Cell = { value: string; first: string | null; second: string | null; presentation: string };

function parseCell(raw: string, scheme: number, fallbackPresentation: string): Cell {
  const value = raw.trim().toUpperCase();
  if (!value || value === "UNKNOWN" || value === "BLANK") return { value: "Unknown", first: null, second: null, presentation: "unknown" };
  if (value.includes("+")) {
    const [first, second] = value.split("+").map((part) => part.trim()).filter(Boolean);
    return { value: first && second ? `${first}+${second}` : "Unknown", first: first || null, second: second || null, presentation: pairPresentationForScheme(scheme) };
  }
  return { value, first: value, second: null, presentation: fallbackPresentation === "single" ? "single" : "unknown" };
}

export default function FitascAdminPage() {
  const [scheme, setScheme] = useState(1);
  const [paste, setPaste] = useState("");
  const [source, setSource] = useState("");
  const [verified, setVerified] = useState(false);
  const [msg, setMsg] = useState("");
  const expectedRows = useMemo(() => getExpectedPresentationRows(scheme), [scheme]);
  const parsed = useMemo(() => paste.trim().split(/\n+/).filter(Boolean).map((line, rowIndex) => line.trim().split(/[\s,;]+/).map((cell) => parseCell(cell, scheme, expectedRows[rowIndex] || "unknown"))), [paste, scheme, expectedRows]);
  const rowError = parsed.some((row) => row.length !== 5);

  async function save() {
    setMsg("");
    if (rowError || parsed.length === 0) {
      setMsg("Each row must contain 5 values, one for each plate.");
      return;
    }
    const rows = parsed.flatMap((row, rowIndex) => row.map((cell, plateIndex) => ({
      scheme_number: scheme,
      plate_number: plateIndex + 1,
      event_number: rowIndex + 1,
      presentation: cell.presentation,
      first_machine: cell.first,
      second_machine: cell.second,
      is_verified: verified,
      source: source.trim() || null,
      updated_at: new Date().toISOString(),
    })));
    const { error } = await supabase.from("fitasc_compak_schemes").upsert(rows, { onConflict: "scheme_number,plate_number,event_number" });
    setMsg(error ? error.message : "Scheme saved.");
  }

  return (
    <main>
      <div className="card">
        <p className="eyebrow">Manual verified data entry</p>
        <h2>FITASC scheme admin</h2>
        <p>Paste one presentation row per line and five plate values per row.</p>
        <label>Scheme number</label>
        <select value={scheme} onChange={(e) => setScheme(Number(e.target.value))}>{getAllSchemeNumbers().map((n) => <option key={n}> {n}</option>)}</select>
        <label>Paste scheme grid</label>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"A B C D E\nE F A B C"} />
        <label>Source</label>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Official FITASC PDF, page..." />
        <label className="checkboxLabel"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> I have verified this against the official FITASC scheme</label>
        {rowError && <div className="error">Each row must contain 5 values, one for each plate.</div>}
        {parsed.length > 0 && <div className="schemeOverview">{parsed.map((row, rowIndex) => <div className="schemeRowCard" key={rowIndex}><strong>{getPresentationLabel(row[0]?.presentation || expectedRows[rowIndex])}</strong><div className="schemePlateGrid">{row.map((cell, index) => <span key={index}>Plate {index + 1} <b>{cell.value}</b></span>)}</div></div>)}</div>}
        {msg && <div className={msg === "Scheme saved." ? "success" : "error"}>{msg}</div>}
        <div className="btns"><button onClick={save}>Save scheme</button><Link className="button secondary" href="/fitasc">Viewer</Link></div>
      </div>
    </main>
  );
}
