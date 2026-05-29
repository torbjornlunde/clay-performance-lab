"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSchemeType, plateRotation } from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { router.push("/login"); return; }
    const { data: sessionData } = await supabase.from("sessions").select("*").eq("id", params.id).single();
    const { data: courseData } = await supabase.from("session_courses").select("*").eq("session_id", params.id).order("course_number");
    const { count: missCount } = await supabase.from("misses").select("id", { count: "exact", head: true }).eq("session_id", params.id);
    setSession(sessionData); setCourses(courseData || []); setCount(missCount || 0);
  }

  if (!session) return <main><div className="card">Loading...</div></main>;

  const calculatedScore = typeof session.total_targets === "number" ? Math.max(session.total_targets - count, 0) : null;
  const scoreUsed = typeof session.own_score === "number" ? session.own_score : calculatedScore;
  const percentage = typeof scoreUsed === "number" && typeof session.winning_score === "number" && session.winning_score > 0 ? (scoreUsed / session.winning_score) * 100 : null;
  const resultOnly = session.session_type === "Competition" && session.own_score !== null && session.winning_score !== null && courses.length === 0 && count === 0;

  return (
    <main>
      <div className="card">
        <h2>{session.name}</h2>
        <span className="pill">{formatDate(session.competition_date || session.created_at)}</span>
        <span className="pill">{session.discipline}</span>
        <span className="pill">{session.session_type}</span>
        {resultOnly && <span className="pill">Result only</span>}
        {session.shooting_format && <span className="pill">{session.shooting_format}</span>}
        <div className="summaryGrid">
          <div className="summaryStat"><span>Total targets</span><strong>{session.total_targets ?? "-"}</strong></div>
          <div className="summaryStat"><span>Registered misses</span><strong>{count}</strong></div>
          <div className="summaryStat"><span>Calculated score</span><strong>{calculatedScore ?? "-"}</strong></div>
          <div className="summaryStat"><span>Manual/official score</span><strong>{session.own_score ?? "-"}</strong></div>
          <div className="summaryStat"><span>Winning score</span><strong>{session.winning_score ?? "-"}</strong></div>
          <div className="summaryStat"><span>Performance</span><strong>{percentage === null ? "-" : `${percentage.toFixed(1)}%`}</strong></div>
        </div>
        {typeof session.own_score === "number" && typeof calculatedScore === "number" && session.own_score !== calculatedScore && (
          <div className="notice">Manual score differs from logged misses. This can happen if not all misses were logged.</div>
        )}
        <div className="btns">
          <Link href={`/sessions/${session.id}/log`} className="button">Log miss</Link>
          <Link href={`/sessions/${session.id}/analysis`} className="button secondary">Analysis</Link>
          <Link href={`/sessions/${session.id}/edit`} className="button secondary">Edit setup</Link>
          <Link href={`/sessions/${session.id}/targets`} className="button secondary">Target definitions</Link>
          <Link href="/dashboard" className="button secondary">Dashboard</Link>
          {session.leirdue_result_url && <a href={session.leirdue_result_url} target="_blank" rel="noreferrer" className="button secondary">Open Leirdue.net result</a>}
        </div>
      </div>
      {session.discipline === "Compak Sporting" && courses.length > 0 && (
        <div className="card"><h2>Courses</h2>{courses.map((course) => <div className="subcard" key={course.id}><strong>Course {course.course_number}</strong><div className="small muted">{course.fitasc_scheme ? `Scheme ${course.fitasc_scheme} — ${getSchemeType(course.fitasc_scheme)}` : "FITASC scheme not set yet"}</div>{session.shooting_format === "Squad" && course.start_plate && <div className="small muted">Shooter {course.shooter_number} · starts plate {course.start_plate} · rotation {plateRotation(course.start_plate).join(" → ")}</div>}</div>)}</div>
      )}
    </main>
  );
}
