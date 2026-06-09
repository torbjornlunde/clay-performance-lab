"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setMsg("");
    setSubmitting(true);

    if (!email || !password) {
      setMsg("Enter email and password.");
      setSubmitting(false);
      return;
    }

    const res =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setSubmitting(false);

    if (res.error) {
      setMsg(res.error.message);
      return;
    }

    if (mode === "signUp") {
      setMsg("Account created. After email confirmation, sign in to request closed beta approval.");
      setMode("signIn");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="authMain">
      <form className="card authCard" onSubmit={submit}>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Clay Performance Lab</p>
            <h2>{mode === "signIn" ? "Login" : "Create account"}</h2>
          </div>
        </div>
        <p className="compactCopy">Closed beta access is reviewed after account creation.</p>
        <label htmlFor="email">Email</label>
        <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
        />
        {msg && <div className={msg.includes("created") ? "success" : "error"}>{msg}</div>}
        <div className="btns stackedOnMobile">
          <button type="submit" disabled={submitting}>
            {submitting ? "Working..." : mode === "signIn" ? "Login" : "Create account"}
          </button>
          <button type="button" className="secondary" onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}> 
            {mode === "signIn" ? "Create account instead" : "Login instead"}
          </button>
        </div>
      </form>
    </main>
  );
}
