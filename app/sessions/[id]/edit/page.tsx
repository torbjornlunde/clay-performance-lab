"use client";

import { useEffect, useMemo, useState } from "react";
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
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const schemes = useMemo(() => getSchemeOptions(), []);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [sessionType, setSessionType] = useState("Training");
  const [format, setFormat] = useState("Inline");
  const [count, setCount] = useState(1);
  const [courses, setCourses] = useState<CourseSetup[]>([]);
  const [sporttrapSeriesCount, setSporttrapSeriesCount] = useState(1);
  const [competitionDate, setCompetitionDate] = useState("");
  const [shootingGround, setShootingGround] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("id,name,discipline,session_type,shooting_format,course_count,total_targets,sporttrap_series_count,leirdue_result_url,shooting_ground,competition_date,own_score,winning_score")
      .eq("id", params.id)
      .single<Session>();
    const { data: courseRows } = await supabase
      .from("session_courses")
      .select("id,course_number,fitasc_scheme,shooter_number,start_plate")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<CourseRow[]>();

    if (!session) {
      setErr("Session not found.");
      setLoaded(true);
      return;
    }

    const sporttrapSeries = session.sporttrap_series_count || (session.discipline === "Sporttrap" && session.total_targets ? Math.max(Math.round(session.total_targets / 25), 1) : 1);
    const nextCount = session.discipline === "Sporttrap" ? 1 : session.course_count || Math.max(courseRows?.length || 0, 1);
    const mappedCourses = (courseRows || []).map((course) => ({
      id: course.id,
      courseNumber: course.course_number,
      scheme: course.fitasc_scheme,
      shooterNumber: course.shooter_number || 1,
      startPlate: course.start_plate || defaultStartPlateForShooter(course.shooter_number || 1),
    }));

    setName(session.name);
    setDiscipline(session.discipline);
    setSessionType(session.session_type);
    setFormat(session.shooting_format || "Inline");
    setCount(nextCount);
    setCourses(makeCourses(nextCount, mappedCourses));
    setSporttrapSeriesCount(sporttrapSeries);
    setCompetitionDate(session.competition_date || "");
    setShootingGround(session.shooting_ground || "");
    setLeirdueResultUrl(session.leirdue_result_url || "");
    setOwnScore(session.own_score === null || session.own_score === undefined ? "" : String(session.own_score));
    setWinningScore(session.winning_score === null || session.winning_score === undefined ? "" : String(session.winning_score));
    setLoaded(true);
  }

  function setCourseCount(n: number) {
    setCount(n);
    setCourses((c) => makeCourses(n, c));
  }

  function updateCourse(i: number, update: Partial<CourseSetup>) {
    setCourses((c) => c.map((x, idx) => (idx === i ? { ...x, ...update } : x)));
  }

  async function save() {
    setErr("");
    setSaving(true);

    const isCompak = discipline === "Compak Sporting";
    const isSporttrap = discipline === "Sporttrap";

    const { error: sessionError } = await supabase
      .from("sessions")
      .update({
        name: name.trim() || "Unnamed session",
        session_type: sessionType,
        ...(isCompak
          ? { shooting_format: format, course_count: count, total_targets: count * 25 }
          : isSporttrap
            ? { shooting_format: "Sporttrap", course_count: 1, sporttrap_series_count: sporttrapSeriesCount, total_targets: sporttrapSeriesCount * 25 }
            : {}),
        competition_date: competitionDate || null,
        shooting_ground: shootingGround.trim() || null,
        own_score: ownScore === "" ? null : Number(ownScore),
        winning_score: winningScore === "" ? null : Number(winningScore),
        leirdue_result_url: leirdueResultUrl.trim() || null,
      })
      .eq("id", params.id);

    if (sessionError) {
      setErr(sessionError.message);
      setSaving(false);
      return;
    }

    if (isCompak || isSporttrap) {
      const rows = isSporttrap ? makeCourses(1, courses) : courses;
      for (const course of rows) {
        const row = {
          session_id: params.id,
          course_number: course.courseNumber,
          fitasc_scheme: isSporttrap ? null : course.scheme,
          shooter_number: isSporttrap ? course.shooterNumber : format === "Squad" ? course.shooterNumber : null,
          start_plate: isSporttrap ? null : format === "Squad" ? course.startPlate : null,
        };

        if (course.id) {
          const { error } = await supabase.from("session_courses").update(row).eq("id", course.id).eq("session_id", params.id);
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

    router.push(`/sessions/${params.id}`);
  }

  if (!loaded) {
    return (
      <main>
        <div className="card">Loading...</div>
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
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save setup"}
          </button>
          <Link className="button secondary" href={`/sessions/${params.id}`}>
            Cancel
          </Link>
        </div>
      </div>
    </main>
  );
}
