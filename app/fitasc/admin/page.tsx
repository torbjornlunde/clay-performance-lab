"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  emptySchemeCell,
  FitascPresentation,
  FitascSchemeCell,
  getSchemeOptions,
  MACHINE_OPTIONS,
  PRESENTATION_OPTIONS,
} from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

function cellKey(plateNumber: number, eventNumber: number) {
  return `${plateNumber}-${eventNumber}`;
}

function buildBlankGrid(schemeNumber: number) {
  const map = new Map<string, FitascSchemeCell>();
  for (const plate of [1, 2, 3, 4, 5]) {
    for (const event of [1, 2, 3, 4, 5]) {
      map.set(cellKey(plate, event), emptySchemeCell(schemeNumber, plate, event));
    }
  }
  return map;
}

export default function FitascAdminPage() {
  const [schemeNumber, setSchemeNumber] = useState(1);
  const [cells, setCells] = useState<Map<string, FitascSchemeCell>>(() => buildBlankGrid(1));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const visibleCells = useMemo(() => Array.from(cells.values()).sort((a, b) => a.plate_number - b.plate_number || a.event_number - b.event_number), [cells]);

  useEffect(() => {
    loadScheme(schemeNumber);
  }, [schemeNumber]);

  async function loadScheme(nextScheme: number) {
    setLoading(true);
    setMessage("");
    const grid = buildBlankGrid(nextScheme);
    const { data, error } = await supabase
      .from("fitasc_compak_schemes")
      .select("id,scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified,source")
      .eq("scheme_number", nextScheme)
      .returns<FitascSchemeCell[]>();
    setLoading(false);

    if (error) {
      setCells(grid);
      setMessage(error.message);
      return;
    }

    (data || []).forEach((cell) => grid.set(cellKey(cell.plate_number, cell.event_number), cell));
    setCells(grid);
  }

  function updateCell(plateNumber: number, eventNumber: number, update: Partial<FitascSchemeCell>) {
    setCells((current) => {
      const next = new Map(current);
      const key = cellKey(plateNumber, eventNumber);
      next.set(key, { ...(next.get(key) || emptySchemeCell(schemeNumber, plateNumber, eventNumber)), ...update });
      return next;
    });
  }

  async function saveCells() {
    setSaving(true);
    setMessage("");
    const payload = visibleCells.map((cell) => ({
      scheme_number: schemeNumber,
      plate_number: cell.plate_number,
      event_number: cell.event_number,
      presentation: cell.presentation || "unknown",
      first_machine: cell.first_machine === "" ? null : cell.first_machine,
      second_machine: cell.second_machine === "" ? null : cell.second_machine,
      is_verified: cell.is_verified,
      source: cell.source?.trim() || null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("fitasc_compak_schemes").upsert(payload, {
      onConflict: "scheme_number,plate_number,event_number",
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Scheme cells saved.");
    await loadScheme(schemeNumber);
  }

  return (
    <main>
      <div className="card">
        <p className="eyebrow">FITASC Compak registry</p>
        <h2>Admin/import page</h2>
        <div className="notice">Admin/test page. Only enter verified scheme data.</div>
        <p className="small muted">This page upserts all 25 cells for the selected scheme into public.fitasc_compak_schemes.</p>
        <label>Scheme number</label>
        <select value={schemeNumber} onChange={(event) => setSchemeNumber(Number(event.target.value))}>
          {getSchemeOptions().map((option) => (
            <option key={option.scheme} value={option.scheme}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="btns">
          <button onClick={saveCells} disabled={saving || loading}>
            {saving ? "Saving..." : "Save visible scheme"}
          </button>
          <Link className="button secondary" href="/fitasc">
            Viewer
          </Link>
        </div>
        {message && <div className={message.endsWith("saved.") ? "success" : "error"}>{message}</div>}
      </div>

      <div className="card">
        <h2>Scheme {schemeNumber} cells</h2>
        {loading ? <div className="notice">Loading scheme...</div> : null}
        <div className="adminGrid">
          {visibleCells.map((cell) => (
            <div className="subcard" key={cellKey(cell.plate_number, cell.event_number)}>
              <div className="sectionHeader">
                <strong>Plate {cell.plate_number}</strong>
                <span className="pill">Event {cell.event_number}</span>
              </div>
              <label>Presentation</label>
              <select
                value={cell.presentation}
                onChange={(event) => updateCell(cell.plate_number, cell.event_number, { presentation: event.target.value as FitascPresentation })}
              >
                {PRESENTATION_OPTIONS.map((presentation) => (
                  <option key={presentation} value={presentation}>
                    {presentation}
                  </option>
                ))}
              </select>
              <div className="row">
                <div>
                  <label>First machine</label>
                  <select value={cell.first_machine || ""} onChange={(event) => updateCell(cell.plate_number, cell.event_number, { first_machine: event.target.value })}>
                    <option value="">Blank</option>
                    {MACHINE_OPTIONS.map((machine) => (
                      <option key={machine} value={machine}>
                        {machine}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Second machine</label>
                  <select value={cell.second_machine || ""} onChange={(event) => updateCell(cell.plate_number, cell.event_number, { second_machine: event.target.value })}>
                    <option value="">Blank</option>
                    {MACHINE_OPTIONS.map((machine) => (
                      <option key={machine} value={machine}>
                        {machine}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="checkRow">
                <input type="checkbox" checked={cell.is_verified} onChange={(event) => updateCell(cell.plate_number, cell.event_number, { is_verified: event.target.checked })} />
                Verified
              </label>
              <label>Source</label>
              <input value={cell.source || ""} onChange={(event) => updateCell(cell.plate_number, cell.event_number, { source: event.target.value })} placeholder="Optional verified source note" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
