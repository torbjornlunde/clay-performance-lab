"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getAllSchemeNumbers,
  getCompakEvent,
  getCompakSchemeType,
  getMachineLabel,
  hasVerifiedSchemeData,
} from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

const PLATES = [1, 2, 3, 4, 5];
const ROWS = [1, 2, 3, 4, 5];

export default function FitascPage() {
  const router = useRouter();
  const schemeNumbers = useMemo(() => getAllSchemeNumbers(), []);
  const [schemeNumber, setSchemeNumber] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setLoading(false);
    }

    checkUser();
  }, [router]);

  const schemeType = getCompakSchemeType(schemeNumber);
  const hasVerifiedData = hasVerifiedSchemeData(schemeNumber);

  if (loading) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>FITASC schemes</h2>
          <p>Choose any official scheme number from 1 to 40 and view the full five-plate layout.</p>
        </div>
        <div className="btns heroActions">
          <Link className="button secondary" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Scheme selector</p>
            <h2>Scheme {schemeNumber}</h2>
            <p className="small muted">{schemeType}</p>
          </div>
          <span className={hasVerifiedData ? "badge badgeGreen" : "badge badgeBlue"}>{hasVerifiedData ? "Verified" : "Unknown data"}</span>
        </div>

        <label>Scheme number</label>
        <select value={schemeNumber} onChange={(event) => setSchemeNumber(Number(event.target.value))}>
          {schemeNumbers.map((number) => (
            <option value={number} key={number}>
              Scheme {number} — {getCompakSchemeType(number)}
            </option>
          ))}
        </select>

        <div className="schemeNumberGrid" aria-label="FITASC scheme numbers">
          {schemeNumbers.map((number) => (
            <button
              className={number === schemeNumber ? "schemeNumber activeSchemeNumber" : "schemeNumber secondary"}
              key={number}
              onClick={() => setSchemeNumber(number)}
              type="button"
            >
              {number}
            </button>
          ))}
        </div>

        {!hasVerifiedData && (
          <div className="notice small">Machine unknown for this scheme until exact FITASC data is imported.</div>
        )}
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Full scheme</h2>
          </div>
        </div>

        <div className="schemeGrid" role="table" aria-label={`Scheme ${schemeNumber} overview`}>
          <div className="schemeCorner" aria-hidden="true" />
          {PLATES.map((plateNumber) => (
            <div className="schemeHead" role="columnheader" key={plateNumber}>
              Plate {plateNumber}
            </div>
          ))}
          {ROWS.map((rowNumber) => (
            <div className="schemeRowGroup" role="row" key={rowNumber}>
              <div className="schemeRowHead" role="rowheader">
                {rowNumber}
              </div>
              {PLATES.map((plateNumber) => {
                const event = getCompakEvent(schemeNumber, plateNumber, rowNumber);
                return (
                  <div className={event.isVerified ? "schemeCell verifiedCell" : "schemeCell unknownCell"} role="cell" key={plateNumber}>
                    {getMachineLabel(event)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
