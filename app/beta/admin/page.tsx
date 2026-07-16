"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AccessStatus, BetaAccessListEntry, BetaFeedback, BetaFeedbackAdminStatus, BetaInterestSubmission, SystemRole, UserAccessProfile } from "@/lib/access";
import { canManageBetaAccess, isProtectedOwnerEmail, normalizeAccessEmail } from "@/lib/access";
import { supabase } from "@/lib/supabase/client";

const USER_COLUMNS = "user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by";
const ACCESS_LIST_COLUMNS = "id,email,full_name,access_status_to_grant,system_role_to_grant,note,created_at,created_by";
const INTEREST_COLUMNS = "id,name,email,country,main_discipline,level_comment,instagram_handle,admin_status,handled_at,handled_by,access_list_entry_id,admin_note,approval_email_sent_at,approval_email_error,created_at,updated_at";
const FEEDBACK_COLUMNS = "id,user_id,email,feedback_type,severity,message,page_path,user_agent,app_context,admin_status,admin_note,created_at,updated_at";

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
  if (!value) return "Not approved yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function displayName(fullName: string | null | undefined) {
  return fullName?.trim() || "Name missing";
}

function groupUsers(users: UserAccessProfile[], status: AccessStatus) {
  return users.filter((user) => user.access_status === status);
}

function isApprovedOwner(profile: Pick<UserAccessProfile, "access_status" | "system_role">) {
  return profile.access_status === "approved" && profile.system_role === "owner";
}

function userMatchesProfile(user: UserAccessProfile, profile: UserAccessProfile | null) {
  return Boolean(profile?.user_id === user.user_id || normalizeAccessEmail(profile?.email) === normalizeAccessEmail(user.email));
}

export default function BetaAdminPage() {
  const [me, setMe] = useState<UserAccessProfile | null>(null);
  const [users, setUsers] = useState<UserAccessProfile[]>([]);
  const [accessList, setAccessList] = useState<BetaAccessListEntry[]>([]);
  const [interestList, setInterestList] = useState<BetaInterestSubmission[]>([]);
  const [feedbackList, setFeedbackList] = useState<BetaFeedback[]>([]);
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

    const [{ data: userRows, error: usersError }, { data: accessRows, error: accessError }, { data: interestRows, error: interestError }, { data: feedbackRows, error: feedbackError }] = await Promise.all([
      supabase.from("user_access_profiles").select(USER_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("beta_access_list").select(ACCESS_LIST_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("beta_interest_submissions").select(INTEREST_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("beta_feedback").select(FEEDBACK_COLUMNS).order("created_at", { ascending: false }),
    ]);

    if (usersError || accessError || interestError || feedbackError) {
      setError(usersError?.message || accessError?.message || interestError?.message || feedbackError?.message || "Unable to load beta access data.");
      setLoading(false);
      return;
    }

    setUsers(sortByCreatedAtDesc((userRows ?? []) as UserAccessProfile[]));
    setAccessList(sortByCreatedAtDesc((accessRows ?? []) as BetaAccessListEntry[]));
    setInterestList(sortByCreatedAtDesc((interestRows ?? []) as BetaInterestSubmission[]));
    setFeedbackList(sortByCreatedAtDesc((feedbackRows ?? []) as BetaFeedback[]));
    setLoading(false);
  }

  async function updateUserAccess(user: UserAccessProfile, status: AccessStatus, role?: SystemRole) {
    const nextRole = isProtectedOwnerEmail(user.email) ? "owner" : role ?? user.system_role;
    const wouldRemoveOwnerAccess = isApprovedOwner(user) && (status !== "approved" || nextRole !== "owner");

    if (userMatchesProfile(user, me) && wouldRemoveOwnerAccess) {
      setError("You cannot revoke your own owner access.");
      setMessage("");
      return;
    }

    if (isProtectedOwnerEmail(user.email) && wouldRemoveOwnerAccess) {
      setError("Protected owner access cannot be downgraded or revoked.");
      setMessage("");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

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


  async function runInterestAction(entry: BetaInterestSubmission, action: "preapprove" | "resend_email" | "reject") {
    setSaving(true);
    setError("");
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSaving(false);
      setError("Please sign in again before changing beta interest status.");
      return;
    }
    const response = await fetch("/api/beta-admin/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ interestId: entry.id, action }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(result.error || "Beta interest action failed.");
      return;
    }
    if (result.warning) setError(result.warning);
    setMessage(action === "reject" ? "Interest submission marked rejected / not now." : result.emailStatus === "sent" ? "Access approved and approval email sent." : "Access approved. Approval email needs attention.");
    await loadAdminData();
  }

  async function updateFeedbackStatus(entry: BetaFeedback, status: BetaFeedbackAdminStatus) {
    setSaving(true);
    setError("");
    setMessage("");
    const { error: updateError } = await supabase.from("beta_feedback").update({ admin_status: status }).eq("id", entry.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Feedback status updated.");
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
          <p>Use this page to review beta users and manage access. Owner access is protected and can only be granted by exact email match.</p>
          <p className="small muted">Auth-only fields such as email confirmation and last sign-in are not shown here because they require a secure server-side Supabase admin endpoint.</p>
          {me ? (
            <p className="small muted">
              Signed in as {me.email || "unknown email"} · {me.system_role} · {me.access_status}
            </p>
          ) : null}
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
          <UserSection title="Pending users" users={grouped.pending} currentUser={me} saving={saving} onUpdate={updateUserAccess} />
          <UserSection title="Approved users" users={grouped.approved} currentUser={me} saving={saving} onUpdate={updateUserAccess} />
          <UserSection title="Rejected / revoked users" users={grouped.restricted} currentUser={me} saving={saving} onUpdate={updateUserAccess} />


          <section className="card">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Interest list</p>
                <h2>Closed beta registrations</h2>
                <p className="small muted">Pre-approve interest here. This grants regular beta user access only and never creates Supabase auth users.</p>
              </div>
              <span className="countPill">{interestList.length}</span>
            </div>
            {interestList.length === 0 ? (
              <div className="emptyState">No beta interest submissions yet.</div>
            ) : (
              <div className="accessTableWrap">
                <table className="accessTable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Email</th>
                      <th>Country</th>
                      <th>Discipline</th>
                      <th>Instagram</th>
                      <th>Comment</th>
                      <th>Submitted</th>
                      <th>Email status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interestList.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.name}</td>
                        <td>{entry.admin_status}</td>
                        <td>{entry.email}</td>
                        <td>{entry.country}</td>
                        <td>{entry.main_discipline}</td>
                        <td>{entry.instagram_handle || "—"}</td>
                        <td>{entry.level_comment || "—"}</td>
                        <td>{formatDate(entry.created_at)}</td>
                        <td>{entry.approval_email_sent_at ? `Sent ${formatDate(entry.approval_email_sent_at)}` : entry.approval_email_error ? `Failed: ${entry.approval_email_error}` : "Not sent"}</td>
                        <td>
                          <div className="tableActions">
                            <button type="button" className="smallButton" disabled={saving || entry.admin_status === "pre_approved" || entry.admin_status === "approved_existing_user"} onClick={() => runInterestAction(entry, "preapprove")}>Pre-approve</button>
                            {(entry.admin_status === "pre_approved" || entry.admin_status === "approved_existing_user") && <button type="button" className="secondary smallButton" disabled={saving} onClick={() => runInterestAction(entry, "resend_email")}>Resend approval email</button>}
                            <button type="button" className="danger smallButton" disabled={saving || entry.admin_status === "rejected"} onClick={() => runInterestAction(entry, "reject")}>Reject / Not now</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Beta feedback</p>
                <h2>Internal app feedback</h2>
                <p className="small muted">Newest in-app beta feedback. This replaces mailto/Outlook feedback.</p>
              </div>
              <span className="countPill">{feedbackList.length}</span>
            </div>
            {feedbackList.length === 0 ? (
              <div className="emptyState">No beta feedback yet.</div>
            ) : (
              <div className="accessTableWrap">
                <table className="accessTable">
                  <thead><tr><th>Type</th><th>Severity</th><th>Email/user</th><th>Page</th><th>Message</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
                  <tbody>{feedbackList.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.feedback_type}</td>
                      <td>{entry.severity}</td>
                      <td>{entry.email || entry.user_id || "—"}</td>
                      <td>{entry.page_path || "—"}</td>
                      <td>{entry.message}</td>
                      <td>{entry.admin_status}</td>
                      <td>{formatDate(entry.created_at)}</td>
                      <td><div className="tableActions">
                        <button type="button" className="smallButton" disabled={saving || entry.admin_status === "reviewed"} onClick={() => updateFeedbackStatus(entry, "reviewed")}>Reviewed</button>
                        <button type="button" className="secondary smallButton" disabled={saving || entry.admin_status === "resolved"} onClick={() => updateFeedbackStatus(entry, "resolved")}>Resolved</button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

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
                  <p className="small muted">Owner/admin is granted only by exact email match. Full-name entries can approve user access only.</p>
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
                        <td>{displayName(entry.full_name)}</td>
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
  currentUser,
  saving,
  onUpdate,
}: {
  title: string;
  users: UserAccessProfile[];
  currentUser: UserAccessProfile | null;
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
        <>
          <div className="accessCardList">
            {users.map((user) => (
              <UserAccessCard key={user.user_id} user={user} currentUser={currentUser} saving={saving} onUpdate={onUpdate} />
            ))}
          </div>
          <div className="accessTableWrap userAccessTableWrap">
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
                const selfOwner = userMatchesProfile(user, currentUser) && isApprovedOwner(user);
                const lockedOwner = protectedOwner || selfOwner;
                const lockMessage = selfOwner
                  ? "You cannot revoke your own owner access."
                  : protectedOwner
                    ? "Protected owner access cannot be downgraded or revoked."
                    : "";
                const restoreRole = protectedOwner ? "owner" : user.system_role;

                return (
                  <tr key={user.user_id}>
                    <td>{user.email || "—"}</td>
                    <td>{displayName(user.full_name)}</td>
                    <td><span className="badge badgeBlue">{user.access_status}</span></td>
                    <td><span className={user.system_role === "owner" ? "badge badgeGold" : "badge"}>{user.system_role}</span></td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>{formatDate(user.approved_at)}</td>
                    <td>
                      {lockMessage ? <p className="small muted">{lockMessage}</p> : null}
                      <div className="tableActions">
                        {user.access_status === "pending" ? (
                          <>
                            <button type="button" className="smallButton" disabled={saving} onClick={() => onUpdate(user, "approved", restoreRole)}>
                              Approve
                            </button>
                            <button type="button" className="secondary smallButton" disabled={saving || lockedOwner} onClick={() => onUpdate(user, "rejected", "user")}>
                              Reject
                            </button>
                          </>
                        ) : null}
                        {user.access_status === "approved" ? (
                          <>
                            <button type="button" className="secondary smallButton" disabled={saving || lockedOwner} onClick={() => onUpdate(user, "rejected", "user")}>
                              Reject
                            </button>
                            <button type="button" className="danger smallButton" disabled={saving || lockedOwner} onClick={() => onUpdate(user, "revoked", user.system_role)}>
                              Revoke
                            </button>
                          </>
                        ) : null}
                        {user.access_status === "rejected" || user.access_status === "revoked" ? (
                          <button type="button" className="smallButton" disabled={saving} onClick={() => onUpdate(user, "approved", restoreRole)}>
                            Restore / Approve again
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}

function UserAccessCard({
  user,
  currentUser,
  saving,
  onUpdate,
}: {
  user: UserAccessProfile;
  currentUser: UserAccessProfile | null;
  saving: boolean;
  onUpdate: (user: UserAccessProfile, status: AccessStatus, role?: SystemRole) => Promise<void>;
}) {
  const protectedOwner = isProtectedOwnerEmail(user.email);
  const selfOwner = userMatchesProfile(user, currentUser) && isApprovedOwner(user);
  const lockedOwner = protectedOwner || selfOwner;
  const lockMessage = selfOwner
    ? "You cannot revoke your own owner access."
    : protectedOwner
      ? "Protected owner access cannot be downgraded or revoked."
      : "";
  const restoreRole = protectedOwner ? "owner" : user.system_role;

  return (
    <article className="accessUserCard">
      <div className="accessUserCardHeader">
        <div>
          <h3>{displayName(user.full_name)}</h3>
          <p className="small muted">{user.email || "No email"}</p>
        </div>
        <span className="badge badgeBlue">{user.access_status}</span>
      </div>
      <dl className="accessUserDetails">
        <div><dt>Role</dt><dd><span className={user.system_role === "owner" ? "badge badgeGold" : "badge"}>{user.system_role}</span></dd></div>
        <div><dt>Created</dt><dd>{formatDate(user.created_at)}</dd></div>
        <div><dt>Approved</dt><dd>{formatDate(user.approved_at)}</dd></div>
      </dl>
      {lockMessage ? <p className="small muted">{lockMessage}</p> : null}
      <div className="tableActions accessCardActions">
        {user.access_status === "pending" ? (
          <>
            <button type="button" className="smallButton" disabled={saving} onClick={() => onUpdate(user, "approved", restoreRole)}>Approve</button>
            <button type="button" className="secondary smallButton" disabled={saving || lockedOwner} onClick={() => onUpdate(user, "rejected", "user")}>Reject</button>
          </>
        ) : null}
        {user.access_status === "approved" ? (
          <>
            <button type="button" className="secondary smallButton" disabled={saving || lockedOwner} onClick={() => onUpdate(user, "rejected", "user")}>Reject</button>
            <button type="button" className="danger smallButton" disabled={saving || lockedOwner} onClick={() => onUpdate(user, "revoked", user.system_role)}>Revoke</button>
          </>
        ) : null}
        {user.access_status === "rejected" || user.access_status === "revoked" ? (
          <button type="button" className="smallButton" disabled={saving} onClick={() => onUpdate(user, "approved", restoreRole)}>Restore / Approve again</button>
        ) : null}
      </div>
    </article>
  );
}
