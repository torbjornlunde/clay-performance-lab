"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BetaFeedback, BetaFeedbackAdminStatus, BetaFeedbackAttachment, UserAccessProfile } from "@/lib/access";
import { canManageBetaAccess } from "@/lib/access";
import { formatFeedbackFileSize, loadBetaFeedbackWithSignedAttachments } from "@/lib/adminBetaFeedback";
import { supabase } from "@/lib/supabase/client";
import { AppBackButton } from "@/app/components/navigation/AppBackButton";

const USER_COLUMNS = "user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatStatus(status: BetaFeedbackAdminStatus) {
  if (status === "reviewed") return "Reviewed";
  if (status === "resolved") return "Resolved";
  return "New";
}

function statusClassName(status: BetaFeedbackAdminStatus) {
  if (status === "reviewed") return "badge badgeBlue";
  if (status === "resolved") return "badge badgeGreen";
  return "badge badgeGold";
}

export default function AdminFeedbackPage() {
  const [me, setMe] = useState<UserAccessProfile | null>(null);
  const [feedbackList, setFeedbackList] = useState<BetaFeedback[]>([]);
  const [feedbackAttachments, setFeedbackAttachments] = useState<Record<string, BetaFeedbackAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadFeedbackData(); }, []);

  const activeFeedback = useMemo(() => feedbackList.filter((entry) => !entry.archived_at), [feedbackList]);
  const archivedFeedback = useMemo(() => feedbackList.filter((entry) => entry.archived_at), [feedbackList]);
  const counts = useMemo(() => ({
    new: activeFeedback.filter((entry) => entry.admin_status === "new").length,
    reviewed: activeFeedback.filter((entry) => entry.admin_status === "reviewed").length,
    resolved: activeFeedback.filter((entry) => entry.admin_status === "resolved").length,
    archived: archivedFeedback.length,
  }), [activeFeedback, archivedFeedback]);

  async function loadFeedbackData() {
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
      setError("You do not have permission to manage beta feedback.");
      setLoading(false);
      return;
    }

    const { feedback, attachments, error: feedbackError } = await loadBetaFeedbackWithSignedAttachments();
    if (feedbackError) {
      setError(feedbackError.message);
      setLoading(false);
      return;
    }

    setFeedbackList(feedback);
    setFeedbackAttachments(attachments);
    setLoading(false);
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
    await loadFeedbackData();
  }

  async function archiveFeedback(entry: BetaFeedback) {
    setSaving(true);
    setError("");
    setMessage("");
    const { data: userData } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("beta_feedback")
      .update({ archived_at: new Date().toISOString(), archived_by: userData.user?.id ?? null })
      .eq("id", entry.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Feedback archived.");
    await loadFeedbackData();
  }

  return (
    <main>
      <section className="heroCard">
        <div>
          <AppBackButton fallback="/beta/admin" />
          <p className="eyebrow">Admin tools</p>
          <h2>Beta feedback</h2>
          <p>Review bug reports, screenshots and tester comments from internal beta users.</p>
          {me ? <p className="small muted">Signed in as {me.email || "unknown email"} · {me.system_role} · {me.access_status}</p> : null}
        </div>
        <div className="btns">
          <button type="button" className="secondary" onClick={loadFeedbackData} disabled={loading || saving}>Refresh</button>
          <Link className="button secondary" href="/beta/admin">Beta approvals</Link>
        </div>
      </section>

      {loading && <div className="card">Loading beta feedback...</div>}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {!loading && canManageBetaAccess(me) && (
        <>
          <section className="card">
            <div className="sectionHeader feedbackInboxHeader">
              <div>
                <p className="eyebrow">Newest first</p>
                <h2>Internal app feedback</h2>
                <p className="small muted">Screenshot links are private signed URLs and expire after opening this page.</p>
              </div>
              <div className="feedbackCounts" aria-label="Feedback counts">
                <span className="countPill">New {counts.new}</span>
                <span className="countPill">Reviewed {counts.reviewed}</span>
                <span className="countPill">Resolved {counts.resolved}</span>
                <span className="countPill">Archived {counts.archived}</span>
              </div>
            </div>
            {activeFeedback.length === 0 ? <div className="emptyState">No active beta feedback.</div> : (
              <div className="feedbackCardList">
                {activeFeedback.map((entry) => <FeedbackCard key={entry.id} entry={entry} attachments={feedbackAttachments[entry.id] ?? []} saving={saving} onStatusChange={updateFeedbackStatus} onArchive={archiveFeedback} />)}
              </div>
            )}
          </section>

          <section className="card">
            <details className="archivedFeedbackDetails">
              <summary>
                <span>Archived feedback</span>
                <span className="countPill">{archivedFeedback.length}</span>
              </summary>
              {archivedFeedback.length === 0 ? <div className="emptyState">No archived beta feedback.</div> : (
                <div className="feedbackCardList feedbackCardListArchived">
                  {archivedFeedback.map((entry) => <FeedbackCard key={entry.id} entry={entry} attachments={feedbackAttachments[entry.id] ?? []} saving={saving} onStatusChange={updateFeedbackStatus} onArchive={archiveFeedback} archived />)}
                </div>
              )}
            </details>
          </section>
        </>
      )}
    </main>
  );
}

function FeedbackCard({ entry, attachments, saving, onStatusChange, onArchive, archived = false }: { entry: BetaFeedback; attachments: BetaFeedbackAttachment[]; saving: boolean; onStatusChange: (entry: BetaFeedback, status: BetaFeedbackAdminStatus) => void; onArchive: (entry: BetaFeedback) => void; archived?: boolean }) {
  const reporter = entry.email || entry.user_id || "—";
  const isLegacyFeedbackPath = entry.page_path?.startsWith("/feedback");

  return (
    <article className="feedbackCard">
      <header className="feedbackCardTopRow">
        <div className="feedbackMetaChips">
          <span className="pill">{entry.feedback_type}</span>
          <span className="pill">{entry.severity}</span>
          <span className={statusClassName(entry.admin_status)}>{formatStatus(entry.admin_status)}</span>
        </div>
        <time className="small muted" dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
      </header>

      <div className="feedbackInfoGrid">
        <div>
          <p className="feedbackLabel">Reported from</p>
          <p className="feedbackValue">{entry.page_path || "—"}</p>
          {isLegacyFeedbackPath ? <p className="small muted">Submitted before source-page tracking was improved.</p> : null}
        </div>
        <div>
          <p className="feedbackLabel">Reporter</p>
          <p className="feedbackValue">{reporter}</p>
        </div>
      </div>

      <div className="feedbackMessageBlock">
        <p className="feedbackLabel">Message</p>
        <p className="feedbackMessage">{entry.message}</p>
      </div>

      <div>
        <p className="feedbackLabel">Screenshots</p>
        <FeedbackAttachmentsList attachments={attachments} />
      </div>

      <div className="feedbackActions" aria-label="Feedback actions">
        {entry.admin_status === "new" ? <button type="button" className="smallButton secondary" disabled={saving || archived} onClick={() => onStatusChange(entry, "reviewed")}>Mark reviewed</button> : null}
        {entry.admin_status !== "resolved" ? <button type="button" className="smallButton" disabled={saving || archived} onClick={() => onStatusChange(entry, "resolved")}>Resolve</button> : null}
        {!archived ? <button type="button" className="smallButton secondary" disabled={saving} onClick={() => onArchive(entry)}>Archive</button> : null}
      </div>
    </article>
  );
}

function FeedbackAttachmentsList({ attachments }: { attachments: BetaFeedbackAttachment[] }) {
  if (attachments.length === 0) return <p className="small muted">No screenshots attached.</p>;
  return (
    <ul className="feedbackAttachmentList">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="feedbackAttachmentItem">
          {attachment.signed_url ? <a className="button secondary smallButton" href={attachment.signed_url} target="_blank" rel="noreferrer">Open screenshot</a> : <span className="badge">Screenshot unavailable</span>}
          <div className="feedbackAttachmentMeta">
            <span>{attachment.original_filename || "Screenshot"}</span>
            <span className="muted">{attachment.content_type || "unknown type"} · {formatFeedbackFileSize(attachment.size_bytes)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
