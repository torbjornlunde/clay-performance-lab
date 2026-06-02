"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getAllSchemeNumbers, getCompakSchemeType, getExpectedPresentationRows, getMachineLabelFromRow, getPresentationLabel, type CompakSchemeRow } from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

export default function FitascPage() {
  const [scheme, setScheme] = useState(1);
  const [rows, setRows] = useState<CompakSchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"full" | "stand">("full");
  const [selectedStand, setSelectedStand] = useState(1);
  const [standSwipeDirection, setStandSwipeDirection] = useState<"next" | "previous" | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    return () => {
      if (swipeAnimationTimeoutRef.current) {
        clearTimeout(swipeAnimationTimeoutRef.current);
      }
    };
  }, []);

  function playStandTransition(direction: "next" | "previous") {
    if (swipeAnimationTimeoutRef.current) {
      clearTimeout(swipeAnimationTimeoutRef.current);
    }
    setStandSwipeDirection(direction);
    swipeAnimationTimeoutRef.current = setTimeout(() => {
      setStandSwipeDirection(null);
    }, 260);
  }

  function vibrateOnStandChange() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(8);
    }
  }

  function changeStandBy(delta: -1 | 1) {
    const nextStand = Math.min(standNumbers[standNumbers.length - 1], Math.max(standNumbers[0], selectedStand + delta));
    if (nextStand === selectedStand) return false;

    setSelectedStand(nextStand);
    playStandTransition(delta > 0 ? "next" : "previous");
    vibrateOnStandChange();
    return true;
  }

  function goToPreviousStand() {
    changeStandBy(-1);
  }

  function goToNextStand() {
    changeStandBy(1);
  }

  function handleStandSwipeStart(event: PointerEvent<HTMLDivElement>) {
    swipeStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setStandSwipeDirection(null);
  }

  function handleStandSwipeEnd(event: PointerEvent<HTMLDivElement>) {
    const swipeStart = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    const direction = deltaX < 0 ? 1 : -1;
    const canChange = direction > 0 ? selectedStand < standNumbers[standNumbers.length - 1] : selectedStand > standNumbers[0];
    const isHorizontalSwipe = Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35;
    if (!isHorizontalSwipe || !canChange) return;

    changeStandBy(direction as -1 | 1);
  }

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


  function renderStandView(className = "") {
    const isFirstStand = selectedStand === standNumbers[0];
    const isLastStand = selectedStand === standNumbers[standNumbers.length - 1];

    return (
      <section className={`standView ${className}`.trim()} aria-label={`${schemeTitle} Stand ${selectedStand}`}>
        <div className="standViewTopline">
          <div>
            <p className="eyebrow">Stand view</p>
            <h3>Stand {selectedStand} of {standNumbers.length}</h3>
            <p className="small muted">Only the targets for Stand {selectedStand} are shown.</p>
          </div>
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
        </div>

        <div
          className={`standPresentationList ${standSwipeDirection ? `standSwipe${standSwipeDirection === "next" ? "Next" : "Previous"}` : ""}`.trim()}
          style={{ "--stand-row-count": expectedRows.length } as CSSProperties}
          onPointerDown={handleStandSwipeStart}
          onPointerCancel={() => { swipeStartRef.current = null; }}
          onPointerUp={handleStandSwipeEnd}
        >
          {expectedRows.map((presentation, rowIndex) => {
            const row = rows.find((item) => item.event_number === rowIndex + 1 && item.plate_number === selectedStand);
            const machineLabel = getMachineLabelFromRow(row);
            return (
              <div className="standPresentationCard" key={`${presentation}-${rowIndex}`}>
                <strong className={machineLabel.includes("+") ? "standMachineLabel standMachineLabelPair" : "standMachineLabel"}>{machineLabel}</strong>
                <span className="standPresentationType">{getPresentationLabel(presentation)}</span>
              </div>
            );
          })}
        </div>

        <div className="standNavigation" role="group" aria-label="Stand navigation">
          <button
            type="button"
            className="secondary"
            onClick={goToPreviousStand}
            disabled={isFirstStand}
          >
            Previous
          </button>
          <span className="small muted">Stand {selectedStand} of {standNumbers.length}</span>
          <button
            type="button"
            onClick={goToNextStand}
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
          <div className={viewMode === "stand" ? "fitascFullscreenPanel fitascFullscreenPanelStand" : "fitascFullscreenPanel"}>
            <div className="fitascFullscreenHeader">
              <div className="fitascFullscreenTitleBlock">
                <p className="eyebrow">FITASC Compak fullscreen</p>
                <h2 id="fitasc-fullscreen-title">
                  {viewMode === "stand" ? `${schemeTitle} · Stand ${selectedStand}/${standNumbers.length}` : schemeTitle}
                </h2>
                {viewMode === "full" && <p className="small muted">{schemeDescription}</p>}
              </div>
              <div className="fitascFullscreenActions">
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
            <div className="fitascFullscreenBody">
              {loading ? <p>Loading...</p> : renderSelectedSchemeView("schemeOverviewFullscreen")}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
