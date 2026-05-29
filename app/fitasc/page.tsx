"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FitascSchemeCell,
  formatMachineLabel,
  formatPresentation,
  getSchemeOptions,
  getSchemeType,
} from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

export default function FitascPage() {
  const [schemeNumber, setSchemeNumber] = useState(1);
  const [cells, setCells] = useState<FitascSchemeCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const byPlateEvent = useMemo(() => {
    const map = new Map<string, FitascSchemeCell>();
    cells.forEach((cell) => map.set(`${cell.plate_number}-${cell.event_number}`, cell));
    return map;
  }, [cells]);

  useEffect(() => {
    loadScheme(schemeNumber);
  }, [schemeNumber]);

  async function loadScheme(nextScheme: number) {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase
      .from("fitasc_compak_schemes")
      .select("id,scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified,source")
      .eq("scheme_number", nextScheme)
      .order("plate_number")
      .order("event_number")
      .returns<FitascSchemeCell[]>();
    setLoading(false);

    if (error) {
      setCells([]);
      setMessage(error.message);
      return;
    }

    setCells(data || []);
  }

  return (
    <main>
      <div className="card">
        <p className="eyebrow">FITASC Compak reference</p>
        <h2>Scheme viewer</h2>
        <p>
          Machine labels are loaded from the FITASC Compak scheme registry table. Missing cells are shown as Unknown until verified data is imported.
        </p>
        <label>Scheme number</label>
        <select value={schemeNumber} onChange={(event) => setSchemeNumber(Number(event.target.value))}>
          {getSchemeOptions().map((option) => (
            <option key={option.scheme} value={option.scheme}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="btns">
          <Link className="button secondary" href="/fitasc/admin">
            Admin/import page
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <h2>Scheme {schemeNumber}</h2>
            <p className="small muted">Fallback structure: {getSchemeType(schemeNumber)}. A-F machine data comes only from database rows.</p>
          </div>
          <span className="badge badgeBlue">{cells.length}/25 cells imported</span>
        </div>
        {message && <div className="error">{message}</div>}
        {loading ? (
          <div className="notice">Loading scheme...</div>
        ) : (
          <div className="schemeGridWrap">
            <table className="schemeGrid">
              <thead>
                <tr>
                  <th>Plate</th>
                  {[1, 2, 3, 4, 5].map((eventNumber) => (
                    <th key={eventNumber}>Event {eventNumber}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((plate) => (
                  <tr key={plate}>
                    <th>Plate {plate}</th>
                    {[1, 2, 3, 4, 5].map((eventNumber) => {
                      const cell = byPlateEvent.get(`${plate}-${eventNumber}`);
                      return (
                        <td key={eventNumber}>
                          <strong>{formatMachineLabel(cell)}</strong>
                          <span>{cell ? formatPresentation(cell.presentation) : "Unknown"}</span>
                          <em className={cell?.is_verified ? "verified" : "unverified"}>{cell?.is_verified ? "Verified" : "Not verified"}</em>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
