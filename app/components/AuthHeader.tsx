"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

function ClayTargetIcon() {
  return (
    <span className="mark" role="img" aria-label="Orange clay target icon">
      <svg viewBox="0 0 48 48" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="clayTargetTop" x1="11" y1="14" x2="36" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffbd52" />
            <stop offset="32%" stopColor="#ff6a13" />
            <stop offset="72%" stopColor="#f04a0b" />
            <stop offset="100%" stopColor="#b93209" />
          </linearGradient>
          <linearGradient id="clayTargetWall" x1="12" y1="24" x2="36" y2="39" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ff7a19" />
            <stop offset="55%" stopColor="#d83c08" />
            <stop offset="100%" stopColor="#661909" />
          </linearGradient>
          <radialGradient id="clayTargetDish" cx="36%" cy="28%" r="78%">
            <stop offset="0%" stopColor="#ffd98b" />
            <stop offset="30%" stopColor="#ff7a19" />
            <stop offset="74%" stopColor="#e84409" />
            <stop offset="100%" stopColor="#8c2508" />
          </radialGradient>
        </defs>
        <path d="M8.5 22.7c1.3-6.9 9.1-12 18.5-11.4 9.7.6 16.7 6.7 15.7 13.6l-1.3 6.8c-1.2 6.3-8.8 10.4-18 9.7-9.3-.7-16-5.8-15.9-12.1l1-6.6Z" fill="url(#clayTargetWall)" />
        <path d="M8.6 22.6c1-7.1 8.9-12.2 18.6-11.6 9.8.7 16.8 6.9 15.6 13.9-1 6.9-8.9 11.8-18.4 11.1-9.6-.7-16.7-6.8-15.8-13.4Z" fill="url(#clayTargetTop)" />
        <path d="M13.1 23c.8-4.6 6.4-7.9 13.3-7.5 6.8.5 11.9 4.6 11.2 9.2-.7 4.5-6.4 7.7-13.2 7.2-6.9-.5-11.9-4.5-11.3-8.9Z" fill="url(#clayTargetDish)" />
        <path d="M17.6 23.4c.4-2.6 4-4.5 8.1-4.2 4.1.3 7.2 2.7 6.8 5.4-.4 2.6-4 4.4-8.1 4.1-4.1-.3-7.2-2.7-6.8-5.3Z" fill="none" stroke="#9b2707" strokeWidth="2" opacity="0.78" />
        <path d="M10.6 21.6c1.8-5.6 8.4-9.2 16.3-8.7 5.7.4 10.4 2.8 12.8 6.2" fill="none" stroke="#ffe0a3" strokeWidth="2.4" strokeLinecap="round" opacity="0.76" />
        <path d="M8.2 27.7c3 4.6 9.1 7.8 16.2 8.3 7.9.6 14.7-2.8 17.1-8.1l-.7 3.5c-1.5 5.4-8.6 9-17.3 8.3-8.5-.7-15-5.2-15.8-10.7l.5-1.3Z" fill="#7f2208" opacity="0.42" />
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
