"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewResultPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [competitionDate, setCompetitionDate] = useState(today());
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr("");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const own = Number(ownScore);
    const winning = Number(winningScore);
    if (!Number.isFinite(own) || !Number.isFinite(winning) || own < 0 || winning <= 0) {
      setErr("Enter your score and a winning score greater than zero.");
      setSaving(false);
      return;
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        user_id: u.user.id,
        name: name.trim() || "Competition result",
        discipline,
        session_type: "Competition",
        shooting_format: null,
        course_count: null,
        total_targets: null,
        competition_date: competitionDate || null,
        own_score: own,
        winning_score: winning,
        calculated_score: null,
        leirdue_result_url: leirdueResultUrl.trim() || null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !session) {
      setErr(error?.message || "Could not save result.");
      return;
    }

    router.push(`/sessions/${session.id}`);
  }

  return (
    <main>
      <div className="card">
        <p className="eyebrow">Result only</p>
        <h2>Add competition result</h2>
        <p className="compactCopy">Save a manual competition result without importing or scraping Leirdue.net.</p>

        <label>Competition name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competition name" />

        <label>Date</label>
        <input value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" />

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
            <label>Your score</label>
            <input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} inputMode="numeric" type="number" min="0" />
          </div>
          <div>
            <label>Winning score</label>
            <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} inputMode="numeric" type="number" min="1" />
          </div>
        </div>

        <label>Leirdue.net result URL</label>
        <input
          value={leirdueResultUrl}
          onChange={(e) => setLeirdueResultUrl(e.target.value)}
          placeholder="https://www.leirdue.net/..."
          type="url"
        />

        {err && <div className="error">{err}</div>}
        <div className="btns stackedOnMobile">
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
