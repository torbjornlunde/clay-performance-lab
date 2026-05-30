"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { defaultStartPlateForShooter, getSchemeOptions, plateRotation } from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

type Session = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  total_targets: number | null;
  sporttrap_series_count: number | null;
  leirdue_result_url: string | null;
  shooting_ground: string | null;
  competition_date: string | null;
  own_score: number | null;
  winning_score: number | null;
};

type CourseSetup = {
  id?: string;
  courseNumber: number;
  scheme: number | null;
  shooterNumber: number;
  startPlate: number;
};

type CourseRow = {
  id: string;
  course_number: number;
  fitasc_scheme: number | null;
  shooter_number: number | null;
  start_plate: number | null;
};

function makeCourses(count: number, old: CourseSetup[]) {
  return Array.from({ length: count }, (_, i) =>
    old[i]
      ? { ...old[i], courseNumber: i + 1 }
      : { courseNumber: i + 1, scheme: null, shooterNumber: 1, startPlate: 1 },
  );
}

export default function EditSessionPage() {
  const params = useParams();
  const router = useRouter();
  const schemes = useMemo(() => getSchemeOptions(), []);
  const sessionId = typeof params?.id === "string" ? params.id : "";
  const [loaded, setLoaded] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [sessionType, setSessionType] = useState("Training");
  const [format, setFormat] = useState("Inline");
  const [count, setCount] = useState(1);
  const [courses, setCourses] = useState<CourseSetup[]>([]);
  const [sporttrapSeriesCount, setSporttrapSeriesCount] = useState(1);
  const [leirduestiPostCount, setLeirduestiPostCount] = useState(8);
  const [competitionDate, setCompetitionDate] = useState("");
  const [shootingGround, setShootingGround] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    setSessionLoaded(false);
    setErr("");

    if (!sessionId) {
      setErr("Invalid session id in route.");
      setLoaded(true);
      return;
    }

    const { data: u, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setErr(authError.message);
      setLoaded(true);
      return;
    }
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id,name,discipline,session_type,shooting_format,course_count,total_targets,sporttrap_series_count,leirdue_result_url,shooting_ground,competition_date,own_score,winning_score")
      .eq("id", sessionId)
      .maybeSingle<Session>();

    if (sessionError) {
      setErr(sessionError.message);
      setLoaded(true);
      return;
    }

    if (!session) {
      setErr("Session not found, or your account does not have access to it. If this session exists, Supabase row-level security may be blocking access.");
      setLoaded(true);
      return;
    }

    const { data: courseRows, error: courseError } = await supabase
      .from("session_courses")
      .select("id,course_number,fitasc_scheme,shooter_number,start_plate")
      .eq("session_id", sessionId)
      .order("course_number")
      .returns<CourseRow[]>();

    if (courseError) {
      setErr(courseError.message);
      setLoaded(true);
      return;
    }

    const sporttrapSeries = session.sporttrap_series_count || (session.discipline === "Sporttrap" && session.total_targets ? Math.max(Math.round(session.total_targets / 25), 1) : 1);
    const isLeirduesti = session.discipline === "Leirduesti";
    const nextCount = session.discipline === "Sporttrap" ? 1 : session.course_count || Math.max(courseRows?.length || 0, isLeirduesti ? 8 : 1);
    const mappedCourses = (courseRows || []).map((course) => ({
      id: course.id,
      courseNumber: course.course_number,
      scheme: course.fitasc_scheme,
      shooterNumber: course.shooter_number || 1,
      startPlate: course.start_plate || defaultStartPlateForShooter(course.shooter_number || 1),
    }));

    setName(session.name || "");
    setDiscipline(session.discipline || "Other");
    setSessionType(session.session_type || "Training");
    setFormat(session.shooting_format || "Inline");
    setCount(nextCount);
    setLeirduestiPostCount(nextCount);
    setCourses(makeCourses(nextCount, mappedCourses));
    setSporttrapSeriesCount(sporttrapSeries);
    setCompetitionDate((session.competition_date || "").slice(0, 10));
    setShootingGround(session.shooting_ground || "");
    setLeirdueResultUrl(session.leirdue_result_url || "");
    setOwnScore(session.own_score === null || session.own_score === undefined ? "" : String(session.own_score));
    setWinningScore(session.winning_score === null || session.winning_score === undefined ? "" : String(session.winning_score));
    setSessionLoaded(true);
    setLoaded(true);
  }, [router, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  function setCourseCount(n: number) {
    setCount(n);
    setCourses((c) => makeCourses(n, c));
  }

  function setPostCount(n: number) {
    setLeirduestiPostCount(n);
    setCount(n);
    setCourses((c) => makeCourses(n, c));
  }

  function updateCourse(i: number, update: Partial<CourseSetup>) {
    setCourses((c) => c.map((x, idx) => (idx === i ? { ...x, ...update } : x)));
  }

  async function save() {
    setErr("");
    setSaving(true);

    if (!sessionLoaded || !sessionId) {
      setErr("Session has not loaded yet.");
      setSaving(false);
      return;
    }

    const isSporttrap = discipline === "Sporttrap";
    const isCompak = discipline === "Compak Sporting";
    const isLeirduesti = discipline === "Leirduesti";

    const { error: sessionError } = await supabase
      .from("sessions")
      .update({
        name: name.trim() || "Unnamed session",
        session_type: sessionType,
        ...(isCompak
          ? { shooting_format: format, course_count: count, total_targets: count * 25 }
          : isSporttrap
            ? { shooting_format: "Sporttrap", course_count: 1, sporttrap_series_count: sporttrapSeriesCount, total_targets: sporttrapSeriesCount * 25 }
            : isLeirduesti
              ? { shooting_format: "Post-based", course_count: leirduestiPostCount, total_targets: leirduestiPostCount * 5 }
              : {}),
        competition_date: competitionDate || null,
        shooting_ground: shootingGround.trim() || null,
        own_score: ownScore === "" ? null : Number(ownScore),
        winning_score: winningScore === "" ? null : Number(winningScore),
        leirdue_result_url: leirdueResultUrl.trim() || null,
      })
      .eq("id", sessionId);

    if (sessionError) {
      setErr(sessionError.message);
      setSaving(false);
      return;
    }

    if (isCompak || isSporttrap || isLeirduesti) {
      const rows = isSporttrap ? makeCourses(1, courses) : isLeirduesti ? makeCourses(leirduestiPostCount, courses) : courses;
      for (const course of rows) {
        const row = {
          session_id: sessionId,
          course_number: course.courseNumber,
          fitasc_scheme: isCompak ? course.scheme : null,
          shooter_number: isSporttrap ? course.shooterNumber : null,
          start_plate: isCompak && format === "Squad" ? course.startPlate : null,
        };

        if (course.id) {
          const { error } = await supabase.from("session_courses").update(row).eq("id", course.id).eq("session_id", sessionId);
          if (error) {
            setErr(error.message);
            setSaving(false);
            return;
          }
        } else {
          const { data, error } = await supabase.from("session_courses").insert(row).select("id").single();
          if (error || !data) {
            setErr(error?.message || "Could not add course.");
            setSaving(false);
            return;
          }
        }
      }
    }

    router.push(`/sessions/${sessionId}`);
  }

  if (!loaded) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  if (!sessionLoaded) {
    return (
      <main>
        <div className="card">
          <h2>Edit setup</h2>
          {err && <div className="error">{err}</div>}
          <div className="btns">
            <Link className="button secondary" href="/dashboard">
              Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Edit setup</h2>
        <label>Session name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
        <label>Date</label>
        <input className="compactDateInput" value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" />
        <label>Shooting ground</label>
        <input value={shootingGround} onChange={(e) => setShootingGround(e.target.value)} placeholder="Kismul, Karmøy, Stavanger..." />
        <label>Leirdue.net result URL</label>
        <input
          value={leirdueResultUrl}
          onChange={(e) => setLeirdueResultUrl(e.target.value)}
          placeholder="Optional"
          type="url"
        />
        <span className="pill">{discipline}</span>
        <div className="row">
          <div>
            <label>Session type</label>
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
              <option>Training</option>
              <option>Competition</option>
            </select>
          </div>
          {discipline === "Compak Sporting" && (
            <div>
              <label>Shooting format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option>Inline</option>
                <option>Squad</option>
              </select>
            </div>
          )}
        </div>
        {(sessionType === "Competition" || ownScore || winningScore) && (
          <div className="subcard">
            <h3>Competition result</h3>
            <p className="small muted">Own score is optional if you log all misses. Winning score is needed for performance percentage.</p>
            <div className="row">
              <div>
                <label>Own score</label>
                <input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} type="number" min="0" inputMode="numeric" />
              </div>
              <div>
                <label>Winning score</label>
                <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} type="number" min="0" inputMode="numeric" />
              </div>
            </div>
          </div>
        )}
        {discipline === "Sporttrap" && (
          <div className="subcard">
            <h3>Sporttrap setup</h3>
            <p className="small muted">Each 25-target series uses the fixed Sporttrap program. Total targets: {sporttrapSeriesCount * 25}.</p>
            <label>Number of 25-target series</label>
            <select value={sporttrapSeriesCount} onChange={(e) => setSporttrapSeriesCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label>Shooter / stand number</label>
            <select value={courses[0]?.shooterNumber || 1} onChange={(e) => updateCourse(0, { shooterNumber: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {discipline === "Compak Sporting" && (
          <>
            <label>Number of courses/layouts</label>
            <select value={count} onChange={(e) => setCourseCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <h3>Courses</h3>
            {courses.map((course, i) => (
          <div className="subcard" key={course.courseNumber}>
            <h3>Course {course.courseNumber}</h3>
            <label>FITASC scheme</label>
            <select value={course.scheme ?? ""} onChange={(e) => updateCourse(i, { scheme: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Unknown / set later</option>
              {schemes.map((option) => (
                <option key={option.scheme} value={option.scheme}>
                  {option.label}
                </option>
              ))}
            </select>
            {format === "Squad" && (
              <>
                <div className="row">
                  <div>
                    <label>Shooter number</label>
                    <select
                      value={course.shooterNumber}
                      onChange={(e) => {
                        const shooterNumber = Number(e.target.value);
                        updateCourse(i, { shooterNumber, startPlate: defaultStartPlateForShooter(shooterNumber) });
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Starting plate</label>
                    <select value={course.startPlate} onChange={(e) => updateCourse(i, { startPlate: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="small muted">Rotation: {plateRotation(course.startPlate).join(" → ")}</p>
              </>
            )}
          </div>
            ))}
          </>
        )}
        {discipline === "Leirduesti" && (
          <div className="subcard">
            <h3>Leirduesti setup</h3>
            <p className="small muted">Ordinary Leirduesti is logged by post. Each post has five missable target opportunities.</p>
            <label>Number of posts</label>
            <select value={leirduestiPostCount} onChange={(e) => setPostCount(Number(e.target.value))}>
              {[4, 5, 6, 7, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving || !sessionLoaded || !loaded}>
            {saving ? "Saving..." : "Save setup"}
          </button>
          <Link className="button secondary" href={sessionId ? `/sessions/${sessionId}` : "/dashboard"}>
            Cancel
          </Link>
        </div>
      </div>
    </main>
  );
}
