"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { UserAccessProfile } from "@/lib/access";

type AccountAction = "pause" | "close" | "restore" | "remove";
type Sort = "newest" | "name" | "activity";
type UsersResponse = { users?: UserAccessProfile[]; count?: number; error?: string };

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)) : "—";
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

  function resetPage(update: () => void) { setPage(0); update(); }

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
              <div className="adminUserIdentity">
                <h3>{user.full_name || (user.access_status === "removed" ? "Removed account" : "Name missing")}</h3>
                <p className="small muted breakText">{user.email || "Email removed"}</p>
                <p className="small muted">Joined {formatDate(user.created_at)} · Updated {formatDate(user.updated_at)}</p>
              </div>
              <div className="adminUserControls">
                <span className="badge badgeBlue">{user.access_status === "approved" ? "Active" : user.access_status === "revoked" ? "Closed" : user.access_status}</span>
                {user.system_role !== "owner" && user.access_status !== "removed" && <div className="tableActions">
                  {user.access_status === "approved" && <button type="button" className="secondary smallButton" disabled={saving} onClick={() => void act(user, "pause")}>Pause</button>}
                  {user.access_status === "paused" && <button type="button" className="smallButton" disabled={saving} onClick={() => void act(user, "restore")}>Restore</button>}
                  {user.access_status !== "revoked" && <button type="button" className="secondary smallButton" disabled={saving} onClick={() => void act(user, "close")}>Close</button>}
                  {user.access_status === "revoked" && <button type="button" className="smallButton" disabled={saving} onClick={() => void act(user, "restore")}>Restore</button>}
                  <button type="button" className="danger smallButton" disabled={saving} onClick={() => void act(user, "remove")}>Remove account</button>
                </div>}
              </div>
            </article>)}
          </div>
        )}
        <div className="btns adminUserPagination">
          <button type="button" className="secondary" disabled={loading || page === 0} onClick={() => setPage((v) => v - 1)}>Previous</button>
          <span className="small muted">{count ? `${page * 50 + 1}–${Math.min((page + 1) * 50, count)} of ${count}` : "0 users"}</span>
          <button type="button" className="secondary" disabled={loading || (page + 1) * 50 >= count} onClick={() => setPage((v) => v + 1)}>Next</button>
        </div>
      </section>
    </main>
  );
}
