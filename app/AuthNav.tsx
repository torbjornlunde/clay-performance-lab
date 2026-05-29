"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export function AuthNav() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setIsLoggedIn(Boolean(data.user));
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session?.user));
      setReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!ready || !isLoggedIn) return null;

  return (
    <nav className="topNav" aria-label="Primary navigation">
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/stats">Stats</Link>
    </nav>
  );
}
