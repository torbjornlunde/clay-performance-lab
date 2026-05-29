"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fitascCellKey,
  fitascCellMap,
  FitascCell,
  FitascRawSchemeRow,
  getSchemeType,
  normalizeFitascRows,
  presentationForSchemeRow,
  rowCountForScheme,
} from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

const plates = [1, 2, 3, 4, 5];
const schemes = Array.from({ length: 40 }, (_, index) => index + 1);

export default function FitascPage() {
  const [selectedScheme, setSelectedScheme] = useState(1);
  const [cells, setCells] = useState<FitascCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSchemes();
  }, []);

  async function loadSchemes() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("fitasc_compak_schemes")
      .select("*")
      .gte("scheme_number", 1)
      .lte("scheme_number", 40)
      .order("scheme_number")
      .order("plate_number")
      .order("event_number")
      .returns<FitascRawSchemeRow[]>();

    if (loadError) setError(loadError.message);
    setCells(normalizeFitascRows(data || []));
    setLoading(false);
  }

  const cellMap = useMemo(() => fitascCellMap(cells), [cells]);
  const rows = Array.from(
    { length: rowCountForScheme(selectedScheme) },
    (_, index) => index + 1,
  );

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>Scheme viewer</h2>
          <p>View verified schemes 1–40 by plate, presentation and machine.</p>
        </div>
        <div className="btns heroActions">
          <Link className="button secondary" href="/dashboard">
            Dashboard
          </Link>
          <Link className="button secondary" href="/fitasc/admin">
            Admin grid
          </Link>
        </div>
      </div>

      <div className="card">
        <label>Scheme</label>
        <select
          value={selectedScheme}
          onChange={(event) => setSelectedScheme(Number(event.target.value))}
        >
          {schemes.map((scheme) => (
            <option key={scheme} value={scheme}>
              Scheme {scheme} — {getSchemeType(scheme)}
            </option>
          ))}
        </select>
        {loading && (
          <div className="notice small">Loading FITASC scheme data...</div>
        )}
        {error && <div className="error small">{error}</div>}
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Scheme {selectedScheme}</h2>
          </div>
          <span className="pill">{getSchemeType(selectedScheme)}</span>
        </div>
        <div className="tableScroll">
          <table className="fitascTable">
            <thead>
              <tr>
                <th>Presentation</th>
                {plates.map((plate) => (
                  <th key={plate}>Plate {plate}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((rowNumber) => (
                <tr key={rowNumber}>
                  <th>{presentationForSchemeRow(selectedScheme, rowNumber)}</th>
                  {plates.map((plate) => {
                    const cell = cellMap.get(
                      fitascCellKey(selectedScheme, plate, rowNumber),
                    );
                    return <td key={plate}>{cell?.machine || "Unknown"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
