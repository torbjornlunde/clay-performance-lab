"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { recordAnalyticsEvent } from "@/lib/analytics";

type CountItem = { name: string; count: number };
type DayItem = { date: string; count: number };
type Summary = {
  totalEvents7d: number; activeUsers7d: number; activeUsers30d: number; recentErrors7d: number;
  eventsByDay14d: DayItem[]; topEventNames14d: CountItem[]; featureUsage14d: CountItem[];
  importFunnel14d: CountItem[]; scorecardFunnel14d: CountItem[]; trainingUsage14d: CountItem[];
};

function CountTable({ title, items }: { title: string; items: CountItem[] }) {
  return <section className="card analyticsPanel"><h2>{title}</h2>{items.length ? <table className="analyticsTable"><tbody>{items.map((item) => <tr key={item.name}><th scope="row">{item.name.replaceAll("_", " ")}</th><td>{item.count}</td></tr>)}</tbody></table> : <p className="muted">No events yet.</p>}</section>;
}

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadSummary() {
    setLoading(true); setMessage("");
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    const response = await fetch("/api/admin/analytics/summary", { headers });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) { setMessage(payload.error || "Could not load analytics summary."); return; }
    setSummary(payload);
  }

  useEffect(() => { void loadSummary(); void recordAnalyticsEvent(supabase, "app_page_view", { route: "/admin/analytics", feature: "admin_analytics" }); }, []);

  return <main className="container adminAnalyticsPage">
    <section className="card">
      <p className="eyebrow">Admin</p>
      <h1>Product usage analytics</h1>
      <p className="muted">Privacy-limited first-party beta insight. This dashboard shows aggregates only, not raw event dumps.</p>
      <button type="button" className="secondary" onClick={() => void loadSummary()} disabled={loading}>{loading ? "Refreshing…" : "Refresh analytics"}</button>
      {message ? <p className="dangerText" role="alert">{message}</p> : null}
    </section>
    {summary ? <>
      <section className="analyticsMetricGrid" aria-label="Analytics overview">
        <div className="card metricCard"><span>Active users 7d</span><strong>{summary.activeUsers7d}</strong></div>
        <div className="card metricCard"><span>Active users 30d</span><strong>{summary.activeUsers30d}</strong></div>
        <div className="card metricCard"><span>Events 7d</span><strong>{summary.totalEvents7d}</strong></div>
        <div className="card metricCard"><span>Errors 7d</span><strong>{summary.recentErrors7d}</strong></div>
      </section>
      <section className="analyticsGrid">
        <CountTable title="Top features" items={summary.featureUsage14d} />
        <CountTable title="Top events" items={summary.topEventNames14d} />
        <CountTable title="Leirdue import funnel" items={summary.importFunnel14d} />
        <CountTable title="Scorecard funnel" items={summary.scorecardFunnel14d} />
        <CountTable title="Training score sheet usage" items={summary.trainingUsage14d} />
        <section className="card analyticsPanel"><h2>Events by day</h2><table className="analyticsTable"><tbody>{summary.eventsByDay14d.map((item) => <tr key={item.date}><th scope="row">{item.date}</th><td>{item.count}</td></tr>)}</tbody></table></section>
      </section>
    </> : loading ? <section className="card"><p>Loading analytics summary…</p></section> : null}
  </main>;
}
