"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getAllSchemeNumbers, getCompakScheme, getMachineLabel, getPresentationLabel } from "@/lib/fitasc/compakSchemes";

export default function FitascPage() {
  const schemeNumbers = useMemo(() => getAllSchemeNumbers(), []);
  const [schemeNumber, setSchemeNumber] = useState(1);
  const scheme = getCompakScheme(schemeNumber);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Quick lookup</p>
          <h2>FITASC schemes</h2>
          <p>Mobile-friendly scheme viewer for judging and refereeing.</p>
        </div>
        <div className="btns heroActions">
          <Link className="button secondary" href="/dashboard">Dashboard</Link>
        </div>
      </div>

      <div className="card">
        <label>Scheme number</label>
        <select value={schemeNumber} onChange={(e) => setSchemeNumber(Number(e.target.value))}>
          {schemeNumbers.map((number) => (
            <option key={number} value={number}>Scheme {number}</option>
          ))}
        </select>
        <div className="notice">
          Exact A-F data must be verified against official FITASC schemes before competition use.
        </div>
        <p><strong>Scheme type:</strong> {scheme?.schemeType ?? "Unknown"}</p>
      </div>

      <div className="schemeGrid">
        {scheme?.plates.map((plate) => (
          <section className="card" key={plate.plateNumber}>
            <p className="eyebrow">Plate {plate.plateNumber}</p>
            <h2>Events</h2>
            {plate.events.map((event) => {
              const machineLabel = getMachineLabel(event);
              return (
                <div className="schemeEvent" key={event.eventNumber}>
                  <span className="badge badgeBlue">{event.eventNumber}</span>
                  <div>
                    <strong>{machineLabel}</strong>
                    <div className="small muted">{getPresentationLabel(event.presentation)}</div>
                    {machineLabel === "Unknown" && <p className="small muted">Unknown until verified official FITASC A-F data is imported.</p>}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
