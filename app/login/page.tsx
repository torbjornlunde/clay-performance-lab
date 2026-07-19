"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryStartup } from "@/app/components/auth/EntryStartup";
import { useEntrySession } from "@/app/components/auth/useEntrySession";
import { supabase } from "@/lib/supabase/client";

const LOGIN_HELP_MESSAGE =
  "Login could not be completed. The email or password may be incorrect. If you are a beta tester and cannot log in, try resetting your password or contact the app owner.";
const PASSWORD_RESET_SENT_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";

type LoginMode = "signIn" | "signUp" | "forgotPassword";
type MessageKind = "success" | "error" | "info";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<LoginMode>("signIn");
  const [msg, setMsg] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>("info");
  const [submitting, setSubmitting] = useState(false);
  const entrySession = useEntrySession();

  useEffect(() => {
    if (entrySession === "authenticated") router.replace("/dashboard");
  }, [entrySession, router]);

  function setModeAndClear(nextMode: LoginMode) {
    setMode(nextMode);
    setMsg("");
    setMessageKind("info");
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      setMsg("Enter your email to request a password reset link.");
      setMessageKind("error");
      return;
    }

    setSubmitting(true);
    setMsg("");
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setSubmitting(false);

    if (error) {
      setMsg("Password reset could not be started. Check the email format and try again.");
      setMessageKind("error");
      return;
    }

    setMsg(PASSWORD_RESET_SENT_MESSAGE);
    setMessageKind("success");
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setMsg("");
    setMessageKind("info");

    if (mode === "forgotPassword") {
      await sendPasswordReset();
      return;
    }

    setSubmitting(true);

    if (!email.trim() || !password) {
      setMsg("Enter email and password.");
      setMessageKind("error");
      setSubmitting(false);
      return;
    }

    const normalizedEmail = email.trim();
    const trimmedFullName = fullName.trim();

    if (mode === "signUp" && !trimmedFullName) {
      setMsg("Full name is required.");
      setMessageKind("error");
      setSubmitting(false);
      return;
    }

    const res =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: { data: { full_name: trimmedFullName, name: trimmedFullName, display_name: trimmedFullName } },
          });

    setSubmitting(false);

    if (res.error) {
      setMsg(mode === "signIn" ? LOGIN_HELP_MESSAGE : res.error.message);
      setMessageKind("error");
      return;
    }

    if (mode === "signUp") {
      setMsg("Account created. After email confirmation, sign in to request closed beta approval.");
      setMessageKind("success");
      setMode("signIn");
      setPassword("");
      setFullName("");
      return;
    }

    router.replace("/dashboard");
  }

  if (entrySession !== "unauthenticated") return <EntryStartup />;

  const isSignIn = mode === "signIn";
  const isSignUp = mode === "signUp";
  const isForgotPassword = mode === "forgotPassword";
  const title = isSignIn ? "Login" : isSignUp ? "Create account" : "Reset password";
  const submitLabel = isForgotPassword
    ? "Send reset link"
    : isSignIn
      ? "Login"
      : "Create account";

  return (
    <main className="authMain">
      <form className="card authCard" onSubmit={submit}>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Clay Performance Lab</p>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="compactCopy">Closed beta access is reviewed after account creation.</p>
        <p className="small muted compactCopy">
          New beta tester? Create an account using the email you were invited with. If you already created an account but cannot log in, use Forgot password.
        </p>

        <label htmlFor="email">Email</label>
        <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />

        {isSignUp && (
          <>
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </>
        )}

        {!isForgotPassword && (
          <>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={isSignIn ? "current-password" : "new-password"}
            />
          </>
        )}

        {isForgotPassword && (
          <p className="small muted">
            Enter your email and we will send a secure Supabase password reset link if an account exists.
          </p>
        )}

        {msg && <div className={messageKind === "success" ? "success" : "error"}>{msg}</div>}

        <div className="btns stackedOnMobile">
          <button type="submit" disabled={submitting}>
            {submitting ? "Working..." : submitLabel}
          </button>
          {isSignIn ? (
            <button type="button" className="secondary" onClick={() => setModeAndClear("signUp")}>
              Create account instead
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => setModeAndClear("signIn")}>
              Login instead
            </button>
          )}
        </div>

        {isSignIn && (
          <div className="btns compactAuthActions">
            <button type="button" className="secondary smallButton" onClick={() => setModeAndClear("forgotPassword")}>
              Forgot password?
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
