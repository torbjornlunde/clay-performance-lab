"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { supabase } from "@/lib/supabase/client";
import { userFacingSaveError } from "@/lib/userFacingErrors";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function hitPercentage(hits: number, targets: number) {
  if (targets <= 0) return null;
  return (hits / targets) * 100;
}

export default function NewSimpleTrainingLogPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayInputValue());
  const [targetsFired, setTargetsFired] = useState("");
  const [hits, setHits] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const previewPercentage = useMemo(() => {
    if (!hits || !targetsFired) return null;
    const hitCount = Number(hits);
    const targetCount = Number(targetsFired);
    if (!Number.isFinite(hitCount) || !Number.isFinite(targetCount)) return null;
    return hitPercentage(hitCount, targetCount);
  }, [hits, targetsFired]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");

    const targetCount = Number(targetsFired);
    const hitCount = hits === "" ? null : Number(hits);

    if (!date) {
      setErr("Choose a date for this training log.");
      return;
    }

    if (!Number.isInteger(targetCount) || targetCount <= 0) {
      setErr("Targets fired must be a whole number greater than 0.");
      return;
    }

    if (hitCount !== null && (!Number.isInteger(hitCount) || hitCount < 0 || hitCount > targetCount)) {
      setErr("Hits must be a whole number from 0 up to targets fired.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("training_logs")
      .insert({
        owner_user_id: userData.user.id,
        date,
        targets_fired: targetCount,
        hits: hitCount,
        discipline: discipline || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        source_type: "simple_training",
      })
      .select("id")
      .single();

    if (error || !data) {
      setErr(userFacingSaveError(error, "Could not save this training log right now. Try again when online."));
      setSaving(false);
      return;
    }

    router.push("/log-training?simpleLogSaved=1");
  }

  return (
    <main className="container narrow">
      <form className="card simpleTrainingForm" onSubmit={save}>
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log training</p>
            <h1>Simple training log</h1>
            <p className="muted">Log only date and targets fired. You can add more details later.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/log-training" className="button secondary smallButton">Back to Log training</Link>
          </div>
        </div>

        <div className="subcard simpleTrainingRequiredFields">
          <h2>Minimum details</h2>
          <div className="row">
            <div>
              <label htmlFor="simple-training-date">Date</label>
              <input
                id="simple-training-date"
                className="compactDateInput"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                type="date"
                required
              />
            </div>
            <div>
              <label htmlFor="simple-training-targets">Targets fired</label>
              <input
                id="simple-training-targets"
                value={targetsFired}
                onChange={(event) => setTargetsFired(event.target.value)}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="100"
                required
              />
            </div>
          </div>
        </div>

        <details className="subcard optionalTrainingDetails">
          <summary>Optional details</summary>
          <p className="small muted">Add these only if they are useful. Missing hits are not counted as 0.</p>
          <div className="row">
            <div>
              <label htmlFor="simple-training-hits">Hits</label>
              <input
                id="simple-training-hits"
                value={hits}
                onChange={(event) => setHits(event.target.value)}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="82"
              />
              {previewPercentage !== null && (
                <p className="small muted">Hit percentage: {previewPercentage.toFixed(0)}%</p>
              )}
            </div>
            <div>
              <label htmlFor="simple-training-discipline">Discipline</label>
              <select id="simple-training-discipline" value={discipline} onChange={(event) => setDiscipline(event.target.value)}>
                <option value="">Not specified</option>
                {DISCIPLINE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="simple-training-location">Location/range</label>
          <input
            id="simple-training-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Kismul, Karmøy, Stavanger..."
          />
          <label htmlFor="simple-training-notes">Notes</label>
          <textarea
            id="simple-training-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything you want to remember about this session."
            rows={4}
          />
        </details>

        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save training log"}</button>
          <Link href="/log-training" className="button secondary">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
