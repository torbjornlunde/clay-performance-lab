"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { EquipmentUsedSelector } from "@/app/components/EquipmentUsedSelector";
import { type EquipmentSelection } from "@/lib/equipment/logSnapshots";
import { supabase } from "@/lib/supabase/client";
import { userFacingDeleteError, userFacingSaveError } from "@/lib/userFacingErrors";
import { normalizeDisciplines, prioritizedDisciplineOptions, type ShooterProfile } from "@/lib/profile";

export type SimpleTrainingLogFormValues = {
  id?: string;
  date: string;
  targets_fired: number | string;
  hits: number | null | string;
  discipline: string | null;
  location: string | null;
  notes: string | null;
  equipment_weapon_id?: string | null;
  equipment_ammunition_profile_id?: string | null;
  equipment_snapshot?: any;
};

type SimpleTrainingLogFormProps = {
  mode: "create" | "edit";
  initialValues?: SimpleTrainingLogFormValues;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function percentageFor(hits: number, targets: number) {
  if (targets <= 0) return null;
  return (hits / targets) * 100;
}

function stringValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function SimpleTrainingLogForm({ mode, initialValues }: SimpleTrainingLogFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [date, setDate] = useState(initialValues?.date || todayInputValue());
  const [targetsFired, setTargetsFired] = useState(stringValue(initialValues?.targets_fired));
  const [hits, setHits] = useState(stringValue(initialValues?.hits));
  const [discipline, setDiscipline] = useState(initialValues?.discipline || "");
  const [location, setLocation] = useState(initialValues?.location || "");
  const [notes, setNotes] = useState(initialValues?.notes || "");
  const [equipmentSelection, setEquipmentSelection] = useState<EquipmentSelection>({ weaponId: initialValues?.equipment_weapon_id || "", ammunitionId: initialValues?.equipment_ammunition_profile_id || "", includeChokes: true });
  const [equipmentSnapshot, setEquipmentSnapshot] = useState<any>(initialValues?.equipment_snapshot || null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [myDisciplines, setMyDisciplines] = useState<string[]>([]);
  const [shooterCountry, setShooterCountry] = useState("");

  const disciplineOptions = useMemo(() => prioritizedDisciplineOptions(DISCIPLINE_OPTIONS, myDisciplines, shooterCountry), [myDisciplines, shooterCountry]);

  useEffect(() => {
    let active = true;
    async function loadProfileDisciplines() {
      const { data: userData } = await supabase.auth.getUser();
      if (!active || !userData.user) return;
      const { data } = await supabase.from("shooter_profiles").select("country,my_disciplines").eq("user_id", userData.user.id).maybeSingle<Pick<ShooterProfile, "country" | "my_disciplines">>();
      if (active) {
        setMyDisciplines(normalizeDisciplines(data?.my_disciplines));
        setShooterCountry(data?.country || "");
      }
    }
    loadProfileDisciplines();
    return () => { active = false; };
  }, []);

  const previewPercentage = useMemo(() => {
    if (!hits || !targetsFired) return null;
    const hitCount = Number(hits);
    const targetCount = Number(targetsFired);
    if (!Number.isFinite(hitCount) || !Number.isFinite(targetCount)) return null;
    return percentageFor(hitCount, targetCount);
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

    const payload = {
      date,
      targets_fired: targetCount,
      hits: hitCount,
      discipline: discipline || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      source_type: "simple_training",
      equipment_weapon_id: equipmentSelection.weaponId || null,
      equipment_ammunition_profile_id: equipmentSelection.ammunitionId || null,
      equipment_snapshot: equipmentSnapshot,
    };

    if (isEdit) {
      const { error } = await supabase
        .from("training_logs")
        .update(payload)
        .eq("id", initialValues?.id)
        .eq("source_type", "simple_training");

      if (error) {
        setErr(userFacingSaveError(error, "Could not update this training log right now. Try again when online."));
        setSaving(false);
        return;
      }

      router.push("/log-training?simpleLogUpdated=1");
      return;
    }

    const { data, error } = await supabase
      .from("training_logs")
      .insert({
        owner_user_id: userData.user.id,
        ...payload,
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

  async function upgradeLog() {
    if (!isEdit || !initialValues?.id) return;
    setErr("");
    setUpgrading(true);

    const { data: sessionId, error } = await supabase.rpc("upgrade_simple_training_log", { p_log_id: initialValues.id });

    if (error || !sessionId) {
      setErr(userFacingSaveError(error, "Could not upgrade this training log right now. The simple log is still intact; try again when online."));
      setUpgrading(false);
      return;
    }

    router.push(`/sessions/${sessionId}`);
  }

  async function deleteLog() {
    if (!isEdit || !initialValues?.id) return;
    const confirmed = window.confirm("Delete this simple training log? This cannot be undone.");
    if (!confirmed) return;

    setErr("");
    setDeleting(true);
    const { error } = await supabase
      .from("training_logs")
      .delete()
      .eq("id", initialValues.id)
      .eq("source_type", "simple_training");

    if (error) {
      setErr(userFacingDeleteError(error, "Could not delete this training log right now. Try again when online."));
      setDeleting(false);
      return;
    }

    router.push("/log-training?simpleLogDeleted=1");
  }

  return (
    <form className="card simpleTrainingForm" onSubmit={save}>
      <div className="heroTopline">
        <div>
          <p className="eyebrow">Log training</p>
          <h1>{isEdit ? "Edit simple training log" : "Simple training log"}</h1>
          <p className="muted">
            {isEdit
              ? "Add hits, discipline, location or notes when you are ready. Minimum logs can stay simple."
              : "Log only date and targets fired. You can add more details later."}
          </p>
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

      <details className="subcard optionalTrainingDetails" open={isEdit}>
        <summary>Optional details</summary>
        <p className="small muted">Add these only if they are useful. Missing hits are saved as empty and are not counted as 0.</p>
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
              {disciplineOptions.map((option) => (
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

        <EquipmentUsedSelector
          value={equipmentSelection}
          onChange={(selection, snapshot) => { setEquipmentSelection(selection); setEquipmentSnapshot(snapshot); }}
        />

      {isEdit && (
        <section className="subcard simpleTrainingFutureDetails" aria-labelledby="simple-training-future-details">
          <h2 id="simple-training-future-details">Continue as detailed training log</h2>
          <p className="small muted">Upgrade this simple entry into the existing detailed personal Training session flow. Date, targets fired, known hits, discipline, range, notes and equipment snapshot are carried forward automatically. You can still save simple edits without upgrading.</p>
          <ul className="small muted simpleTrainingFutureList">
            <li>post/station scores</li>
            <li>target-by-target scoring</li>
            <li>miss details</li>
            <li>target definitions</li>
            <li>video/ShotKam links</li>
          </ul>
          <button className="secondary" type="button" disabled={saving || deleting || upgrading} onClick={upgradeLog}>
            {upgrading ? "Upgrading..." : "Add detailed training data"}
          </button>
        </section>
      )}

      {err && <div className="error">{err}</div>}
      <div className="btns simpleTrainingFormActions">
        <button type="submit" disabled={saving || deleting || upgrading}>{saving ? "Saving..." : isEdit ? "Save changes" : "Save training log"}</button>
        <Link href="/log-training" className="button secondary">Cancel</Link>
        {isEdit && (
          <button className="danger" type="button" disabled={saving || deleting || upgrading} onClick={deleteLog}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
    </form>
  );
}
