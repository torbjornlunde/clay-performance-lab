"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultStartPlateForShooter, getSchemeOptions, plateRotation } from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

type CourseSetup = {
  courseNumber: number;
  scheme: number | null;
  shooterNumber: number;
  startPlate: number;
};

function makeCourses(count: number, old: CourseSetup[]) {
  return Array.from({ length: count }, (_, i) =>
    old[i]
      ? { ...old[i], courseNumber: i + 1 }
      : { courseNumber: i + 1, scheme: null, shooterNumber: 1, startPlate: 1 },
  );
}

export default function NewSessionPage() {
  const router = useRouter();
  const schemes = useMemo(() => getSchemeOptions(), []);
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [sessionType, setSessionType] = useState("Training");
  const [format, setFormat] = useState("Inline");
  const [count, setCount] = useState(3);
  const [courses, setCourses] = useState<CourseSetup[]>(makeCourses(3, []));
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

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
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const isCompak = discipline === "Compak Sporting";
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        user_id: u.user.id,
        name: name.trim() || "Unnamed session",
        discipline,
        session_type: sessionType,
        shooting_format: isCompak ? format : null,
        course_count: isCompak ? count : null,
        total_targets: isCompak ? count * 25 : null,
        leirdue_result_url: leirdueResultUrl.trim() || null,
      })
      .select("id")
      .single();

    if (error || !session) {
      setErr(error?.message || "Could not save");
      setSaving(false);
      return;
    }

    if (isCompak) {
      const rows = courses.map((course) => ({
        session_id: session.id,
        course_number: course.courseNumber,
        fitasc_scheme: course.scheme,
        shooter_number: format === "Squad" ? course.shooterNumber : null,
        start_plate: format === "Squad" ? course.startPlate : null,
      }));
      const { error: courseError } = await supabase.from("session_courses").insert(rows);
      if (courseError) {
        setErr(courseError.message);
        setSaving(false);
        return;
      }
    }

    router.push(`/sessions/${session.id}`);
  }

  return (
    <main>
      <div className="card">
        <h2>New session</h2>
        <label>Session name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
        <label>Leirdue.net result URL</label>
        <input
          value={leirdueResultUrl}
          onChange={(e) => setLeirdueResultUrl(e.target.value)}
          placeholder="https://www.leirdue.net/..."
          type="url"
        />
        <div className="row">
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
          <div>
            <label>Session type</label>
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
              <option>Training</option>
              <option>Competition</option>
            </select>
          </div>
        </div>
        {discipline === "Compak Sporting" && (
          <>
            <div className="row">
              <div>
                <label>Number of courses/layouts</label>
                <select value={count} onChange={(e) => setCourseCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Shooting format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option>Inline</option>
                  <option>Squad</option>
                </select>
              </div>
            </div>
            <h3>Courses</h3>
            {courses.map((course, i) => (
              <div className="subcard" key={course.courseNumber}>
                <h3>Course {course.courseNumber}</h3>
                <label>FITASC scheme</label>
                <select
                  value={course.scheme ?? ""}
                  onChange={(e) => updateCourse(i, { scheme: e.target.value ? Number(e.target.value) : null })}
                >
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
            {saving ? "Saving..." : "Save session"}
          </button>
          <button className="secondary" onClick={() => router.push("/dashboard")}>
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
