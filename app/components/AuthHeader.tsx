"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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
          <span className="mark" />
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
