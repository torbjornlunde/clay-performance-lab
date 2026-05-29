"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

  const visible = expectedRows.flatMap((_presentation, eventIndex) => [1, 2, 3, 4, 5].map((plate) => rows.find((row) => row.event_number === eventIndex + 1 && row.plate_number === plate))).filter(Boolean) as CompakSchemeRow[];
  const verifiedCount = visible.filter((row) => row.is_verified).length;
  const status = visible.length === 0 || verifiedCount === 0 ? "Not verified" : verifiedCount === expectedRows.length * 5 ? "Verified" : "Partly verified";

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>FITASC schemes</h2>
          <p>{getCompakSchemeType(scheme)}</p>
        </div>
        <div className="btns heroActions">
          <Link href="/dashboard" className="button secondary">Dashboard</Link>
          <Link href="/fitasc/admin" className="button secondary">Admin import</Link>
        </div>
      </div>
      <div className="card">
        <div className="row">
          <div>
            <label>Scheme number</label>
            <select value={scheme} onChange={(e) => setScheme(Number(e.target.value))}>
              {getAllSchemeNumbers().map((number) => <option key={number} value={number}>Scheme {number}</option>)}
            </select>
          </div>
          <div>
            <label>Verification status</label>
            <div className="notice">{status}</div>
          </div>
        </div>
        {loading ? <p>Loading...</p> : (
          <div className="schemeOverview">
            {expectedRows.map((presentation, rowIndex) => (
              <div className="schemeRowCard" key={`${presentation}-${rowIndex}`}>
                <strong>{getPresentationLabel(presentation)}</strong>
                <div className="schemePlateGrid">
                  {[1, 2, 3, 4, 5].map((plateNumber) => {
                    const row = rows.find((item) => item.event_number === rowIndex + 1 && item.plate_number === plateNumber);
                    return <span key={plateNumber}>Plate {plateNumber} <b>{getMachineLabelFromRow(row)}</b></span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
