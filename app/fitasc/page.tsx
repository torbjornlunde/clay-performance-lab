"use client";

import { useMemo, useState } from "react";
import { getCompakEvent, getCompakSchemeType, getEventCountForScheme, getMachineLabel, getPresentationLabel, hasVerifiedSchemeData } from "@/lib/fitasc/compakSchemes";

const plates = [1, 2, 3, 4, 5];
const schemes = Array.from({ length: 40 }, (_, index) => index + 1);

export default function FitascPage() {
  const [schemeNumber, setSchemeNumber] = useState(1);
  const rows = useMemo(() => Array.from({ length: getEventCountForScheme(schemeNumber) }, (_, index) => index + 1), [schemeNumber]);
  const hasVerified = hasVerifiedSchemeData(schemeNumber);

  return (
    <main>
      <div className="card">
        <p className="eyebrow">FITASC Compak</p>
        <h2>Scheme overview</h2>
        <p className="small muted">
          Select a scheme to see the complete plate-by-plate menu from the structured verified data imported into Clay Performance Lab.
        </p>
        <label>Scheme number</label>
        <select value={schemeNumber} onChange={(event) => setSchemeNumber(Number(event.target.value))}>
          {schemes.map((scheme) => (
            <option key={scheme} value={scheme}>
              Scheme {scheme} — {getCompakSchemeType(scheme)}
            </option>
          ))}
        </select>
        <div className="sessionMeta">
          <span className="pill">Scheme {schemeNumber}</span>
          <span className="pill">{getCompakSchemeType(schemeNumber)}</span>
          <span className={hasVerified ? "pill badgeGreen" : "pill"}>{hasVerified ? "Verified A-F data imported" : "A-F data not imported"}</span>
        </div>
        {!hasVerified && <div className="notice">No verified A-F data imported for this scheme yet.</div>}
      </div>

      <div className="card">
        <h2>Full scheme</h2>
        <div className="schemeTableWrap">
          <table className="schemeTable">
            <thead>
              <tr>
                <th>Event</th>
                {plates.map((plate) => (
                  <th key={plate}>Plate {plate}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((eventNumber) => (
                <tr key={eventNumber}>
                  <th>Target {eventNumber}</th>
                  {plates.map((plate) => {
                    const event = getCompakEvent(schemeNumber, plate, eventNumber);
                    return (
                      <td key={plate}>
                        <strong>{getMachineLabel(event)}</strong>
                        <span>{getPresentationLabel(event.presentation)}</span>
                      </td>
                    );
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
