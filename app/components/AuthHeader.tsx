"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

function ClayTargetIcon() {
  return (
    <span className="mark" role="img" aria-label="Orange clay target icon">
      <svg viewBox="0 0 44 44" focusable="false" aria-hidden="true">
        <defs>
          <radialGradient id="clayTargetFace" cx="34%" cy="26%" r="70%">
            <stop offset="0%" stopColor="#ffd18a" />
            <stop offset="42%" stopColor="#f27822" />
            <stop offset="100%" stopColor="#9b3214" />
          </radialGradient>
          <linearGradient id="clayTargetRim" x1="8" y1="7" x2="36" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ff9a3d" />
            <stop offset="58%" stopColor="#d74d19" />
            <stop offset="100%" stopColor="#5f1e12" />
          </linearGradient>
        </defs>
        <ellipse cx="22" cy="23" rx="17" ry="15" fill="url(#clayTargetRim)" />
        <ellipse cx="22" cy="21" rx="15" ry="12" fill="url(#clayTargetFace)" />
        <ellipse cx="22" cy="21" rx="10" ry="7" fill="none" stroke="#b73a16" strokeWidth="2" opacity="0.72" />
        <ellipse cx="22" cy="21" rx="4.8" ry="3.3" fill="none" stroke="#7b2412" strokeWidth="1.5" opacity="0.72" />
        <path d="M10.5 19.5c2.8-6.2 10.9-9.3 18.6-7.1" fill="none" stroke="#ffe1aa" strokeWidth="2.2" strokeLinecap="round" opacity="0.72" />
      </svg>
    </span>
  );
}

export default function AuthHeader() {
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setAuthenticated(Boolean(data.user));
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
      setReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="header">
      <div className="logoRow">
        <Link href={authenticated ? "/dashboard" : "/"} className="brandLockup" aria-label="Clay Performance Lab home">
          <ClayTargetIcon />
          <div>
            <h1>Clay Performance Lab</h1>
            <div className="small muted">Performance analysis for clay target shooters</div>
          </div>
        </Link>
        {ready && authenticated && (
          <nav className="topNav" aria-label="Primary navigation">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/stats">Stats</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
