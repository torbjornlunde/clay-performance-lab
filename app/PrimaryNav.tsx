"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function PrimaryNav() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setIsAuthed(Boolean(data.user));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session?.user));
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <nav className="topNav" aria-label="Primary navigation">
      {isAuthed ? (
        <>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/stats">Stats</Link>
          <Link href="/fitasc">FITASC</Link>
        </>
      ) : (
        <Link href="/login">Login</Link>
      )}
    </nav>
  );
}
