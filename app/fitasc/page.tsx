"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllSchemeNumbers, getCompakSchemeType, getExpectedPresentationRows, getMachineLabelFromRow, getPresentationLabel, type CompakSchemeRow } from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

export default function FitascPage() {
  const [scheme, setScheme] = useState(1);
  const [rows, setRows] = useState<CompakSchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const expectedRows = useMemo(() => getExpectedPresentationRows(scheme), [scheme]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("fitasc_compak_schemes").select("scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified").eq("scheme_number", scheme).order("event_number").order("plate_number").returns<CompakSchemeRow[]>();
      setRows(data || []);
      setLoading(false);
    }
    load();
  }, [scheme]);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>FITASC schemes</h2>
          <p>{getCompakSchemeType(scheme)}</p>
        </div>

      </div>
      <div className="card">
        <div className="schemePicker">
          <label>Scheme number</label>
          <select value={scheme} onChange={(e) => setScheme(Number(e.target.value))}>
            {getAllSchemeNumbers().map((number) => <option key={number} value={number}>Scheme {number}</option>)}
          </select>
        </div>
        {loading ? <p>Loading...</p> : (
          <div className="schemeOverview" aria-label={`Scheme ${scheme} plate overview`}>
            <div className="schemeGridHeader" aria-hidden="true">
              <span />
              {[1, 2, 3, 4, 5].map((plateNumber) => (
                <strong key={plateNumber}>
                  <span className="desktopOnlyLabel">Plate {plateNumber}</span>
                  <span className="mobileOnlyLabel">P{plateNumber}</span>
                </strong>
              ))}
            </div>
            {expectedRows.map((presentation, rowIndex) => (
              <div className="schemeRowCard" key={`${presentation}-${rowIndex}`}>
                <strong className="schemePresentationLabel">{getPresentationLabel(presentation)}</strong>
                {[1, 2, 3, 4, 5].map((plateNumber) => {
                  const row = rows.find((item) => item.event_number === rowIndex + 1 && item.plate_number === plateNumber);
                  return <span className="schemeMachineCell" key={plateNumber}>{getMachineLabelFromRow(row)}</span>;
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
