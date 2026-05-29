"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function NewResultPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [totalTargets, setTotalTargets] = useState("100");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr("");
    const total = toNumber(totalTargets);
    const own = toNumber(ownScore);
    const winning = toNumber(winningScore);

    if (!name.trim()) return setErr("Competition name is required.");
    if (!total || total <= 0) return setErr("Total targets must be greater than 0.");
    if (own === null || own < 0) return setErr("Own score is required.");
    if (winning === null || winning <= 0) return setErr("Winning score is required.");

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
      total_targets: total,
      own_score: own,
      winning_score: winning,
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
      <div className="card">
        <p className="eyebrow">Result only</p>
        <h2>Add competition result</h2>
        <p>Use this when you only want score statistics, without logging misses or setting up courses.</p>
        <label>Competition name</label>
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
        <div className="row">
          <div>
            <label>Total targets</label>
            <input type="number" min="1" value={totalTargets} onChange={(e) => setTotalTargets(e.target.value)} />
          </div>
          <div>
            <label>Own score</label>
            <input type="number" min="0" value={ownScore} onChange={(e) => setOwnScore(e.target.value)} required />
          </div>
        </div>
        <label>Winning score</label>
        <input type="number" min="1" value={winningScore} onChange={(e) => setWinningScore(e.target.value)} required />
        <p className="small muted">Winning score is required because it powers the performance percentage in stats.</p>
        <label>Notes optional</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save result"}</button>
          <Link className="button secondary" href="/dashboard">Cancel</Link>
        </div>
      </div>
    </main>
  );
}
