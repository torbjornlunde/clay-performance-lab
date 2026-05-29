"use client";

import { useMemo, useState } from "react";
import { getSchemeOptions, getSchemeType } from "@/lib/fitasc/schemes";

const plates = [1, 2, 3, 4, 5];
const rows = [1, 2, 3, 4, 5];

function getMachineForCell() {
  return "Unknown";
}

export default function FitascPage() {
  const schemes = useMemo(() => getSchemeOptions(), []);
  const [scheme, setScheme] = useState(1);
  const schemeType = getSchemeType(scheme);

  return (
    <main>
      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">FITASC scheme</p>
            <h2>Scheme overview</h2>
          </div>
          <span className="pill">Scheme {scheme}</span>
        </div>

        <label htmlFor="fitascScheme">Select scheme number</label>
        <select id="fitascScheme" value={scheme} onChange={(e) => setScheme(Number(e.currentTarget.value))}>
          {schemes.map((option) => (
            <option key={option.scheme} value={option.scheme}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="schemeTypeCard">
          <span className="small muted">Scheme type</span>
          <strong>{schemeType}</strong>
        </div>
      </div>

      <section className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Full overview</p>
            <h2>Plates</h2>
          </div>
        </div>

        <div className="schemeGrid" role="table" aria-label={`FITASC scheme ${scheme} plate overview`}>
          <div className="schemeGridHeader" role="row">
            <div className="schemeCorner" role="columnheader" aria-label="Row" />
            {plates.map((plate) => (
              <div className="schemePlateHeader" role="columnheader" key={plate}>
                Plate {plate}
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div className="schemeGridRow" role="row" key={row}>
              <div className="schemeRowHeader" role="rowheader">
                {row}
              </div>
              {plates.map((plate) => (
                <div className="schemeCell" role="cell" key={`${row}-${plate}`}>
                  {getMachineForCell()}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
