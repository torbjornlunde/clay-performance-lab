"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AccessStatus, BetaAccessListEntry, BetaInterestSubmission, SystemRole, UserAccessProfile } from "@/lib/access";
import { canManageBetaAccess, isProtectedOwnerEmail, normalizeAccessEmail } from "@/lib/access";
import { supabase } from "@/lib/supabase/client";

const USER_COLUMNS = "user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by";
const ACCESS_LIST_COLUMNS = "id,email,full_name,access_status_to_grant,system_role_to_grant,note,created_at,created_by";
const INTEREST_COLUMNS = "id,name,email,country,main_discipline,level_comment,instagram_handle,admin_status,handled_at,handled_by,access_list_entry_id,admin_note,approval_email_sent_at,approval_email_error,created_at,updated_at";

type AccessListForm = {
  email: string;
  fullName: string;
  role: SystemRole;
  note: string;
};


type ApprovalInboxItem = {
  key: string;
  normalizedEmail: string;
  user: UserAccessProfile | null;
  interest: BetaInterestSubmission | null;
  accessEntry: BetaAccessListEntry | null;
  fallbackDate: string;
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function latestDate(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) || new Date(0).toISOString();
}

function buildApprovalInbox(users: UserAccessProfile[], interests: BetaInterestSubmission[], accessList: BetaAccessListEntry[]) {
  const map = new Map<string, ApprovalInboxItem>();
  const ensureItem = (key: string, normalizedEmail: string, fallbackDate: string) => {
    const existing = map.get(key);
    if (existing) return existing;
    const item: ApprovalInboxItem = { key, normalizedEmail, user: null, interest: null, accessEntry: null, fallbackDate };
    map.set(key, item);
    return item;
  };

  users.forEach((user) => {
    const normalizedEmail = normalizeAccessEmail(user.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `user:${user.user_id}`;
    const item = ensureItem(key, normalizedEmail, user.created_at);
    item.user = item.user ? [item.user, user].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] : user;
    item.fallbackDate = latestDate(item.fallbackDate, user.created_at);
  });

  interests.forEach((interest) => {
    const normalizedEmail = normalizeAccessEmail(interest.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `interest:${interest.id}`;
    const item = ensureItem(key, normalizedEmail, interest.created_at);
    item.interest = item.interest ? [item.interest, interest].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : interest;
    item.fallbackDate = latestDate(item.fallbackDate, interest.created_at);
  });

  accessList.forEach((entry) => {
    const normalizedEmail = normalizeAccessEmail(entry.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `access:${entry.id}`;
    const item = ensureItem(key, normalizedEmail, entry.created_at);
    item.accessEntry = item.accessEntry ? [item.accessEntry, entry].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : entry;
    item.fallbackDate = latestDate(item.fallbackDate, entry.created_at);
  });

  return Array.from(map.values()).sort((a, b) => b.fallbackDate.localeCompare(a.fallbackDate));
}

type EmailConfigStatus = {
  configured: boolean;
  hasResendApiKey: boolean;
  hasFromAddress: boolean;
  hasSiteUrl: boolean;
  fromAddressConfigured: boolean;
  fromAddress: string | null;
  siteUrlPreview: string | null;
  missing: string[];
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
  const [form, setForm] = useState<AccessListForm>({ email: "", fullName: "", role: "user", note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfigStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const approvalInbox = useMemo(() => buildApprovalInbox(users, interestList, accessList), [users, interestList, accessList]);

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

    const [{ data: userRows, error: usersError }, { data: accessRows, error: accessError }, { data: interestRows, error: interestError }, emailConfigResult] = await Promise.all([
      supabase.from("user_access_profiles").select(USER_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("beta_access_list").select(ACCESS_LIST_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("beta_interest_submissions").select(INTEREST_COLUMNS).order("created_at", { ascending: false }),
      fetchEmailConfig(),
    ]);

    if (usersError || accessError || interestError) {
      setError(usersError?.message || accessError?.message || interestError?.message || "Unable to load beta access data.");
      setLoading(false);
      return;
    }

    setUsers(sortByCreatedAtDesc((userRows ?? []) as UserAccessProfile[]));
    setAccessList(sortByCreatedAtDesc((accessRows ?? []) as BetaAccessListEntry[]));
    setInterestList(sortByCreatedAtDesc((interestRows ?? []) as BetaInterestSubmission[]));
    setEmailConfig(emailConfigResult);
    setLoading(false);
  }

  async function fetchEmailConfig() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    const response = await fetch("/api/beta-admin/test-approval-email", { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    return response.ok ? (result.config as EmailConfigStatus) : null;
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


  async function approveInboxItem(item: ApprovalInboxItem) {
    if (item.interest) {
      await runInterestAction(item.interest, "preapprove");
      return;
    }
    if (item.user) await updateUserAccess(item.user, "approved", isProtectedOwnerEmail(item.user.email) ? "owner" : item.user.system_role);
  }

  async function rejectInboxItem(item: ApprovalInboxItem) {
    if (item.interest) {
      await runInterestAction(item.interest, "reject");
      return;
    }
    if (item.user) await updateUserAccess(item.user, "rejected", "user");
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

  async function sendTestApprovalEmail() {
    setTestingEmail(true);
    setError("");
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setTestingEmail(false);
      setError("Please sign in again before sending a test email.");
      return;
    }
    const response = await fetch("/api/beta-admin/test-approval-email", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    setTestingEmail(false);
    if (result.config) setEmailConfig(result.config);
    if (!response.ok) {
      setError(result.error || "Test approval email failed.");
      return;
    }
    setMessage(result.message || "Test email sent.");
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
          <ApprovalInboxSection items={approvalInbox} saving={saving} onApprove={approveInboxItem} onReject={rejectInboxItem} onResend={(interest) => runInterestAction(interest, "resend_email")} />

          <section className="card">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Email diagnostics</p>
                <h2>Approval email</h2>
                <p className="small muted">Access approval still works even if email fails, but testers will not be notified automatically.</p>
              </div>
              <span className={emailConfig?.configured ? "badge badgeBlue" : "badge"}>{emailConfig?.configured ? "Configured" : "Not configured"}</span>
            </div>
            {emailConfig ? (
              <div className="subcard">
                {emailConfig.missing.length > 0 ? (
                  <div>
                    <p className="small muted">Missing variables:</p>
                    <ul>
                      {emailConfig.missing.map((name) => <li key={name}>{name} missing</li>)}
                    </ul>
                  </div>
                ) : <p className="small muted">All required approval email variables are present.</p>}
                <p className="small muted">Sender: {emailConfig.fromAddress || "Not configured"}</p>
                <p className="small muted">Login link: {emailConfig.siteUrlPreview || "NEXT_PUBLIC_SITE_URL missing"}</p>
                {emailConfig.hasFromAddress && !emailConfig.missing.includes("BETA_APPROVAL_EMAIL_FROM") ? null : emailConfig.hasFromAddress ? (
                  <p className="small muted">ADMIN_ALERT_EMAIL_FROM is available as a fallback, but BETA_APPROVAL_EMAIL_FROM is recommended.</p>
                ) : null}
              </div>
            ) : <div className="emptyState">Email configuration status could not be loaded.</div>}
            <div className="btns">
              <button type="button" className="secondary" onClick={sendTestApprovalEmail} disabled={saving || testingEmail}>
                {testingEmail ? "Sending..." : "Send test email to me"}
              </button>
            </div>
          </section>

          <details className="card advancedRawLists">
            <summary>
              <span>Advanced / raw lists</span>
              <span className="small muted">Inspect separate source rows when troubleshooting.</span>
            </summary>

            <UserSection title="Pending users" users={grouped.pending} currentUser={me} saving={saving} onUpdate={updateUserAccess} />
            <UserSection title="Approved users" users={grouped.approved} currentUser={me} saving={saving} onUpdate={updateUserAccess} />
            <UserSection title="Rejected / revoked users" users={grouped.restricted} currentUser={me} saving={saving} onUpdate={updateUserAccess} />

            <section className="subcard">
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


          <section className="subcard">
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
          </details>

          <section className="card">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Beta feedback</p>
                <h2>Review tester feedback</h2>
                <p className="small muted">Review bug reports, screenshots and tester comments on the dedicated feedback page.</p>
              </div>
            </div>
            <div className="btns">
              <Link className="button" href="/admin/feedback">Open feedback</Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}


function ApprovalInboxSection({
  items,
  saving,
  onApprove,
  onReject,
  onResend,
}: {
  items: ApprovalInboxItem[];
  saving: boolean;
  onApprove: (item: ApprovalInboxItem) => Promise<void>;
  onReject: (item: ApprovalInboxItem) => Promise<void>;
  onResend: (interest: BetaInterestSubmission) => Promise<void>;
}) {
  return (
    <section className="card betaApprovalInbox">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Beta admin</p>
          <h2>Beta approval inbox</h2>
          <p className="small muted">One card per person or email. Approval succeeds even if email delivery fails.</p>
        </div>
        <span className="countPill">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="emptyState">No beta access records yet.</div>
      ) : (
        <div className="approvalInboxGrid">
          {items.map((item) => (
            <ApprovalInboxCard key={item.key} item={item} saving={saving} onApprove={onApprove} onReject={onReject} onResend={onResend} />
          ))}
        </div>
      )}
    </section>
  );
}

function ApprovalInboxCard({
  item,
  saving,
  onApprove,
  onReject,
  onResend,
}: {
  item: ApprovalInboxItem;
  saving: boolean;
  onApprove: (item: ApprovalInboxItem) => Promise<void>;
  onReject: (item: ApprovalInboxItem) => Promise<void>;
  onResend: (interest: BetaInterestSubmission) => Promise<void>;
}) {
  const { user, interest, accessEntry } = item;
  const name = user?.full_name || interest?.name || accessEntry?.full_name;
  const email = user?.email || interest?.email || accessEntry?.email;
  const interestApproved = interest?.admin_status === "pre_approved" || interest?.admin_status === "approved_existing_user";
  const approved = user?.access_status === "approved" || interestApproved || Boolean(accessEntry && !user && !interest);
  const rejected = user?.access_status === "rejected" || user?.access_status === "revoked" || interest?.admin_status === "rejected";
  const hasBoth = Boolean(user && interest);
  const canApprove = !approved && !rejected && Boolean(user || interest);
  const canReject = !approved && !rejected && Boolean(user || interest);
  const emailFailed = Boolean(interest?.approval_email_error);
  const emailSent = Boolean(interest?.approval_email_sent_at);

  return (
    <article className="approvalInboxCard">
      <div className="approvalInboxCardHeader">
        <div>
          <h3>{displayName(name)}</h3>
          <p className="small muted breakText">{email || "No email on this record"}</p>
        </div>
        <div className="approvalBadgeList" aria-label="Beta approval statuses">
          {user ? <span className="badge badgeBlue">Account created</span> : null}
          {interest ? <span className="badge badgeBlue">Interest submitted</span> : null}
          {accessEntry ? <span className="badge badgeGreen">Pre-approved</span> : null}
          {approved ? <span className="badge badgeGreen">Approved</span> : null}
          {!approved && !rejected ? <span className="badge">Pending</span> : null}
          {rejected ? <span className="badge">Rejected</span> : null}
          {emailFailed ? <span className="badge">Email failed</span> : null}
          {emailSent && !emailFailed ? <span className="badge badgeGreen">Email sent</span> : null}
        </div>
      </div>

      <p className="small muted">
        {hasBoth
          ? "This shooter has both created an account and submitted beta interest."
          : user
            ? "This shooter has already created an account."
            : interest
              ? "This shooter has submitted beta interest but has not created an account yet."
              : "This shooter is pre-approved but has not created an account yet."}
      </p>

      <dl className="approvalInboxDetails">
        {interest?.country ? <div><dt>Country</dt><dd>{interest.country}</dd></div> : null}
        {interest?.main_discipline ? <div><dt>Main discipline</dt><dd>{interest.main_discipline}</dd></div> : null}
        {interest?.instagram_handle ? <div><dt>Instagram</dt><dd className="breakText">{interest.instagram_handle}</dd></div> : null}
        {user ? <div><dt>Account status</dt><dd>{statusLabel(user.access_status)} · {user.system_role}</dd></div> : null}
        {interest ? <div><dt>Interest status</dt><dd>{statusLabel(interest.admin_status)}</dd></div> : null}
        {accessEntry ? <div><dt>Preapproval status</dt><dd>Approved · {accessEntry.system_role_to_grant}</dd></div> : null}
        {interest ? <div><dt>Approval email</dt><dd>{interest.approval_email_error ? `Needs attention: ${interest.approval_email_error}` : interest.approval_email_sent_at ? `Sent ${formatDate(interest.approval_email_sent_at)}` : "Not sent"}</dd></div> : null}
        <div><dt>Created / submitted</dt><dd>{formatDate(latestDate(user?.created_at, interest?.created_at, accessEntry?.created_at))}</dd></div>
      </dl>

      {interest?.level_comment ? <p className="approvalNote breakText">{interest.level_comment}</p> : accessEntry?.note ? <p className="approvalNote breakText">{accessEntry.note}</p> : null}

      <div className="approvalInboxActions">
        {canApprove ? <button type="button" disabled={saving} onClick={() => onApprove(item)}>Approve beta access</button> : null}
        {approved ? <button type="button" disabled className="secondary">Approved</button> : null}
        {interest && approved ? <button type="button" className="secondary" disabled={saving} onClick={() => onResend(interest)}>Resend approval email</button> : null}
        {canReject ? <button type="button" className="secondary" disabled={saving} onClick={() => onReject(item)}>Reject / Not now</button> : null}
      </div>
    </article>
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
