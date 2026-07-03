"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ShooterProfileForm from "@/app/components/ShooterProfileForm";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import {
  emptyShooterProfileForm,
  isShooterProfileComplete,
  composeCanonicalShooterName,
  isValidCountryCode,
  normalizeCountryCode,
  normalizeProfileWhitespace,
  normalizeDisciplines,
  shooterProfileToForm,
  type ShooterProfile,
  type ShooterProfileFormState,
} from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";

type ValidationErrors = Partial<Record<"firstName" | "lastName" | "country" | "myDisciplines", string>>;

function validate(form: ShooterProfileFormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!normalizeProfileWhitespace(form.firstName)) errors.firstName = "Enter your first name.";
  if (!normalizeProfileWhitespace(form.lastName)) errors.lastName = "Enter your last name.";
  if (!isValidCountryCode(form.country)) errors.country = "Select your country.";
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
      .select("id,user_id,shooter_name,first_name,last_name,country,my_disciplines,created_at,updated_at")
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
        first_name: normalizeProfileWhitespace(form.firstName),
        last_name: normalizeProfileWhitespace(form.lastName),
        shooter_name: composeCanonicalShooterName(form.firstName, form.lastName),
        country: normalizeCountryCode(form.country),
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
    first_name: form.firstName,
    last_name: form.lastName,
    shooter_name: composeCanonicalShooterName(form.firstName, form.lastName),
    country: form.country,
    my_disciplines: form.myDisciplines,
  };
}
