"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BetaFeedback, BetaFeedbackAdminStatus, BetaFeedbackAttachment, UserAccessProfile } from "@/lib/access";
import { canManageBetaAccess } from "@/lib/access";
import { formatFeedbackFileSize, loadBetaFeedbackWithSignedAttachments } from "@/lib/adminBetaFeedback";
import { supabase } from "@/lib/supabase/client";

const USER_COLUMNS = "user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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

  return (
    <main>
      <section className="heroCard">
        <div>
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
        <section className="card">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Newest first</p>
              <h2>Internal app feedback</h2>
              <p className="small muted">Screenshot links are private signed URLs and expire after opening this page.</p>
            </div>
            <span className="countPill">{feedbackList.length}</span>
          </div>
          {feedbackList.length === 0 ? <div className="emptyState">No beta feedback yet.</div> : (
            <div className="accessTableWrap">
              <table className="accessTable">
                <thead><tr><th>Type</th><th>Severity</th><th>Email/user</th><th>Source page</th><th>Message</th><th>Screenshots</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
                <tbody>{feedbackList.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.feedback_type}</td>
                    <td>{entry.severity}</td>
                    <td>{entry.email || entry.user_id || "—"}</td>
                    <td>{entry.page_path || "—"}</td>
                    <td><p>{entry.message}</p></td>
                    <td><FeedbackAttachmentsList attachments={feedbackAttachments[entry.id] ?? []} /></td>
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
      )}
    </main>
  );
}

function FeedbackAttachmentsList({ attachments }: { attachments: BetaFeedbackAttachment[] }) {
  if (attachments.length === 0) return <p className="small muted">No screenshots attached.</p>;
  return (
    <ul className="small">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {attachment.signed_url ? <a href={attachment.signed_url} target="_blank" rel="noreferrer">{attachment.original_filename || "Open screenshot"}</a> : <span>{attachment.original_filename || "Screenshot"}</span>}
          <span className="muted"> · {attachment.content_type || "unknown type"} · {formatFeedbackFileSize(attachment.size_bytes)}</span>
        </li>
      ))}
    </ul>
  );
}
