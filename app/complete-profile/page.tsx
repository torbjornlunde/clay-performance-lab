"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function CompleteProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      await supabase.rpc("sync_my_access_profile");
      const metadataName = typeof userData.user.user_metadata?.full_name === "string" ? userData.user.user_metadata.full_name : "";
      const { data } = await supabase
        .from("user_access_profiles")
        .select("full_name")
        .eq("user_id", userData.user.id)
        .maybeSingle<{ full_name: string | null }>();

      if (!active) return;
      setFullName((data?.full_name || metadataName || "").trim());
      setLoading(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      setError("Full name is required.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: trimmedName,
        name: trimmedName,
        display_name: trimmedName,
      },
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    await supabase.rpc("sync_my_access_profile");
    setSaving(false);
    router.replace("/dashboard");
  }

  return (
    <main className="authMain">
      <form className="card authCard" onSubmit={saveProfile}>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Closed beta</p>
            <h2>Complete your profile</h2>
          </div>
        </div>
        <p className="compactCopy">Please enter your full name so your beta access can be reviewed.</p>

        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          disabled={loading || saving}
          required
        />

        {error && <div className="error">{error}</div>}

        <div className="btns stackedOnMobile">
          <button type="submit" disabled={loading || saving}>
            {saving ? "Saving..." : "Save and continue"}
          </button>
        </div>
      </form>
    </main>
  );
}
