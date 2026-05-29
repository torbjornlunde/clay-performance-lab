"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function NewResultPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [date, setDate] = useState("");
  const [totalTargets, setTotalTargets] = useState("75");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr("");

    if (!ownScore || !winningScore || !totalTargets) {
      setErr("Own score, winning score and total targets are required for a result-only entry.");
      return;
    }

    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { error } = await supabase.from("sessions").insert({
      user_id: u.user.id,
      name: name.trim() || "Competition result",
      discipline,
      session_type: "Competition",
      total_targets: Number(totalTargets),
      own_score: Number(ownScore),
      winning_score: Number(winningScore),
      notes: notes.trim() || null,
      course_count: null,
      shooting_format: null,
      created_at: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
    });

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    router.push("/stats");
  }

  return (
    <main>
      <div className="card">
        <h2>Add result only</h2>
        <p className="small muted">Fast competition result entry without courses, session setup, or detailed miss logging.</p>
        <div className="notice">
          <strong>Result only</strong>
          <div className="small">Use this when you only want stats. Choose New session when you want full session logging.</div>
        </div>
        <label>Result name / competition name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competition name" />
        <label>Discipline</label>
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
          <option>Compak Sporting</option>
          <option>Sporting</option>
          <option>FITASC Sporting</option>
          <option>Leirduesti</option>
          <option>Trap</option>
          <option>Skeet</option>
          <option>Other</option>
        </select>
        <label>Date (optional)</label>
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" />
        <div className="row">
          <div>
            <label>Total targets</label>
            <input value={totalTargets} onChange={(e) => setTotalTargets(e.target.value)} type="number" inputMode="numeric" min="1" />
          </div>
          <div>
            <label>Own score</label>
            <input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} type="number" inputMode="numeric" min="0" />
          </div>
        </div>
        <label>Winning score</label>
        <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} type="number" inputMode="numeric" min="1" />
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Short note" />
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save result"}
          </button>
          <Link className="button secondary" href="/dashboard">
            Cancel
          </Link>
        </div>
      </div>
    </main>
  );
}
