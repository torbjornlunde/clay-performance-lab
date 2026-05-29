"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export function AppHeader() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const homeHref = isLoggedIn ? "/dashboard" : "/";

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsLoggedIn(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="header">
      <div className="logoRow">
        <Link href={homeHref} className="brandLockup" aria-label="Clay Performance Lab home">
          <span className="mark" />
          <div>
            <h1>Clay Performance Lab</h1>
            <div className="small muted">Performance analysis for clay target shooters</div>
          </div>
        </Link>
        {isLoggedIn ? (
          <nav className="topNav" aria-label="Primary navigation">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/stats">Stats</Link>
          </nav>
        ) : (
          <nav className="topNav" aria-label="Account navigation">
            <Link href="/login">Login</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
