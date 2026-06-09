"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AccessStatus, BetaAccessListEntry, SystemRole, UserAccessProfile } from "@/lib/access";
import { canManageBetaAccess, isProtectedOwnerEmail } from "@/lib/access";
import { supabase } from "@/lib/supabase/client";

const USER_COLUMNS = "user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by";
const ACCESS_LIST_COLUMNS = "id,email,full_name,access_status_to_grant,system_role_to_grant,note,created_at,created_by";

type AccessListForm = {
  email: string;
  fullName: string;
  role: SystemRole;
  note: string;
};

function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function groupUsers(users: UserAccessProfile[], status: AccessStatus) {
  return users.filter((user) => user.access_status === status);
}

export default function BetaAdminPage() {
  const [me, setMe] = useState<UserAccessProfile | null>(null);
  const [users, setUsers] = useState<UserAccessProfile[]>([]);
  const [accessList, setAccessList] = useState<BetaAccessListEntry[]>([]);
  const [form, setForm] = useState<AccessListForm>({ email: "", fullName: "", role: "user", note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const grouped = useMemo(
    () => ({
      pending: groupUsers(users, "pending"),
      approved: groupUsers(users, "approved"),
      restricted: users.filter((user) => user.access_status === "rejected" || user.access_status === "revoked"),
    }),
    [users],
  );

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    setLoading(true);
    setError("");
    setMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError(userError?.message || "Login is required.");
      setLoading(false);
      return;
    }

    await supabase.rpc("sync_my_access_profile");
    const { data: myProfile, error: myProfileError } = await supabase
      .from("user_access_profiles")
      .select(USER_COLUMNS)
      .eq("user_id", userData.user.id)
      .maybeSingle<UserAccessProfile>();

    if (myProfileError) {
      setError(myProfileError.message);
      setLoading(false);
      return;
    }

    setMe(myProfile ?? null);
    if (!canManageBetaAccess(myProfile)) {
      setError("You do not have permission to manage beta access.");
      setLoading(false);
      return;
    }

    const [{ data: userRows, error: usersError }, { data: accessRows, error: accessError }] = await Promise.all([
      supabase.from("user_access_profiles").select(USER_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("beta_access_list").select(ACCESS_LIST_COLUMNS).order("created_at", { ascending: false }),
    ]);

    if (usersError || accessError) {
      setError(usersError?.message || accessError?.message || "Unable to load beta access data.");
      setLoading(false);
      return;
    }

    setUsers(sortByCreatedAtDesc((userRows ?? []) as UserAccessProfile[]));
    setAccessList(sortByCreatedAtDesc((accessRows ?? []) as BetaAccessListEntry[]));
    setLoading(false);
  }

  async function updateUserAccess(user: UserAccessProfile, status: AccessStatus, role?: SystemRole) {
    setSaving(true);
    setError("");
    setMessage("");

    const nextRole = isProtectedOwnerEmail(user.email) ? "owner" : role ?? user.system_role;
    const { error: updateError } = await supabase.rpc("admin_update_user_access", {
      target_user_id: user.user_id,
      new_access_status: status,
      new_system_role: nextRole,
    });

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("User access updated.");
    await loadAdminData();
  }

  async function addAccessListEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.email.trim() && !form.fullName.trim()) {
      setError("Add an email or a full name.");
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from("beta_access_list").insert({
      email: form.email.trim() || null,
      full_name: form.fullName.trim() || null,
      access_status_to_grant: "approved",
      system_role_to_grant: form.role,
      note: form.note.trim() || null,
      created_by: me?.user_id ?? null,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm({ email: "", fullName: "", role: "user", note: "" });
    setMessage("Pre-approved access entry added.");
    await loadAdminData();
  }

  async function removeAccessListEntry(entry: BetaAccessListEntry) {
    setSaving(true);
    setError("");
    setMessage("");

    const { error: deleteError } = await supabase.from("beta_access_list").delete().eq("id", entry.id);
    setSaving(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Pre-approved access entry removed.");
    await loadAdminData();
  }

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Closed beta</p>
          <h2>Beta access approvals</h2>
          <p>Approve signed-in users and manage exact email or full-name pre-approvals.</p>
        </div>
        <button type="button" className="secondary" onClick={loadAdminData} disabled={loading || saving}>
          Refresh
        </button>
      </div>

      {loading && <div className="card">Loading beta access data...</div>}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {!loading && canManageBetaAccess(me) && (
        <>
          <UserSection title="Pending users" users={grouped.pending} saving={saving} onUpdate={updateUserAccess} />
          <UserSection title="Approved users" users={grouped.approved} saving={saving} onUpdate={updateUserAccess} />
          <UserSection title="Rejected / revoked users" users={grouped.restricted} saving={saving} onUpdate={updateUserAccess} />

          <section className="card">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Access list</p>
                <h2>Pre-approved users</h2>
              </div>
            </div>

            <form onSubmit={addAccessListEntry} className="subcard">
              <div className="row">
                <div>
                  <label htmlFor="accessEmail">Email</label>
                  <input id="accessEmail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </div>
                <div>
                  <label htmlFor="accessFullName">Full name</label>
                  <input id="accessFullName" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
                </div>
              </div>
              <div className="row">
                <div>
                  <label htmlFor="accessRole">Role to grant</label>
                  <select id="accessRole" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as SystemRole })}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <p className="small muted">Owner/admin is granted only by exact email match. Name matches are approved as user only.</p>
                </div>
                <div>
                  <label htmlFor="accessNote">Note</label>
                  <input id="accessNote" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
                </div>
              </div>
              <div className="btns">
                <button type="submit" disabled={saving}>Add pre-approved entry</button>
              </div>
            </form>

            {accessList.length === 0 ? (
              <div className="emptyState">No pre-approved access entries yet.</div>
            ) : (
              <div className="accessTableWrap">
                <table className="accessTable">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Full name</th>
                      <th>Grants</th>
                      <th>Note</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessList.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.email || "—"}</td>
                        <td>{entry.full_name || "—"}</td>
                        <td>Approved / {entry.system_role_to_grant}</td>
                        <td>{entry.note || "—"}</td>
                        <td>{formatDate(entry.created_at)}</td>
                        <td>
                          <button type="button" className="danger smallButton" disabled={saving || isProtectedOwnerEmail(entry.email)} onClick={() => removeAccessListEntry(entry)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function UserSection({
  title,
  users,
  saving,
  onUpdate,
}: {
  title: string;
  users: UserAccessProfile[];
  saving: boolean;
  onUpdate: (user: UserAccessProfile, status: AccessStatus, role?: SystemRole) => Promise<void>;
}) {
  return (
    <section className="card">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Users</p>
          <h2>{title}</h2>
        </div>
        <span className="countPill">{users.length}</span>
      </div>
      {users.length === 0 ? (
        <div className="emptyState">No users in this group.</div>
      ) : (
        <div className="accessTableWrap">
          <table className="accessTable">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Role</th>
                <th>Created</th>
                <th>Approved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const protectedOwner = isProtectedOwnerEmail(user.email);
                return (
                  <tr key={user.user_id}>
                    <td>{user.email || "—"}</td>
                    <td>{user.full_name || "—"}</td>
                    <td><span className="badge badgeBlue">{user.access_status}</span></td>
                    <td><span className={user.system_role === "owner" ? "badge badgeGold" : "badge"}>{user.system_role}</span></td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>{formatDate(user.approved_at)}</td>
                    <td>
                      <div className="tableActions">
                        <button type="button" className="smallButton" disabled={saving} onClick={() => onUpdate(user, "approved", protectedOwner ? "owner" : user.system_role)}>
                          Approve
                        </button>
                        <button type="button" className="secondary smallButton" disabled={saving || protectedOwner} onClick={() => onUpdate(user, "rejected", "user")}>
                          Reject
                        </button>
                        <button type="button" className="danger smallButton" disabled={saving || protectedOwner} onClick={() => onUpdate(user, "revoked", user.system_role)}>
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
