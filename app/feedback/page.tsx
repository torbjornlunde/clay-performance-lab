"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BETA_FEEDBACK_ATTACHMENT_BUCKET,
  BETA_FEEDBACK_ATTACHMENT_MAX_BYTES,
  BETA_FEEDBACK_ATTACHMENT_MAX_FILES,
  BETA_FEEDBACK_ATTACHMENT_TYPES,
  BETA_FEEDBACK_SEVERITIES,
  BETA_FEEDBACK_TYPES,
  betaFeedbackContext,
  safeInternalFeedbackPath,
  type BetaFeedbackSeverity,
  type BetaFeedbackType,
} from "@/lib/betaFeedback";
import { supabase } from "@/lib/supabase/client";

const MESSAGE_MAX = 4000;
const ACCEPTED_ATTACHMENT_TYPES = new Set<string>(
  BETA_FEEDBACK_ATTACHMENT_TYPES,
);

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
}

function safeStorageFilename(name: string) {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120) || "screenshot"
  );
}

export default function FeedbackPage() {
  const searchParams = useSearchParams();
  const initialContext = searchParams.get("context") || "General beta";
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<BetaFeedbackType>("Bug");
  const [severity, setSeverity] = useState<BetaFeedbackSeverity>("Normal");
  const [message, setMessage] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const pagePath = useMemo(() => {
    const sourcePath = safeInternalFeedbackPath(searchParams.get("from"));
    if (sourcePath) return sourcePath;
    return typeof window === "undefined"
      ? null
      : window.location.pathname + window.location.search;
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        setError("Please sign in to send beta feedback.");
      } else {
        setUserId(data.user.id);
        setEmail(data.user.email ?? null);
      }
      setLoading(false);
    }
    loadUser();
    return () => {
      active = false;
    };
  }, []);

  function validateAttachments(files: File[]) {
    if (files.length > BETA_FEEDBACK_ATTACHMENT_MAX_FILES)
      return `Attach up to ${BETA_FEEDBACK_ATTACHMENT_MAX_FILES} screenshots.`;
    const unsupported = files.find(
      (file) => !ACCEPTED_ATTACHMENT_TYPES.has(file.type),
    );
    if (unsupported)
      return `${unsupported.name} is not a supported image. Use PNG, JPEG or WebP.`;
    const tooLarge = files.find(
      (file) => file.size > BETA_FEEDBACK_ATTACHMENT_MAX_BYTES,
    );
    if (tooLarge) return `${tooLarge.name} is too large. Maximum size is 5 MB.`;
    return "";
  }

  function handleAttachmentChange(files: FileList | null) {
    const nextFiles = Array.from(files ?? []);
    const validation = validateAttachments(nextFiles);
    setAttachmentError(validation);
    if (!validation) setAttachments(nextFiles);
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const trimmed = message.trim();
    if (!userId) {
      setError("Please sign in to send beta feedback.");
      return;
    }
    if (!trimmed) {
      setError("Describe what happened or what would help.");
      return;
    }
    if (trimmed.length > MESSAGE_MAX) {
      setError(`Please keep feedback under ${MESSAGE_MAX} characters.`);
      return;
    }
    const validation = validateAttachments(attachments);
    setAttachmentError(validation);
    if (validation) return;

    setSaving(true);
    const { data: feedbackRow, error: insertError } = await supabase
      .from("beta_feedback")
      .insert({
        user_id: userId,
        email,
        feedback_type: feedbackType,
        severity,
        message: trimmed,
        page_path: includeContext ? pagePath : null,
        user_agent:
          includeContext && typeof navigator !== "undefined"
            ? navigator.userAgent
            : null,
        app_context: includeContext ? betaFeedbackContext(initialContext) : {},
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !feedbackRow) {
      setSaving(false);
      setError(insertError?.message || "Feedback could not be saved.");
      return;
    }

    let attachmentWarning = "";
    for (const file of attachments) {
      const storagePath = `${userId}/${feedbackRow.id}/${crypto.randomUUID()}-${safeStorageFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(BETA_FEEDBACK_ATTACHMENT_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        attachmentWarning = `Feedback was saved, but ${file.name} could not be uploaded: ${uploadError.message}`;
        break;
      }

      const { error: attachmentInsertError } = await supabase
        .from("beta_feedback_attachments")
        .insert({
          feedback_id: feedbackRow.id,
          user_id: userId,
          storage_bucket: BETA_FEEDBACK_ATTACHMENT_BUCKET,
          storage_path: storagePath,
          original_filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
        });
      if (attachmentInsertError) {
        attachmentWarning = `Feedback was saved, but ${file.name} could not be linked: ${attachmentInsertError.message}`;
        break;
      }
    }

    setSaving(false);
    setMessage("");
    if (attachmentWarning) {
      setError(attachmentWarning);
      setSuccess("Your feedback text was saved inside Clay Performance Lab.");
      return;
    }
    setMessage("");
    setAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    setSuccess(
      attachments.length
        ? "Thanks — your feedback and screenshot were sent inside Clay Performance Lab."
        : "Thanks — your feedback was sent inside Clay Performance Lab.",
    );
  }

  return (
    <main>
      <section className="heroCard">
        <div>
          <p className="eyebrow">Closed beta</p>
          <h2>Send beta feedback</h2>
          <p>
            Report bugs, confusing flows or feature ideas without opening your
            email app.
          </p>
        </div>
        <Link href="/dashboard" className="button secondary">
          Back to Dashboard
        </Link>
      </section>

      {loading ? <div className="card">Loading feedback form...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      {!loading && userId ? (
        <form className="card" onSubmit={submitFeedback}>
          <div className="row">
            <div>
              <label htmlFor="feedbackType">Type</label>
              <select
                id="feedbackType"
                value={feedbackType}
                onChange={(event) =>
                  setFeedbackType(event.target.value as BetaFeedbackType)
                }
              >
                {BETA_FEEDBACK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="feedbackSeverity">Severity</label>
              <select
                id="feedbackSeverity"
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as BetaFeedbackSeverity)
                }
              >
                {BETA_FEEDBACK_SEVERITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="feedbackMessage">Message</label>
          <textarea
            id="feedbackMessage"
            rows={8}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What happened? What did you expect?"
          />
          <p className="small muted">
            {message.length}/{MESSAGE_MAX} characters
          </p>
          <label htmlFor="feedbackAttachment">Attach screenshot</label>
          <input
            id="feedbackAttachment"
            ref={attachmentInputRef}
            type="file"
            accept={BETA_FEEDBACK_ATTACHMENT_TYPES.join(",")}
            multiple
            onChange={(event) => handleAttachmentChange(event.target.files)}
          />
          <p className="small muted">
            Optional. Up to 3 PNG, JPEG or WebP images, 5 MB each.
          </p>
          {attachmentError ? (
            <p className="error small" role="alert">
              {attachmentError}
            </p>
          ) : null}
          {attachments.length ? (
            <ul className="small muted">
              {attachments.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  {file.name} · {formatFileSize(file.size)}
                </li>
              ))}
            </ul>
          ) : null}
          <label className="checkRow">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(event) => setIncludeContext(event.target.checked)}
            />
            Include current page and browser context
          </label>
          <div className="btns">
            <button type="submit" disabled={saving}>
              {saving ? "Sending..." : "Submit feedback"}
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
