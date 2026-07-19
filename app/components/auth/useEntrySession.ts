"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type EntrySessionState = "checking" | "authenticated" | "unauthenticated";

export function useEntrySession(): EntrySessionState {
  const [state, setState] = useState<EntrySessionState>("checking");

  useEffect(() => {
    let active = true;

    async function resolvePersistedSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setState(data.session?.user ? "authenticated" : "unauthenticated");
    }

    resolvePersistedSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState(session?.user ? "authenticated" : "unauthenticated");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
