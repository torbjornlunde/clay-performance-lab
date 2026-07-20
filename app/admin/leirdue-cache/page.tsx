"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AppBackButton } from "@/app/components/navigation/AppBackButton";

type StatusResponse = { year: number; status: Record<string, unknown> | null; shooterRowsStored: number; resultListsDiscovered: number; eventsDiscovered: number; error?: string };

export default function LeirdueCacheAdminPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [runningUntilComplete, setRunningUntilComplete] = useState(false);
  const [loopStats, setLoopStats] = useState({ batches: 0, eventsCompleted: 0, listsCompleted: 0, shooterRowsStored: 0, startedAt: 0, lastError: "" });
  const [targetEventId, setTargetEventId] = useState("");
  const [targetListeId, setTargetListeId] = useState("");
  const stopRunRef = useRef(false);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function loadStatus(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setLoading(true);
    setMessage("");
    const headers = await authHeaders();
    const response = await fetch(`/api/leirdue/ingest?year=${encodeURIComponent(year)}`, { headers });
    const data = await response.json();
    if (!options.quiet) setLoading(false);
    if (!response.ok) {
      setMessage(data.error || "Could not load Leirdue cache status.");
      return null;
    }
    setStatus(data);
    return data as StatusResponse;
  }

  async function runAction(action: string, options: { quiet?: boolean; eventId?: string; listeId?: string } = {}) {
    if (!options.quiet) setLoading(true);
    const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
    const response = await fetch("/api/leirdue/ingest", { method: "POST", headers, body: JSON.stringify({ year: Number(year), action, eventId: options.eventId, listeId: options.listeId }) });
    const data = await response.json();
    if (!options.quiet) setLoading(false);
    if (!response.ok) throw new Error(data.error || "Ingestion batch failed.");
    if (!options.quiet) {
      setMessage(data.message || "Action finished.");
      await loadStatus();
    }
    return data;
  }

  function remainingWorkFrom(data: StatusResponse | null) {
    const value = data?.status?.remaining_work_count;
    return typeof value === "number" ? value : Number(value ?? 0);
  }

  async function runUntilComplete() {
    stopRunRef.current = false;
    setRunningUntilComplete(true);
    setLoading(true);
    const startedAt = Date.now();
    let batches = 0;
    let noProgress = 0;
    let latestStatus = await loadStatus({ quiet: true });
    let previousRemaining = remainingWorkFrom(latestStatus);
    let previousEvents = Number(latestStatus?.status?.completed_events ?? 0);
    let previousLists = Number(latestStatus?.status?.valid_result_lists ?? 0);
    let previousRows = Number(latestStatus?.status?.shooter_result_rows ?? latestStatus?.shooterRowsStored ?? 0);
    setLoopStats({ batches, eventsCompleted: previousEvents, listsCompleted: previousLists, shooterRowsStored: previousRows, startedAt, lastError: "" });
    try {
      while (!stopRunRef.current && previousRemaining > 0) {
        const result = await runAction("combined", { quiet: true });
        batches += 1;
        latestStatus = await loadStatus({ quiet: true });
        const nextRemaining = remainingWorkFrom(latestStatus);
        const nextEvents = Number(latestStatus?.status?.completed_events ?? previousEvents);
        const nextLists = Number(latestStatus?.status?.valid_result_lists ?? previousLists);
        const nextRows = Number(latestStatus?.status?.shooter_result_rows ?? latestStatus?.shooterRowsStored ?? previousRows);
        const madeProgress = nextRemaining < previousRemaining || nextEvents > previousEvents || nextLists > previousLists || nextRows > previousRows;
        noProgress = madeProgress ? 0 : noProgress + 1;
        setLoopStats({ batches, eventsCompleted: nextEvents, listsCompleted: nextLists, shooterRowsStored: nextRows, startedAt, lastError: result?.status?.latest_errors?.[0]?.error || "" });
        if (nextRemaining <= 0) { setMessage("Run until complete finished: no remaining work."); break; }
        if (noProgress >= 2) { setMessage("Run until complete paused: no progress for 2 consecutive batches."); break; }
        previousRemaining = nextRemaining; previousEvents = nextEvents; previousLists = nextLists; previousRows = nextRows;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      if (stopRunRef.current) setMessage("Run until complete stopped by user.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run until complete failed.";
      setLoopStats((stats) => ({ ...stats, lastError: message }));
      setMessage(message);
    } finally {
      setRunningUntilComplete(false);
      setLoading(false);
      await loadStatus({ quiet: true });
    }
  }

  useEffect(() => { void loadStatus(); }, []);

  const statusRow = status?.status || {};
  return (
    <main className="container">
      <section className="card">
        <AppBackButton fallback="/beta/admin" />
        <p className="eyebrow">Admin</p>
        <h1>Leirdue cache</h1>
        <p className="muted">Shared year ingestion status. User searches read the shared cache and do not start full-year crawls.</p>
        <div className="fieldRow">
          <label>Year<input value={year} onChange={(event) => setYear(event.target.value)} /></label>
          <button type="button" onClick={() => void loadStatus()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        </div>
        {message ? <p className="small muted">{message}</p> : null}
        <div className="compactSummaryGrid">
          <span><strong>{String(statusRow.status || "unknown")}</strong> indexing status</span>
          <span><strong>{status?.eventsDiscovered ?? 0}</strong> discovered events</span>
          <span><strong>{String(statusRow.pending_events ?? 0)}</strong> pending events</span>
          <span><strong>{String(statusRow.completed_events ?? 0)}</strong> completed events</span>
          <span><strong>{String(statusRow.failed_events ?? 0)}</strong> failed events</span>
          <span><strong>{status?.resultListsDiscovered ?? 0}</strong> result lists discovered</span>
          <span><strong>{String(statusRow.pending_result_lists ?? 0)}</strong> pending result lists</span>
          <span><strong>{String(statusRow.valid_result_lists ?? 0)}</strong> valid result lists</span>
          <span><strong>{String(statusRow.invalid_result_lists ?? 0)}</strong> invalid result lists</span>
          <span><strong>{String(statusRow.needs_review_result_lists ?? 0)}</strong> needs-review lists</span>
          <span><strong>{status?.shooterRowsStored ?? 0}</strong> shooter result rows stored</span>
          <span><strong>{String(statusRow.last_batch_duration_ms ?? "n/a")}</strong> last batch ms</span>
          <span><strong>{String(statusRow.remaining_work_count ?? "unknown")}</strong> remaining work</span>
        </div>
        <div className="fieldRow">
          <label>Event ID<input value={targetEventId} onChange={(event) => setTargetEventId(event.target.value)} placeholder="10225" /></label>
          <label>Liste ID<input value={targetListeId} onChange={(event) => setTargetListeId(event.target.value)} placeholder="46612" /></label>
          <button type="button" className="secondary" onClick={() => runAction("reparseList", { eventId: targetEventId.trim(), listeId: targetListeId.trim() })} disabled={loading || !targetListeId.trim()}>Reparse one result list</button>
        </div>
        <div className="btns">
          <button type="button" onClick={() => runAction("discoverYear")} disabled={loading}>Discover year</button>
          <button type="button" onClick={() => runAction("eventBatch")} disabled={loading}>Run next event batch</button>
          <button type="button" onClick={() => runAction("resultListBatch")} disabled={loading}>Run next result-list batch</button>
          <button type="button" onClick={() => runAction("combined")} disabled={loading}>Run next combined batch</button>
          <button type="button" onClick={runUntilComplete} disabled={loading || runningUntilComplete}>Run until complete</button>
          {runningUntilComplete ? <button type="button" className="secondary" onClick={() => { stopRunRef.current = true; }}>Stop after current batch</button> : null}
          <button type="button" className="secondary" onClick={() => runAction("retryFailed")} disabled={loading}>Retry failed items</button>
        </div>
        {runningUntilComplete || loopStats.batches > 0 ? <p className="small muted">Run-until-complete: batches={loopStats.batches}; eventsCompleted={loopStats.eventsCompleted}; resultListsCompleted={loopStats.listsCompleted}; shooterRowsStored={loopStats.shooterRowsStored}; remainingWork={String(statusRow.remaining_work_count ?? "unknown")}; elapsedMs={loopStats.startedAt ? Date.now() - loopStats.startedAt : 0}; lastError={loopStats.lastError || "none"}</p> : null}
        {statusRow.latest_errors ? <pre className="small muted">{JSON.stringify(statusRow.latest_errors, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
