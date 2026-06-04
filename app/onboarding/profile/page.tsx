"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ShooterProfileForm from "@/app/components/ShooterProfileForm";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import {
  emptyShooterProfileForm,
  isShooterProfileComplete,
  normalizeDisciplines,
  shooterProfileToForm,
  type ShooterProfile,
  type ShooterProfileFormState,
} from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";

type ValidationErrors = Partial<Record<"shooterName" | "country" | "myDisciplines", string>>;

function validate(form: ShooterProfileFormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!form.shooterName.trim()) errors.shooterName = "Enter your shooter name.";
  if (!form.country.trim()) errors.country = "Select your country.";
  if (form.myDisciplines.length === 0) errors.myDisciplines = "Select at least one discipline.";
  return errors;
}

export default function OnboardingProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [form, setForm] = useState<ShooterProfileFormState>(emptyShooterProfileForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

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
      router.replace("/login");
      return;
    }

    setUserId(userData.user.id);
    setAccountEmail(userData.user.email ?? null);

    const { data, error: profileError } = await supabase
      .from("shooter_profiles")
      .select("id,user_id,shooter_name,country,my_disciplines,created_at,updated_at")
      .eq("user_id", userData.user.id)
      .maybeSingle<ShooterProfile>();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const nextForm = {
      ...shooterProfileToForm(data),
      myDisciplines: normalizeDisciplines(data?.my_disciplines).filter((discipline) =>
        DISCIPLINE_OPTIONS.includes(discipline),
      ),
    };

    if (isShooterProfileComplete(nextFormToProfile(nextForm))) {
      router.replace("/dashboard");
      return;
    }

    setForm(nextForm);
    setLoading(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;

    const nextValidationErrors = validate(form);
    setValidationErrors(nextValidationErrors);
    setError("");

    if (Object.keys(nextValidationErrors).length > 0) return;

    setSaving(true);

    const { error: saveError } = await supabase.from("shooter_profiles").upsert(
      {
        user_id: userId,
        shooter_name: form.shooterName.trim(),
        country: form.country.trim(),
        my_disciplines: form.myDisciplines,
      },
      { onConflict: "user_id" },
    );

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main>
      <ShooterProfileForm
        accountEmail={accountEmail}
        body="Set your name, country, and preferred disciplines so the app can personalize logging and results."
        error={error}
        form={form}
        loading={loading}
        onSubmit={save}
        saving={saving}
        setForm={(update) => {
          setValidationErrors({});
          setForm(update);
        }}
        submitLabel="Save and continue"
        title="Complete your shooter profile"
        validationErrors={validationErrors}
      />
    </main>
  );
}

function nextFormToProfile(form: ShooterProfileFormState) {
  return {
    shooter_name: form.shooterName,
    country: form.country,
    my_disciplines: form.myDisciplines,
  };
}
