"use client";

import Link from "next/link";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { COUNTRIES, type ShooterProfileFormState } from "@/lib/profile";

type ShooterProfileFormProps = {
  accountEmail?: string | null;
  error: string;
  form: ShooterProfileFormState;
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  setForm: React.Dispatch<React.SetStateAction<ShooterProfileFormState>>;
  setSuccess?: React.Dispatch<React.SetStateAction<string>>;
  success?: string;
  submitLabel: string;
  submittingLabel?: string;
  title: string;
  body: string;
  validationErrors?: Partial<Record<"shooterName" | "country" | "myDisciplines", string>>;
  showBackToDashboard?: boolean;
};

export default function ShooterProfileForm({
  accountEmail,
  error,
  form,
  loading,
  onSubmit,
  saving,
  setForm,
  setSuccess,
  success,
  submitLabel,
  submittingLabel = "Saving...",
  title,
  body,
  validationErrors = {},
  showBackToDashboard = false,
}: ShooterProfileFormProps) {
  function clearSuccess() {
    setSuccess?.("");
  }

  function toggleDiscipline(discipline: string) {
    clearSuccess();
    setForm((current) => ({
      ...current,
      myDisciplines: current.myDisciplines.includes(discipline)
        ? current.myDisciplines.filter((item) => item !== discipline)
        : [...current.myDisciplines, discipline],
    }));
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <p className="eyebrow">Account</p>
      <h2>{title}</h2>
      <p>{body}</p>
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
              clearSuccess();
              setForm((current) => ({ ...current, shooterName: event.target.value }));
            }}
            placeholder="Your shooter name"
            aria-describedby={validationErrors.shooterName ? "shooter-name-error" : undefined}
            aria-invalid={Boolean(validationErrors.shooterName)}
          />
          {validationErrors.shooterName && <p id="shooter-name-error" className="error compactValidation">{validationErrors.shooterName}</p>}
          <p className="small muted">Used for your profile and future result matching.</p>

          <label htmlFor="country">Country</label>
          <input
            id="country"
            value={form.country}
            onChange={(event) => {
              clearSuccess();
              setForm((current) => ({ ...current, country: event.target.value }));
            }}
            placeholder="Select or type a country"
            list="country-options"
            aria-describedby={validationErrors.country ? "country-error" : undefined}
            aria-invalid={Boolean(validationErrors.country)}
          />
          {validationErrors.country && <p id="country-error" className="error compactValidation">{validationErrors.country}</p>}
          <datalist id="country-options">
            {COUNTRIES.map((country) => (
              <option key={country} value={country} />
            ))}
          </datalist>

          <div className="profileFieldGroup">
            <label>My disciplines</label>
            <p className="small muted">Your selected disciplines will be shown first in quick result and shooting log flows later.</p>
            {validationErrors.myDisciplines && <p className="error compactValidation">{validationErrors.myDisciplines}</p>}
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
            <button type="submit" disabled={saving}>{saving ? submittingLabel : submitLabel}</button>
            {showBackToDashboard && <Link className="button secondary" href="/dashboard">Back to dashboard</Link>}
          </div>
        </>
      )}
    </form>
  );
}
