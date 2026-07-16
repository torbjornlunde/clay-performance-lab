"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const DISCIPLINES = ["Sporting", "Compak Sporting", "FITASC Sporting", "Skeet", "Trap", "Other"] as const;

type FormState = {
  name: string;
  email: string;
  country: string;
  mainDiscipline: string;
  levelComment: string;
  instagramHandle: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  country: "",
  mainDiscipline: "Sporting",
  levelComment: "",
  instagramHandle: "",
};

export default function JoinBetaPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/beta-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      setError(payload.error || "We could not save your interest right now. Please try again.");
      return;
    }

    setMessage("Thanks — your interest has been registered. Access is reviewed manually and is not automatic.");
    setForm(initialForm);
  }

  return (
    <main className="betaInterestMain">
      <section className="heroCard publicHero betaInterestHero" aria-labelledby="join-beta-heading">
        <div>
          <p className="eyebrow">Closed beta</p>
          <h2 id="join-beta-heading">Join the closed beta</h2>
          <p>Clay Performance Lab is built for clay target shooters who want a clearer way to log results, training, schemes, and improvement notes.</p>
          <p className="compactCopy">We are currently testing with selected shooters.</p>
        </div>
        <div className="btns heroActions">
          <a className="button" href="#register-interest">Register interest</a>
        </div>
      </section>

      <section className="card betaInterestGrid">
        <div>
          <p className="eyebrow">Testing access</p>
          <h2>Tell us you are interested</h2>
          <p>
            Registering interest helps us invite a focused group of Sporting, Compak, FITASC, Skeet, Trap, and other clay target shooters for beta testing.
          </p>
          <p className="small muted">This form does not create an account, approve app access, or promise immediate access.</p>
          <p className="small muted">Already invited? <Link href="/login">Login or create your invited account</Link>.</p>
        </div>

        <form id="register-interest" className="subcard betaInterestForm" onSubmit={submitInterest}>
          <label htmlFor="betaName">Name</label>
          <input id="betaName" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" required />

          <label htmlFor="betaEmail">Email</label>
          <input id="betaEmail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />

          <label htmlFor="betaCountry">Country</label>
          <input id="betaCountry" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} autoComplete="country-name" required />

          <label htmlFor="betaDiscipline">Main discipline</label>
          <select id="betaDiscipline" value={form.mainDiscipline} onChange={(event) => setForm({ ...form, mainDiscipline: event.target.value })} required>
            {DISCIPLINES.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
          </select>

          <label htmlFor="betaLevelComment">Optional level/comment</label>
          <textarea id="betaLevelComment" value={form.levelComment} onChange={(event) => setForm({ ...form, levelComment: event.target.value })} placeholder="Example: new shooter, club competitor, national circuit, what you want to test..." />

          <label htmlFor="betaInstagram">Optional Instagram handle</label>
          <input id="betaInstagram" value={form.instagramHandle} onChange={(event) => setForm({ ...form, instagramHandle: event.target.value })} placeholder="@yourhandle" autoComplete="off" />

          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}

          <div className="btns stackedOnMobile">
            <button type="submit" disabled={submitting}>{submitting ? "Registering..." : "Register interest"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
