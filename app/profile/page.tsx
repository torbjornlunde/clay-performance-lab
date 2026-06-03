"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { normalizeDisciplines, type ShooterProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";

const COUNTRIES = [
  "Norway",
  "Sweden",
  "Denmark",
  "Finland",
  "Iceland",
  "United Kingdom",
  "Ireland",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Poland",
  "Czechia",
  "Austria",
  "Switzerland",
  "United States",
  "Canada",
  "Australia",
  "New Zealand",
];

type ProfileForm = {
  shooterName: string;
  country: string;
  myDisciplines: string[];
};

function initialForm(): ProfileForm {
  return { shooterName: "", country: "", myDisciplines: [] };
}

export default function ShooterProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setError("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      setError(userError.message);
      setLoading(false);
      return;
    }
    if (!userData.user) {
      router.push("/login");
      return;
    }

    setUserId(userData.user.id);
    setAccountEmail(userData.user.email ?? null);

    const { data, error: profileError } = await supabase
      .from("shooter_profiles")
      .select("user_id,shooter_name,country,my_disciplines,created_at,updated_at")
      .eq("user_id", userData.user.id)
      .maybeSingle<ShooterProfile>();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    setForm({
      shooterName: data?.shooter_name || "",
      country: data?.country || "",
      myDisciplines: normalizeDisciplines(data?.my_disciplines).filter((discipline) =>
        DISCIPLINE_OPTIONS.includes(discipline),
      ),
    });
    setLoading(false);
  }

  function toggleDiscipline(discipline: string) {
    setSuccess("");
    setForm((current) => ({
      ...current,
      myDisciplines: current.myDisciplines.includes(discipline)
        ? current.myDisciplines.filter((item) => item !== discipline)
        : [...current.myDisciplines, discipline],
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const { error: saveError } = await supabase.from("shooter_profiles").upsert({
      user_id: userId,
      shooter_name: form.shooterName.trim() || null,
      country: form.country.trim() || null,
      my_disciplines: form.myDisciplines,
    });

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSuccess("Profile saved.");
  }

  return (
    <main>
      <form className="card" onSubmit={save}>
        <p className="eyebrow">Account</p>
        <h2>Shooter profile</h2>
        <p>Manage your basic shooter name, country, and preferred clay target disciplines.</p>
        {accountEmail && <p className="small muted">Signed in as {accountEmail}</p>}

        {loading ? (
          <p>Loading profile...</p>
        ) : (
          <>
            <label htmlFor="shooter-name">Shooter name</label>
            <input
              id="shooter-name"
              value={form.shooterName}
              onChange={(event) => {
                setSuccess("");
                setForm((current) => ({ ...current, shooterName: event.target.value }));
              }}
              placeholder="Your shooter name"
            />
            <p className="small muted">Used for your profile and future result matching.</p>

            <label htmlFor="country">Country</label>
            <input
              id="country"
              value={form.country}
              onChange={(event) => {
                setSuccess("");
                setForm((current) => ({ ...current, country: event.target.value }));
              }}
              placeholder="Select or type a country"
              list="country-options"
            />
            <datalist id="country-options">
              {COUNTRIES.map((country) => (
                <option key={country} value={country} />
              ))}
            </datalist>

            <div className="profileFieldGroup">
              <label>My disciplines</label>
              <p className="small muted">Your selected disciplines will be shown first in quick result and shooting log flows later.</p>
              <div className="disciplineChoiceGrid">
                {DISCIPLINE_OPTIONS.map((discipline) => (
                  <label key={discipline} className="disciplineChoice">
                    <input
                      type="checkbox"
                      checked={form.myDisciplines.includes(discipline)}
                      onChange={() => toggleDiscipline(discipline)}
                    />
                    <span>{discipline}</span>
                  </label>
                ))}
              </div>
            </div>

            {success && <div className="success">{success}</div>}
            {error && <div className="error">{error}</div>}

            <div className="btns">
              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
              <Link className="button secondary" href="/dashboard">Back to dashboard</Link>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
