"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StatusResponse = { year: number; status: Record<string, unknown> | null; shooterRowsStored: number; resultListsDiscovered: number; eventsDiscovered: number; error?: string };

export default function LeirdueCacheAdminPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function loadStatus() {
    setLoading(true);
    setMessage("");
    const headers = await authHeaders();
    const response = await fetch(`/api/leirdue/ingest?year=${encodeURIComponent(year)}`, { headers });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) setMessage(data.error || "Could not load Leirdue cache status.");
    else setStatus(data);
  }

  async function runAction(action: string) {
    setLoading(true);
    const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
    const response = await fetch("/api/leirdue/ingest", { method: "POST", headers, body: JSON.stringify({ year: Number(year), action }) });
    const data = await response.json();
    setLoading(false);
    setMessage(data.message || data.error || "Action finished.");
    await loadStatus();
  }

  useEffect(() => { void loadStatus(); }, []);

  const statusRow = status?.status || {};
  return (
    <main className="container">
      <section className="card">
        <p className="eyebrow">Admin</p>
        <h1>Leirdue cache</h1>
        <p className="muted">Shared year ingestion status. User searches read the shared cache and do not start full-year crawls.</p>
        <div className="fieldRow">
          <label>Year<input value={year} onChange={(event) => setYear(event.target.value)} /></label>
          <button type="button" onClick={loadStatus} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
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
        <div className="btns">
          <button type="button" onClick={() => runAction("discoverYear")} disabled={loading}>Discover year</button>
          <button type="button" onClick={() => runAction("eventBatch")} disabled={loading}>Run next event batch</button>
          <button type="button" onClick={() => runAction("resultListBatch")} disabled={loading}>Run next result-list batch</button>
          <button type="button" onClick={() => runAction("combined")} disabled={loading}>Run next combined batch</button>
          <button type="button" className="secondary" onClick={() => runAction("retryFailed")} disabled={loading}>Retry failed items</button>
        </div>
        {statusRow.latest_errors ? <pre className="small muted">{JSON.stringify(statusRow.latest_errors, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
