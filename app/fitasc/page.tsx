"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllSchemeNumbers, getCompakSchemeType, getExpectedPresentationRows, getMachineLabelFromRow, getPresentationLabel, type CompakSchemeRow } from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

export default function FitascPage() {
  const [scheme, setScheme] = useState(1);
  const [rows, setRows] = useState<CompakSchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const expectedRows = useMemo(() => getExpectedPresentationRows(scheme), [scheme]);
  const schemeTitle = `Scheme ${scheme}`;
  const schemeDescription = getCompakSchemeType(scheme);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("fitasc_compak_schemes").select("scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified").eq("scheme_number", scheme).order("event_number").order("plate_number").returns<CompakSchemeRow[]>();
      setRows(data || []);
      setLoading(false);
    }
    load();
  }, [scheme]);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  function renderSchemeOverview(className = "") {
    return (
      <div className={`schemeOverview ${className}`.trim()} aria-label={`${schemeTitle} plate overview`}>
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
    );
  }

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">FITASC Compak</p>
          <h2>FITASC schemes</h2>
          <p>{schemeDescription}</p>
        </div>

      </div>
      <div className="card">
        <div className="schemePicker">
          <label>Scheme number</label>
          <select value={scheme} onChange={(e) => setScheme(Number(e.target.value))}>
            {getAllSchemeNumbers().map((number) => <option key={number} value={number}>Scheme {number}</option>)}
          </select>
        </div>
        <div className="schemeViewHeader">
          <div>
            <h3>{schemeTitle}</h3>
            <p className="small muted">{schemeDescription}</p>
          </div>
          <button
            type="button"
            className="secondary smallButton"
            onClick={() => setIsFullscreen(true)}
            aria-label={`Open ${schemeTitle} in fullscreen`}
          >
            Fullscreen
          </button>
        </div>
        {loading ? <p>Loading...</p> : renderSchemeOverview()}
      </div>

      {isFullscreen && (
        <div className="fitascFullscreenOverlay" role="dialog" aria-modal="true" aria-labelledby="fitasc-fullscreen-title">
          <div className="fitascFullscreenPanel">
            <div className="fitascFullscreenHeader">
              <div>
                <p className="eyebrow">FITASC Compak fullscreen</p>
                <h2 id="fitasc-fullscreen-title">{schemeTitle}</h2>
                <p className="small muted">{schemeDescription}</p>
                <p className="small muted fitascRotateHint">Rotate your phone for a wider view.</p>
              </div>
              <div className="fitascFullscreenActions">
                <button
                  type="button"
                  className="secondary smallButton fitascCloseIcon"
                  onClick={() => setIsFullscreen(false)}
                  aria-label="Close fullscreen scheme view"
                >
                  ×
                </button>
                <button
                  type="button"
                  className="smallButton"
                  onClick={() => setIsFullscreen(false)}
                >
                  Exit fullscreen
                </button>
              </div>
            </div>
            <div className="fitascFullscreenBody">
              {loading ? <p>Loading...</p> : renderSchemeOverview("schemeOverviewFullscreen")}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
