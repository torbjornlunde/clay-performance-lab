"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAllSchemeNumbers, getCompakSchemeType, getExpectedPresentationRows, getMachineLabelFromRow, getPresentationLabel, type CompakSchemeRow } from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

type ScreenWakeLockSentinel = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

export default function FitascPage() {
  const [scheme, setScheme] = useState(1);
  const [rows, setRows] = useState<CompakSchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"full" | "stand">("full");
  const [selectedStand, setSelectedStand] = useState(1);
  const [supportsWakeLock, setSupportsWakeLock] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const standNumbers = [1, 2, 3, 4, 5];
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
    setSupportsWakeLock("wakeLock" in navigator);
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    function clearWakeLockState() {
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }

    async function releaseWakeLock() {
      const wakeLock = wakeLockRef.current;
      clearWakeLockState();
      if (!wakeLock || wakeLock.released) return;

      try {
        await wakeLock.release();
      } catch {
        // Wake lock release can fail if the browser already released it.
      }
    }

    async function requestWakeLock() {
      if (!isFullscreen || !keepScreenAwake || document.visibilityState !== "visible") return;
      if (wakeLockRef.current && !wakeLockRef.current.released) return;

      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock) return;

      try {
        const lock = await wakeLock.request("screen");
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }

        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener("release", clearWakeLockState, { once: true });
      } catch {
        clearWakeLockState();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        clearWakeLockState();
      }
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [isFullscreen, keepScreenAwake]);

  function renderViewModeToggle(className = "") {
    return (
      <div className={`schemeModeToggle ${className}`.trim()} role="group" aria-label="Scheme view mode">
        <button
          type="button"
          className={viewMode === "full" ? "" : "secondary"}
          onClick={() => setViewMode("full")}
          aria-pressed={viewMode === "full"}
        >
          Full scheme
        </button>
        <button
          type="button"
          className={viewMode === "stand" ? "" : "secondary"}
          onClick={() => setViewMode("stand")}
          aria-pressed={viewMode === "stand"}
        >
          Stand view
        </button>
      </div>
    );
  }

  function renderWakeLockToggle() {
    if (!supportsWakeLock) return null;

    return (
      <label className={`wakeLockToggle ${wakeLockActive ? "wakeLockToggleActive" : ""}`.trim()}>
        <input
          type="checkbox"
          checked={keepScreenAwake}
          onChange={(event) => setKeepScreenAwake(event.target.checked)}
        />
        Keep screen awake
      </label>
    );
  }

  function renderSchemeOverview(className = "") {
    return (
      <div className={`schemeOverview ${className}`.trim()} aria-label={`${schemeTitle} plate overview`}>
        <div className="schemeGridHeader" aria-hidden="true">
          <span />
          {standNumbers.map((plateNumber) => (
            <strong key={plateNumber}>
              <span className="desktopOnlyLabel">Plate {plateNumber}</span>
              <span className="mobileOnlyLabel">P{plateNumber}</span>
            </strong>
          ))}
        </div>
        {expectedRows.map((presentation, rowIndex) => (
          <div className="schemeRowCard" key={`${presentation}-${rowIndex}`}>
            <strong className="schemePresentationLabel">{getPresentationLabel(presentation)}</strong>
            {standNumbers.map((plateNumber) => {
              const row = rows.find((item) => item.event_number === rowIndex + 1 && item.plate_number === plateNumber);
              return <span className="schemeMachineCell" key={plateNumber}>{getMachineLabelFromRow(row)}</span>;
            })}
          </div>
        ))}
      </div>
    );
  }


  function renderStandSelector() {
    return (
      <div className="standDirectSelector" role="group" aria-label="Select stand">
        {standNumbers.map((standNumber) => (
          <button
            type="button"
            className={standNumber === selectedStand ? "standNumberButton" : "secondary standNumberButton"}
            key={standNumber}
            onClick={() => setSelectedStand(standNumber)}
            aria-label={`Show Stand ${standNumber}`}
            aria-pressed={standNumber === selectedStand}
          >
            {standNumber}
          </button>
        ))}
      </div>
    );
  }

  function renderStandView(className = "") {
    const isFirstStand = selectedStand === standNumbers[0];
    const isLastStand = selectedStand === standNumbers[standNumbers.length - 1];

    return (
      <section className={`standView ${className}`.trim()} aria-label={`${schemeTitle} Stand ${selectedStand}`}>
        <div className="standViewTopline">
          <div className="standViewTitle">
            <span className="eyebrow">Stand view</span>
            <h3>Stand {selectedStand}</h3>
            <span className="small muted">{schemeTitle}</span>
          </div>
          {renderStandSelector()}
        </div>

        <div className="standPresentationList">
          {expectedRows.map((presentation, rowIndex) => {
            const row = rows.find((item) => item.event_number === rowIndex + 1 && item.plate_number === selectedStand);
            return (
              <div className="standPresentationCard" key={`${presentation}-${rowIndex}`}>
                <strong className="standMachineLabel">{getMachineLabelFromRow(row)}</strong>
                <span className="standPresentationType">{getPresentationLabel(presentation)}</span>
              </div>
            );
          })}
        </div>

        <div className="standNavigation" role="group" aria-label="Stand navigation">
          <button
            type="button"
            className="secondary"
            onClick={() => setSelectedStand((current) => Math.max(standNumbers[0], current - 1))}
            disabled={isFirstStand}
          >
            Previous
          </button>
          <span className="small muted">Stand {selectedStand} of {standNumbers.length}</span>
          <button
            type="button"
            onClick={() => setSelectedStand((current) => Math.min(standNumbers[standNumbers.length - 1], current + 1))}
            disabled={isLastStand}
          >
            Next
          </button>
        </div>
      </section>
    );
  }

  function renderSelectedSchemeView(className = "") {
    return viewMode === "stand" ? renderStandView(className) : renderSchemeOverview(className);
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
          <div className="schemeViewActions">
            {renderViewModeToggle()}
            <button
              type="button"
              className="secondary smallButton"
              onClick={() => setIsFullscreen(true)}
              aria-label={`Open ${schemeTitle} in fullscreen`}
            >
              Fullscreen
            </button>
          </div>
        </div>
        {loading ? <p>Loading...</p> : renderSelectedSchemeView()}
      </div>

      {isFullscreen && (
        <div className="fitascFullscreenOverlay" role="dialog" aria-modal="true" aria-labelledby="fitasc-fullscreen-title">
          <div className="fitascFullscreenPanel">
            <div className="fitascFullscreenHeader">
              <div>
                <p className="eyebrow">FITASC Compak fullscreen</p>
                <h2 id="fitasc-fullscreen-title">{schemeTitle}</h2>
                <p className="small muted">{viewMode === "stand" ? `Stand ${selectedStand}/${standNumbers.length}` : schemeDescription}</p>
              </div>
              <div className="fitascFullscreenActions">
                {renderWakeLockToggle()}
                {renderViewModeToggle("schemeModeToggleCompact")}
                <button
                  type="button"
                  className="secondary smallButton fitascCloseIcon"
                  onClick={() => setIsFullscreen(false)}
                  aria-label="Close fullscreen"
                >
                  ×
                </button>
              </div>
            </div>
            <div className={`fitascFullscreenBody ${viewMode === "stand" ? "fitascFullscreenBodyStand" : ""}`.trim()}>
              {loading ? <p>Loading...</p> : renderSelectedSchemeView("schemeOverviewFullscreen")}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
