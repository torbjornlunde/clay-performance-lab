"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { UserAccessProfile } from "@/lib/access";
import { getCountryLabel } from "@/lib/profile";
import { FEATURE_CATALOG } from "@/lib/entitlements/features";

type AccountAction = "pause" | "close" | "restore" | "remove";
type Sort = "newest" | "name" | "activity";
type UsersResponse = { users?: UserAccessProfile[]; count?: number; error?: string };
type UserDetails = {
  account: UserAccessProfile;
  shooterProfile: { shooter_name: string | null; first_name: string | null; last_name: string | null; country: string | null; my_disciplines: string[] | null; shooter_directory_visible: boolean | null; created_at: string; updated_at: string } | null;
  entitlement: { plan: string; status: string; valid_until: string | null } | null;
  authentication: { emailConfirmedAt: string | null; lastSignInAt: string | null } | null;
  activity: { sessions: number | null; competitions: number | null; trainingSessions: number | null; scoreSheets: number | null; trainingLogs: number | null; scorecardImports: number | null; weapons: number | null; ammunition: number | null; privateNotes: number | null; feedback: number | null; events30Days: number | null; recentEvents: { event_name: string; feature: string | null; occurred_at: string }[] };
  aiUsage: { total: number | null; byFeature: { featureKey: string; count: number; lastUsedAt: string }[]; limitedBreakdown: boolean };
  unavailable: string[];
};

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function countLabel(value: number | null) { return value === null ? "Unavailable" : value.toLocaleString("en"); }

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt>{label}</dt><dd className="breakText">{value === null || value === undefined || value === "" ? "—" : value}</dd></div>;
}

function UserDetailPanel({ user, saving, act, version }: { user: UserAccessProfile; saving: boolean; act: (user: UserAccessProfile, action: AccountAction) => Promise<void>; version: number }) {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setDetails(null);
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (!data.session?.access_token) throw new Error("Sign in to view account details.");
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.user_id)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal });
      const result = await response.json() as UserDetails & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load account details.");
      if (!controller.signal.aborted) setDetails(result);
    })().catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load account details."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user.user_id, version, retry]);

  const account = details?.account || user;
  const profile = details?.shooterProfile;
  const activity = details?.activity;
  return <div className="adminUserDetails" id={`user-details-${user.user_id}`}>
    {loading && <p role="status">Loading account details...</p>}
    {error && <div><p className="error" role="alert">{error}</p><button type="button" className="secondary smallButton" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {details && !loading && <>
      <div className="adminUserDetailSections">
        <section><h4>Profile and account</h4><dl className="adminUserDetailGrid">
          <DetailItem label="Email" value={account.email || "Email removed"} />
          <DetailItem label="Profile name" value={[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.shooter_name} />
          <DetailItem label="Profile country (self-reported)" value={getCountryLabel(profile?.country) || profile?.country} />
          <DetailItem label="Disciplines" value={profile?.my_disciplines?.join(", ")} />
          <DetailItem label="Visible in shooter directory" value={profile ? (profile.shooter_directory_visible ? "Yes" : "No") : null} />
          <DetailItem label="Status" value={account.access_status === "approved" ? "Active" : account.access_status === "revoked" ? "Closed" : account.access_status} />
          <DetailItem label="Role" value={account.system_role} />
          <DetailItem label="Account type" value={account.account_type} />
          <DetailItem label="Plan" value={details.entitlement?.plan} />
          <DetailItem label="Plan status" value={details.entitlement?.status} />
          <DetailItem label="Plan valid until" value={formatDate(details.entitlement?.valid_until)} />
          <DetailItem label="Joined" value={formatDate(account.created_at)} />
          <DetailItem label="Approved" value={formatDate(account.approved_at)} />
          <DetailItem label="Updated" value={formatDate(account.updated_at)} />
          {account.removed_at && <DetailItem label="Removed" value={formatDate(account.removed_at)} />}
          <DetailItem label="Email confirmed" value={details.authentication ? formatDateTime(details.authentication.emailConfirmedAt) : "Unavailable"} />
          <DetailItem label="Last sign-in" value={details.authentication ? formatDateTime(details.authentication.lastSignInAt) : "Unavailable"} />
          <DetailItem label="User ID" value={account.user_id} />
        </dl></section>
        <section><h4>Recorded use</h4><dl className="adminUserDetailGrid">
          <DetailItem label="Sessions" value={countLabel(activity!.sessions)} />
          <DetailItem label="Competitions" value={countLabel(activity!.competitions)} />
          <DetailItem label="Training sessions" value={countLabel(activity!.trainingSessions)} />
          <DetailItem label="Training score sheets" value={countLabel(activity!.scoreSheets)} />
          <DetailItem label="Training logs" value={countLabel(activity!.trainingLogs)} />
          <DetailItem label="Scorecard imports" value={countLabel(activity!.scorecardImports)} />
          <DetailItem label="Weapons" value={countLabel(activity!.weapons)} />
          <DetailItem label="Ammunition profiles" value={countLabel(activity!.ammunition)} />
          <DetailItem label="Private notes (count only)" value={countLabel(activity!.privateNotes)} />
          <DetailItem label="Feedback entries" value={countLabel(activity!.feedback)} />
          <DetailItem label="App events, last 30 days" value={countLabel(activity!.events30Days)} />
        </dl><p className="small muted">These are saved records and logged events, not time spent in the app. Older or untracked activity may not be included.</p></section>
        <section><h4>AI use</h4><p>{countLabel(details.aiUsage.total)} recorded successful uses</p>
          {details.aiUsage.byFeature.length > 0 && <dl className="adminUserDetailGrid">{details.aiUsage.byFeature.map((entry) => <DetailItem key={entry.featureKey} label={FEATURE_CATALOG[entry.featureKey as keyof typeof FEATURE_CATALOG]?.title || entry.featureKey} value={`${entry.count} · Last used ${formatDateTime(entry.lastUsedAt)}`} />)}</dl>}
          {details.aiUsage.limitedBreakdown && <p className="small muted">Feature breakdown shows only the 500 most recent AI uses; total includes all recorded uses.</p>}
        </section>
        <section><h4>Recent app events</h4>{activity!.recentEvents.length ? <ul className="adminUserRecentEvents">{activity!.recentEvents.map((event, index) => <li key={`${event.occurred_at}-${index}`}><span>{event.event_name}{event.feature ? ` · ${event.feature}` : ""}</span><time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time></li>)}</ul> : <p className="small muted">No recorded events.</p>}</section>
      </div>
      {details.unavailable.length > 0 && <p className="small muted" role="status">Some data could not be loaded: {details.unavailable.join(", ")}.</p>}
      {account.system_role !== "owner" && account.access_status !== "removed" && <div className="tableActions adminUserDetailActions">
        {account.access_status === "approved" && <button type="button" className="secondary smallButton" disabled={saving} onClick={() => void act(account, "pause")}>Pause</button>}
        {account.access_status === "paused" && <button type="button" className="smallButton" disabled={saving} onClick={() => void act(account, "restore")}>Restore</button>}
        {account.access_status !== "revoked" && <button type="button" className="secondary smallButton" disabled={saving} onClick={() => void act(account, "close")}>Close</button>}
        {account.access_status === "revoked" && <button type="button" className="smallButton" disabled={saving} onClick={() => void act(account, "restore")}>Restore</button>}
        <button type="button" className="danger smallButton" disabled={saving} onClick={() => void act(account, "remove")}>Remove account</button>
      </div>}
    </>}
  </div>;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserAccessProfile[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [direction, setDirection] = useState("desc");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    if (signal.aborted) return;
    const token = data.session?.access_token;
    if (!token) { setError("Sign in to manage users."); setLoading(false); return; }
    const params = new URLSearchParams({ q: search.trim(), status, sort, direction, page: String(page) });
    const response = await fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
    const result = await response.json().catch(() => ({})) as UsersResponse;
    if (signal.aborted) return;
    if (!response.ok) setError(result.error || "Could not load users.");
    else { setUsers(result.users || []); setCount(result.count || 0); }
    setLoading(false);
  }, [search, status, sort, direction, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal).catch(() => { if (!controller.signal.aborted) { setError("Could not load users."); setLoading(false); } }); }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, version]);

  async function act(user: UserAccessProfile, action: AccountAction) {
    const email = user.email || "";
    let confirmEmail: string | null = null;
    if (action === "remove") {
      confirmEmail = window.prompt(`Remove the sign-in account for ${email}? Type the exact email address to confirm. This cannot be undone. Historical competition data may be retained.`);
      if (confirmEmail !== email || !email) return;
    } else if (!window.confirm(`${action === "close" ? "Close" : action === "pause" ? "Pause" : "Restore"} ${email || user.full_name || "this account"}?`)) return;

    setSaving(true);
    setError("");
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setError("Your session expired. Sign in again."); setSaving(false); return; }
    const response = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: user.user_id, action, confirmEmail }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error || "Could not update this account.");
    else { setMessage(`Account ${action === "remove" ? "removed" : action === "restore" ? "restored" : action === "close" ? "closed" : "paused"}.`); setVersion((v) => v + 1); }
    setSaving(false);
  }

  function resetPage(update: () => void) { setPage(0); setExpandedId(null); update(); }

  return (
    <main>
      <section className="heroCard">
        <p className="eyebrow">Admin</p>
        <h2>Users</h2>
        <p>Find accounts and manage access. Paused accounts can be restored; closed accounts cannot use the app until restored.</p>
      </section>
      <section className="card">
        <div className="sectionHeader"><h2>Accounts</h2><span className="countPill">{count}</span></div>
        <div className="adminUserFilters">
          <label>Search by name or email<input type="search" value={search} onChange={(event) => resetPage(() => setSearch(event.target.value))} placeholder="Search users" /></label>
          <label>Status<select value={status} onChange={(event) => resetPage(() => setStatus(event.target.value))}>
            <option value="all">All</option><option value="approved">Active</option><option value="paused">Paused</option>
            <option value="revoked">Closed</option><option value="removed">Removed</option><option value="rejected">Rejected (legacy)</option><option value="pending">Pending (legacy)</option>
          </select></label>
          <label>Sort by<select value={sort} onChange={(event) => resetPage(() => setSort(event.target.value as Sort))}>
            <option value="newest">Created</option><option value="activity">Last updated</option><option value="name">Name</option>
          </select></label>
          <label>Order<select value={direction} onChange={(event) => resetPage(() => setDirection(event.target.value))}>
            <option value="desc">Newest / Z–A</option><option value="asc">Oldest / A–Z</option>
          </select></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        {loading ? <p>Loading users...</p> : users.length === 0 ? <p className="emptyState">No matching users.</p> : (
          <div className="adminUserList">
            {users.map((user) => <article className="subcard adminUserRow" key={user.user_id}>
              <h3><button type="button" className="adminUserNameButton" aria-expanded={expandedId === user.user_id} aria-controls={expandedId === user.user_id ? `user-details-${user.user_id}` : undefined} onClick={() => setExpandedId((current) => current === user.user_id ? null : user.user_id)}><span>{user.full_name || (user.access_status === "removed" ? "Removed account" : "Name missing")}</span><span aria-hidden="true">{expandedId === user.user_id ? "−" : "+"}</span></button></h3>
              {expandedId === user.user_id && <UserDetailPanel user={user} saving={saving} act={act} version={version} />}
            </article>)}
          </div>
        )}
        <div className="btns adminUserPagination">
          <button type="button" className="secondary" disabled={loading || page === 0} onClick={() => { setExpandedId(null); setPage((v) => v - 1); }}>Previous</button>
          <span className="small muted">{count ? `${page * 50 + 1}–${Math.min((page + 1) * 50, count)} of ${count}` : "0 users"}</span>
          <button type="button" className="secondary" disabled={loading || (page + 1) * 50 >= count} onClick={() => { setExpandedId(null); setPage((v) => v + 1); }}>Next</button>
        </div>
      </section>
    </main>
  );
}
