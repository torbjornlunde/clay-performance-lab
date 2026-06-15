"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateCourseOrder, serializeQuickScoreNotes, type QuickScoreCourse } from "@/lib/quick-score/metadata";
import { supabase } from "@/lib/supabase/client";
import { userFacingSaveError } from "@/lib/userFacingErrors";

const disciplines = ["Leirduesti", "Compak Sporting", "FITASC Sporting", "English Sporting", "Other"];

type EntryMode = "hits" | "misses";

function numberValue(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function QuickCompetitionScorePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [competitionDate, setCompetitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [discipline, setDiscipline] = useState("Leirduesti");
  const [totalTargets, setTotalTargets] = useState("100");
  const [courseCount, setCourseCount] = useState("4");
  const [targetsPerCourse, setTargetsPerCourse] = useState("25");
  const [startCourse, setStartCourse] = useState("1");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("hits");
  const [courseTargets, setCourseTargets] = useState<Record<number, string>>({});
  const [entries, setEntries] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const targetTotal = Math.max(1, Math.floor(numberValue(totalTargets, 100)));
  const postCount = Math.max(1, Math.floor(numberValue(courseCount, 1)));
  const start = Math.min(Math.max(1, Math.floor(numberValue(startCourse, 1))), postCount);
  const evenTargets = targetTotal % postCount === 0 ? targetTotal / postCount : Math.max(1, Math.floor(numberValue(targetsPerCourse, 1)));
  const order = useMemo(() => generateCourseOrder(postCount, start), [postCount, start]);
  const rows = order.map((course) => {
    const targets = Math.max(1, Math.floor(numberValue(courseTargets[course] ?? String(evenTargets), evenTargets)));
    const entered = Math.max(0, Math.floor(numberValue(entries[course] ?? "0", 0)));
    const hits = entryMode === "hits" ? Math.min(entered, targets) : Math.max(targets - Math.min(entered, targets), 0);
    const misses = entryMode === "misses" ? Math.min(entered, targets) : Math.max(targets - Math.min(entered, targets), 0);
    return { course, targets, hits, misses } satisfies QuickScoreCourse;
  });
  const calculatedTargets = rows.reduce((sum, row) => sum + row.targets, 0);
  const totalHits = rows.reduce((sum, row) => sum + row.hits, 0);
  const totalMisses = rows.reduce((sum, row) => sum + row.misses, 0);

  function updateCourseCount(value: string) {
    setCourseCount(value);
    const count = Math.max(1, Math.floor(numberValue(value, 1)));
    if (numberValue(startCourse, 1) > count) setStartCourse(String(count));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");
    if (!name.trim() || !competitionDate) {
      setErr("Competition name and date are required.");
      return;
    }
    if (calculatedTargets !== targetTotal) {
      setErr("Course/post target counts must add up to the total targets before saving.");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data, error } = await supabase.from("sessions").insert({
      user_id: u.user.id,
      name: name.trim(),
      discipline,
      session_type: "Competition",
      shooting_format: "Quick score",
      course_count: postCount,
      total_targets: targetTotal,
      competition_date: competitionDate,
      shooting_ground: location.trim() || null,
      own_score: totalHits,
      winning_score: null,
      notes: serializeQuickScoreNotes({ marker: "quick_competition_score", version: 1, resultOnly: true, totalTargets: targetTotal, totalHits, totalMisses, startCourse: start, courseOrder: order, breakdown: rows, userNotes: notes }),
    }).select("id").single<{ id: string }>();
    setSaving(false);
    if (error) {
      setErr(userFacingSaveError(error, "Could not save this quick score right now. Try again when online."));
      return;
    }
    router.push(data?.id ? `/sessions/${data.id}` : "/results");
  }

  return (
    <main className="container narrow">
      <form className="card quickScoreCard" onSubmit={save}>
        <p className="eyebrow">Quick competition score</p>
        <h2>Result-only competition logging</h2>
        <p className="muted">Log hits or misses per course/post without detailed target setup. Detailed misses and target definitions can be added later.</p>

        <label>Competition name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="NM Leirduesti, Kahn Arms Cup..." required />
        <div className="row">
          <div><label>Date</label><input value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" required /></div>
          <div><label>Discipline</label><select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>{disciplines.map((item) => <option key={item}>{item}</option>)}</select></div>
        </div>
        <div className="row">
          <div><label>Total targets</label><input value={totalTargets} onChange={(e) => setTotalTargets(e.target.value)} type="number" min="1" inputMode="numeric" required /></div>
          <div><label>Courses/posts</label><input value={courseCount} onChange={(e) => updateCourseCount(e.target.value)} type="number" min="1" inputMode="numeric" required /></div>
        </div>
        <div className="row">
          <div><label>Targets per course/post</label><input value={targetsPerCourse} onChange={(e) => setTargetsPerCourse(e.target.value)} type="number" min="1" inputMode="numeric" /></div>
          <div><label>Start course/post</label><input value={startCourse} onChange={(e) => setStartCourse(e.target.value)} type="number" min="1" max={postCount} inputMode="numeric" required /></div>
        </div>
        <label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />

        <div className="quickScorePanel">
          <div className="sectionHeader compactSectionHeader"><div><p className="eyebrow">Order</p><h3>Course/post order</h3></div></div>
          <p className="quickOrderLine">{order.join(" → ")}</p>
          <p className={calculatedTargets === targetTotal ? "small muted" : "small error"}>Targets assigned: {calculatedTargets} / {targetTotal}</p>
        </div>

        <div className="quickScorePanel">
          <div className="quickEntryHeader">
            <div><p className="eyebrow">Scores</p><h3>Enter {entryMode === "hits" ? "hits" : "misses"} per course/post</h3></div>
            <div className="segmentedControl" aria-label="Entry mode">
              <button type="button" className={entryMode === "hits" ? "activeSegment" : ""} onClick={() => setEntryMode("hits")}>Hits</button>
              <button type="button" className={entryMode === "misses" ? "activeSegment" : ""} onClick={() => setEntryMode("misses")}>Misses</button>
            </div>
          </div>
          <div className="quickScoreList">
            {rows.map((row) => (
              <div className="quickScoreRow" key={row.course}>
                <strong>Course/post {row.course}</strong>
                <label>Targets<input value={courseTargets[row.course] ?? String(evenTargets)} onChange={(e) => setCourseTargets((items) => ({ ...items, [row.course]: e.target.value }))} type="number" min="1" inputMode="numeric" /></label>
                <label>{entryMode === "hits" ? "Hits" : "Misses"}<input value={entries[row.course] ?? ""} onChange={(e) => setEntries((items) => ({ ...items, [row.course]: e.target.value }))} type="number" min="0" max={row.targets} inputMode="numeric" placeholder="0" /></label>
                <span className="small muted">{row.hits}/{row.targets} · misses {row.misses}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="quickScoreSummary"><strong>Total score {totalHits} / {calculatedTargets}</strong><span>Misses {totalMisses}</span></div>
        <label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        {err && <div className="error">{err}</div>}
        <div className="btns"><button disabled={saving}>{saving ? "Saving..." : "Save quick score"}</button><Link className="button secondary" href="/log-competition">Cancel</Link></div>
      </form>
    </main>
  );
}
