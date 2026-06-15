"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

const INVALID_RESET_LINK_MESSAGE =
  "This reset link is invalid or has expired. Please request a new password reset link.";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function prepareRecoverySession() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && mounted) {
          setMsg(INVALID_RESET_LINK_MESSAGE);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        setMsg(INVALID_RESET_LINK_MESSAGE);
      }
      setHasRecoverySession(Boolean(data.session));
      setLoadingSession(false);
    }

    prepareRecoverySession();
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMsg("");
    setSuccess(false);

    if (password.length < 6) {
      setMsg("Choose a password with at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setMsg("Password could not be updated. Open the reset link again or request a new one.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
    setMsg("Password updated. You can now log in.");
  }

  return (
    <main className="authMain">
      <form className="card authCard" onSubmit={submit}>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Clay Performance Lab</p>
            <h2>Set a new password</h2>
          </div>
        </div>
        <p className="small muted compactCopy">
          Use the secure reset link from your email, then choose a new password for your beta account.
        </p>

        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          disabled={loadingSession || submitting || !hasRecoverySession}
        />

        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          disabled={loadingSession || submitting || !hasRecoverySession}
        />

        {loadingSession && <div className="notice">Checking reset link...</div>}
        {msg && <div className={success ? "success" : "error"}>{msg}</div>}

        <div className="btns stackedOnMobile">
          <button type="submit" disabled={loadingSession || submitting || !hasRecoverySession}>
            {submitting ? "Saving..." : "Save new password"}
          </button>
          <Link href="/login" className="button secondary">
            Back to login
          </Link>
        </div>
      </form>
    </main>
  );
}
