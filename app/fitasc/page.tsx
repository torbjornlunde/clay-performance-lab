"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSchemeOptions, getSchemeType, machineText, makeSchemeOverview, type FitascSchemeRow } from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

export default function FitascPage() {
  const schemes = useMemo(() => getSchemeOptions(), []);
  const [schemeNumber, setSchemeNumber] = useState(1);
  const [rows, setRows] = useState<FitascSchemeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadScheme(schemeNumber);
  }, [schemeNumber]);

  async function loadScheme(nextScheme: number) {
    setLoading(true);
    const { data } = await supabase
      .from("fitasc_compak_schemes")
      .select("scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified,source")
      .eq("scheme_number", nextScheme)
      .returns<FitascSchemeRow[]>();
    setRows(data || []);
    setLoading(false);
  }

  const overview = useMemo(() => makeSchemeOverview(schemeNumber, rows), [schemeNumber, rows]);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>Scheme overview</h2>
          <p>View the whole five-plate scheme together. Exact A-F scheme data must be verified before competition use.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="card">
        <label>Scheme number</label>
        <select value={schemeNumber} onChange={(event) => setSchemeNumber(Number(event.target.value))}>
          {schemes.map((option) => (
            <option value={option.scheme} key={option.scheme}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="notice small">
          Scheme type: <strong>{getSchemeType(schemeNumber)}</strong>. Exact A-F scheme data must be verified before competition use.
        </div>
        {loading ? (
          <p>Loading scheme...</p>
        ) : (
          <div className="schemeOverview" aria-label={`Scheme ${schemeNumber} overview`}>
            <div className="schemeHeader schemeCell">Event</div>
            {[1, 2, 3, 4, 5].map((plate) => (
              <div className="schemeHeader schemeCell" key={plate}>
                Plate {plate}
              </div>
            ))}
            {overview.map((eventCells, eventIndex) => (
              <div className="schemeRow" key={eventIndex}>
                <div className="schemeHeader schemeCell">Event {eventIndex + 1}</div>
                {eventCells.map((cell) => (
                  <div className="schemeCell" data-plate={cell.plateNumber} key={`${cell.plateNumber}-${cell.eventNumber}`}>
                    <strong>{cell.presentation}</strong>
                    <span>{machineText(cell.firstMachine, cell.secondMachine)}</span>
                    {!cell.isVerified && <em>Unverified</em>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
