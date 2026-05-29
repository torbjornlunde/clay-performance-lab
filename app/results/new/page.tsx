"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function NewResultPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [competitionDate, setCompetitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [totalTargets, setTotalTargets] = useState("100");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");
    if (!name.trim() || !competitionDate || !totalTargets || !ownScore || !winningScore) {
      setErr("Competition name, date, total targets, own score and winning score are required.");
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
      name: name.trim(),
      discipline,
      session_type: "Competition",
      shooting_format: null,
      course_count: null,
      total_targets: Number(totalTargets),
      competition_date: competitionDate,
      own_score: Number(ownScore),
      winning_score: Number(winningScore),
      leirdue_result_url: leirdueResultUrl.trim() || null,
      notes: notes.trim() || null,
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
      <form className="card" onSubmit={save}>
        <p className="eyebrow">Result-only mode</p>
        <h2>Add competition result</h2>
        <p>Use this when you only want score statistics, without logging misses.</p>
        <label>Competition name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competition name" required />
        <div className="row">
          <div>
            <label>Date</label>
            <input value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" required />
          </div>
          <div>
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
          </div>
        </div>
        <div className="row">
          <div>
            <label>Total targets</label>
            <input value={totalTargets} onChange={(e) => setTotalTargets(e.target.value)} type="number" min="1" inputMode="numeric" required />
          </div>
          <div>
            <label>Own score</label>
            <input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} type="number" min="0" inputMode="numeric" required />
          </div>
        </div>
        <label>Winning score</label>
        <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} type="number" min="1" inputMode="numeric" required />
        <label>Leirdue.net result URL</label>
        <input value={leirdueResultUrl} onChange={(e) => setLeirdueResultUrl(e.target.value)} type="url" placeholder="Optional" />
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button disabled={saving}>{saving ? "Saving..." : "Save result"}</button>
          <Link className="button secondary" href="/dashboard">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
