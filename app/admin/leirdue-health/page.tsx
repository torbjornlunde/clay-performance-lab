"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { leirdueHealthSummary, needsLeirdueAdminAttention, type LeirdueHealthState, type LeirdueJobHealthRow } from "@/lib/leirdue/jobHealth";
import { supabase } from "@/lib/supabase/client";
import { AppBackButton } from "@/app/components/navigation/AppBackButton";

type HealthResponse = { state: LeirdueHealthState; healthy: boolean; row: LeirdueJobHealthRow | null; staleAfterHours: number; emailAlerts?: { status: "configured" | "not_configured" }; error?: string };

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function affectedScopeSummary(scope: Record<string, unknown> | null | undefined) {
  if (!scope) return "No scope recorded yet.";
  const parts = ["year", "recentWindowDays", "eventsProcessed", "listsProcessed", "cutoff"].map((key) => scope[key] === undefined ? null : `${key}: ${String(scope[key])}`).filter(Boolean);
  return parts.length ? parts.join(" · ") : JSON.stringify(scope);
}

export default function LeirdueHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadHealth() {
    setLoading(true); setMessage("");
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    const response = await fetch("/api/admin/leirdue/job-health", { headers });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) { setMessage(payload.error || "Could not load Leirdue refresh health."); return; }
    setHealth(payload);
  }

  useEffect(() => { void loadHealth(); }, []);
  const row = health?.row;
  const state = health?.state || "never_run";
  const attention = health ? needsLeirdueAdminAttention(state) : false;

  return <main className="container leirdueHealthPage">
    <section className="card">
      <AppBackButton fallback="/beta/admin" />
      <p className="eyebrow">Admin</p>
      <h1>Leirdue refresh health</h1>
      <p className="muted">Daily recent-result cache refresh status. Normal users do not see cache controls or health alerts.</p>
      {loading ? <p>Loading Leirdue cache refresh status…</p> : null}
      {message ? <p className="dangerText" role="alert">{message}</p> : null}
      {health ? <div className={attention ? "callout dangerCallout" : "callout"} role={attention ? "alert" : "status"}>
        <h2>{leirdueHealthSummary(state)}</h2>
        <p>{attention ? "Leirdue cache refresh needs attention. Recent results may be stale until this is fixed." : "Leirdue cache refresh is running as expected."}</p>
      </div> : null}
      {health ? <div className="compactSummaryGrid">
        <span><strong>{state.replace("_", " ")}</strong> status</span>
        <span><strong>{formatDateTime(row?.last_success_at)}</strong> last successful refresh</span>
        <span><strong>{formatDateTime(row?.finished_at || row?.started_at)}</strong> last attempted refresh</span>
        <span><strong>{row?.refreshed_count ?? 0}</strong> refreshed rows</span>
        <span><strong>{row?.error_count ?? 0}</strong> errors</span>
        <span><strong>Daily</strong> next expected run</span>
        <span><strong>{health.emailAlerts?.status === "configured" ? "Configured" : "Not configured"}</strong> email alerts</span>
      </div> : null}
      {health ? <dl className="detailList">
        <div><dt>Failure reason</dt><dd>{row?.failure_reason || "None recorded."}</dd></div>
        <div><dt>Affected scope</dt><dd>{affectedScopeSummary(row?.affected_scope)}</dd></div>
        <div><dt>Last alert email sent</dt><dd>{formatDateTime(row?.last_alert_email_sent_at)}</dd></div>
        <div><dt>Last alert email status</dt><dd>{row?.last_alert_email_status || (health.emailAlerts?.status === "not_configured" ? "Email alerts not configured" : "None recorded.")}</dd></div>
        <div><dt>Last alert email error</dt><dd>{row?.last_alert_email_error || "None recorded."}</dd></div>
        <div><dt>Last recovery email sent</dt><dd>{formatDateTime(row?.last_recovery_email_sent_at)}</dd></div>
        <div><dt>Stale rule</dt><dd>No successful refresh in the last {health.staleAfterHours} hours.</dd></div>
      </dl> : null}
      <div className="btns"><button type="button" className="secondary" onClick={() => void loadHealth()} disabled={loading}>{loading ? "Refreshing…" : "Refresh status"}</button><Link className="button secondary buttonLike" href="/admin/leirdue-cache">Open cache admin</Link></div>
    </section>
  </main>;
}
