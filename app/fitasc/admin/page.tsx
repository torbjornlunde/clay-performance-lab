"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FitascCell,
  FitascRawSchemeRow,
  fitascCellKey,
  fitascCellMap,
  normalizeFitascRows,
  presentationForSchemeRow,
  rowCountForScheme,
} from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

const plates = [1, 2, 3, 4, 5];
const schemes = Array.from({ length: 40 }, (_, index) => index + 1);

export default function FitascAdminPage() {
  const [selectedScheme, setSelectedScheme] = useState(1);
  const [cells, setCells] = useState<FitascCell[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSchemes();
  }, []);

  async function loadSchemes() {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase
      .from("fitasc_compak_schemes")
      .select("*")
      .eq("scheme_number", selectedScheme)
      .order("plate_number")
      .order("event_number")
      .returns<FitascRawSchemeRow[]>();

    if (error) setMessage(error.message);
    setCells(normalizeFitascRows(data || []));
    setLoading(false);
  }

  useEffect(() => {
    loadSchemes();
  }, [selectedScheme]);

  const cellMap = useMemo(() => fitascCellMap(cells), [cells]);
  const rows = Array.from(
    { length: rowCountForScheme(selectedScheme) },
    (_, index) => index + 1,
  );

  function buildPasteTemplate() {
    const lines = rows.map((rowNumber) => {
      const values = plates.map(
        (plate) =>
          cellMap.get(fitascCellKey(selectedScheme, plate, rowNumber))
            ?.machine || "",
      );
      return [
        presentationForSchemeRow(selectedScheme, rowNumber),
        ...values,
      ].join("\t");
    });
    setBulkText(
      [
        "Presentation\tPlate 1\tPlate 2\tPlate 3\tPlate 4\tPlate 5",
        ...lines,
      ].join("\n"),
    );
  }

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>Admin grid</h2>
          <p>
            Review imported scheme rows in a compact grid and prepare bulk-paste
            edits without one large card per cell.
          </p>
        </div>
        <div className="btns heroActions">
          <Link className="button secondary" href="/fitasc">
            Viewer
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
              Scheme {scheme}
            </option>
          ))}
        </select>
        {loading && (
          <div className="notice small">Loading imported rows...</div>
        )}
        {message && <div className="notice small">{message}</div>}
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Compact grid</p>
            <h2>Scheme {selectedScheme}</h2>
          </div>
          <button
            className="secondary smallButton"
            onClick={buildPasteTemplate}
            type="button"
          >
            Copy to paste box
          </button>
        </div>
        <div className="tableScroll">
          <table className="fitascTable compactFitascTable">
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

      <div className="card">
        <h2>Bulk paste</h2>
        <p className="small muted">
          Paste tab-separated machine values by presentation row and plate
          column.
        </p>
        <textarea
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          placeholder="Presentation&#9;Plate 1&#9;Plate 2&#9;Plate 3&#9;Plate 4&#9;Plate 5"
        />
      </div>
    </main>
  );
}
