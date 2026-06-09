"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAccessProfile } from "@/lib/access";
import { supabase } from "@/lib/supabase/client";

function copyForStatus(status: UserAccessProfile["access_status"] | null | undefined) {
  if (status === "rejected" || status === "revoked") {
    return {
      title: "Access not available",
      body: "Your account does not currently have access to Clay Performance Lab.",
    };
  }

  return {
    title: "Account pending approval",
    body: "Clay Performance Lab is currently in closed beta. Your account will be reviewed before access is enabled.",
  };
}

export default function BetaAccessPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserAccessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      setLoading(true);
      setError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      await supabase.rpc("sync_my_access_profile");
      const { data, error: profileError } = await supabase
        .from("user_access_profiles")
        .select("user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by")
        .eq("user_id", userData.user.id)
        .maybeSingle<UserAccessProfile>();

      if (!active) return;

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      if (data?.access_status === "approved") {
        router.replace("/dashboard");
        return;
      }

      setProfile(data ?? null);
      setLoading(false);
    }

    loadAccess();
    return () => {
      active = false;
    };
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const copy = copyForStatus(profile?.access_status);

  return (
    <main className="authMain">
      <div className="card authCard">
        <p className="eyebrow">Closed beta</p>
        <h2>{loading ? "Checking access..." : copy.title}</h2>
        {loading ? <p>Loading access status...</p> : <p>{copy.body}</p>}
        {profile?.email && <p className="small muted">Signed in as {profile.email}</p>}
        {error && <div className="error">{error}</div>}
        <div className="btns">
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
