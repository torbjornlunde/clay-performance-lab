"use client";

import Link from "next/link";
import CountryPicker from "@/app/components/CountryPicker";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { type ShooterProfileFormState } from "@/lib/profile";

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
  validationErrors?: Partial<Record<"firstName" | "lastName" | "country" | "myDisciplines", string>>;
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
          <div className="row">
            <label htmlFor="first-name">First name
              <input
                id="first-name"
                value={form.firstName}
                onChange={(event) => {
                  clearSuccess();
                  setForm((current) => ({ ...current, firstName: event.target.value }));
                }}
                placeholder="First name"
                aria-describedby={validationErrors.firstName ? "first-name-error" : undefined}
                aria-invalid={Boolean(validationErrors.firstName)}
                required
              />
              {validationErrors.firstName && <span id="first-name-error" className="error compactValidation">{validationErrors.firstName}</span>}
            </label>
            <label htmlFor="last-name">Last name
              <input
                id="last-name"
                value={form.lastName}
                onChange={(event) => {
                  clearSuccess();
                  setForm((current) => ({ ...current, lastName: event.target.value }));
                }}
                placeholder="Last name"
                aria-describedby={validationErrors.lastName ? "last-name-error" : undefined}
                aria-invalid={Boolean(validationErrors.lastName)}
                required
              />
              {validationErrors.lastName && <span id="last-name-error" className="error compactValidation">{validationErrors.lastName}</span>}
            </label>
          </div>
          <p className="small muted">Used for your profile and future result matching.</p>
          {form.legacyShooterName && (
            <p className="small muted">Previous shooter name: {form.legacyShooterName}</p>
          )}

          <label id="country-label" htmlFor="country">Country</label>
          <CountryPicker
            value={form.country}
            error={validationErrors.country}
            onChange={(country) => {
              clearSuccess();
              setForm((current) => ({ ...current, country }));
            }}
          />
          {validationErrors.country && <p id="country-error" className="error compactValidation">{validationErrors.country}</p>}

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
