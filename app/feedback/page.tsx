"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BETA_FEEDBACK_SEVERITIES, BETA_FEEDBACK_TYPES, betaFeedbackContext, type BetaFeedbackSeverity, type BetaFeedbackType } from "@/lib/betaFeedback";
import { supabase } from "@/lib/supabase/client";

const MESSAGE_MAX = 4000;

export default function FeedbackPage() {
  const searchParams = useSearchParams();
  const initialContext = searchParams.get("context") || "General beta";
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<BetaFeedbackType>("Bug");
  const [severity, setSeverity] = useState<BetaFeedbackSeverity>("Normal");
  const [message, setMessage] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pagePath = useMemo(() => (typeof window === "undefined" ? null : window.location.pathname + window.location.search), []);

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
    return () => { active = false; };
  }, []);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const trimmed = message.trim();
    if (!userId) { setError("Please sign in to send beta feedback."); return; }
    if (!trimmed) { setError("Describe what happened or what would help."); return; }
    if (trimmed.length > MESSAGE_MAX) { setError(`Please keep feedback under ${MESSAGE_MAX} characters.`); return; }

    setSaving(true);
    const { error: insertError } = await supabase.from("beta_feedback").insert({
      user_id: userId,
      email,
      feedback_type: feedbackType,
      severity,
      message: trimmed,
      page_path: includeContext ? pagePath : null,
      user_agent: includeContext && typeof navigator !== "undefined" ? navigator.userAgent : null,
      app_context: includeContext ? betaFeedbackContext(initialContext) : {},
    });
    setSaving(false);

    if (insertError) { setError(insertError.message); return; }
    setMessage("");
    setSuccess("Thanks — your feedback was sent inside Clay Performance Lab.");
  }

  return (
    <main>
      <section className="heroCard">
        <div>
          <p className="eyebrow">Closed beta</p>
          <h2>Send beta feedback</h2>
          <p>Report bugs, confusing flows or feature ideas without opening your email app.</p>
        </div>
        <Link href="/dashboard" className="button secondary">Back to Dashboard</Link>
      </section>

      {loading ? <div className="card">Loading feedback form...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      {!loading && userId ? (
        <form className="card" onSubmit={submitFeedback}>
          <div className="row">
            <div>
              <label htmlFor="feedbackType">Type</label>
              <select id="feedbackType" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as BetaFeedbackType)}>
                {BETA_FEEDBACK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="feedbackSeverity">Severity</label>
              <select id="feedbackSeverity" value={severity} onChange={(event) => setSeverity(event.target.value as BetaFeedbackSeverity)}>
                {BETA_FEEDBACK_SEVERITIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="feedbackMessage">Message</label>
          <textarea id="feedbackMessage" rows={8} maxLength={MESSAGE_MAX} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What happened? What did you expect?" />
          <p className="small muted">{message.length}/{MESSAGE_MAX} characters</p>
          <label className="checkRow">
            <input type="checkbox" checked={includeContext} onChange={(event) => setIncludeContext(event.target.checked)} />
            Include current page and browser context
          </label>
          <div className="btns">
            <button type="submit" disabled={saving}>{saving ? "Sending..." : "Submit feedback"}</button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
