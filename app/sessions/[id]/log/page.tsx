"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getTargetTypeForScheme } from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

type Session = {
  id: string;
  name: string;
  discipline: string;
  shooting_format: string | null;
};

type Course = {
  id: string;
  course_number: number;
  fitasc_scheme: number | null;
  start_plate: number | null;
};

export default function LogPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseNumber, setCourseNumber] = useState(1);
  const [plate, setPlate] = useState(1);
  const [targetNumber, setTargetNumber] = useState(1);
  const [missedTarget, setMissedTarget] = useState("Single target");
  const [whereMiss, setWhereMiss] = useState("Behind");
  const [mainReason, setMainReason] = useState("Technical");
  const [targetRead, setTargetRead] = useState("Normal");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    load();
  }, []);

  const current = useMemo(
    () => courses.find((course) => course.course_number === courseNumber) || courses[0],
    [courses, courseNumber],
  );
  const isCompak = session?.discipline === "Compak Sporting";
  const schemeMissing = Boolean(isCompak && current && !current.fitasc_scheme);
  const targetType = current?.fitasc_scheme ? getTargetTypeForScheme(current.fitasc_scheme, targetNumber) : "Unknown";

  useEffect(() => {
    setMissedTarget(targetType === "Single" ? "Single target" : "Second target in pair");
  }, [targetType]);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: sessionData } = await supabase
      .from("sessions")
      .select("id,name,discipline,shooting_format")
      .eq("id", params.id)
      .single<Session>();
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("id,course_number,fitasc_scheme,start_plate")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<Course[]>();

    setSession(sessionData);
    setCourses(courseData || []);
    if (courseData?.[0]) {
      setCourseNumber(courseData[0].course_number);
      if (sessionData?.shooting_format === "Squad" && courseData[0].start_plate) setPlate(courseData[0].start_plate);
    }
  }

  function changeCourse(n: number) {
    setCourseNumber(n);
    const course = courses.find((x) => x.course_number === n);
    if (session?.shooting_format === "Squad" && course?.start_plate) setPlate(course.start_plate);
    setTargetNumber(1);
  }

  async function save() {
    setMsg("");
    if (!session) {
      setMsg("Session missing.");
      return;
    }
    if (isCompak && !current) {
      setMsg("Course missing.");
      return;
    }

    const { error } = await supabase.from("misses").insert({
      session_id: session.id,
      course_number: isCompak ? courseNumber : null,
      plate: isCompak ? plate : null,
      target_number: isCompak ? targetNumber : null,
      target_label: isCompak ? `Target ${targetNumber}` : null,
      target_type: targetType,
      missed_target: missedTarget,
      where_miss: whereMiss,
      main_reason: mainReason,
      target_read: targetRead,
      comment: comment.trim() || null,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setComment("");
    setMsg("Miss saved.");
  }

  if (!session) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Log miss</h2>
        <p className="small muted">{session.name}</p>
        {session.discipline === "Compak Sporting" && (
          <>
            <div className="row">
              <div>
                <label>Course</label>
                <select value={courseNumber} onChange={(e) => changeCourse(Number(e.target.value))}>
                  {courses.map((course) => (
                    <option key={course.id} value={course.course_number}>
                      Course {course.course_number} — {course.fitasc_scheme ? `Scheme ${course.fitasc_scheme}` : "Scheme unknown"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Plate</label>
                <select value={plate} onChange={(e) => setPlate(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      Plate {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label>Target</label>
            <select value={targetNumber} onChange={(e) => setTargetNumber(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  Target {value}
                </option>
              ))}
            </select>
            <div className="notice small">
              Detected target type: <strong>{targetType}</strong>
            </div>
            {schemeMissing && (
              <div className="notice small">
                No FITASC scheme set for this course yet. You can still log the miss, but target type may be unknown.
              </div>
            )}
          </>
        )}
        <div className="row">
          <div>
            <label>Missed target</label>
            <select value={missedTarget} onChange={(e) => setMissedTarget(e.target.value)}>
              <option>Single target</option>
              <option>First target in pair</option>
              <option>Second target in pair</option>
              <option>Both targets in pair</option>
              <option>Unknown</option>
            </select>
          </div>
          <div>
            <label>Where was the miss?</label>
            <select value={whereMiss} onChange={(e) => setWhereMiss(e.target.value)}>
              <option>Behind</option>
              <option>In front</option>
              <option>Over</option>
              <option>Under</option>
              <option>Not sure</option>
            </select>
          </div>
        </div>
        <div className="row">
          <div>
            <label>Main reason</label>
            <select value={mainReason} onChange={(e) => setMainReason(e.target.value)}>
              <option>Technical</option>
              <option>Tactical</option>
              <option>Mental</option>
              <option>Fatigue</option>
              <option>Target difficulty</option>
              <option>Weather/wind</option>
              <option>Unknown</option>
            </select>
          </div>
          <div>
            <label>Target read</label>
            <select value={targetRead} onChange={(e) => setTargetRead(e.target.value)}>
              <option>Normal</option>
              <option>Looked faster than expected</option>
              <option>Looked slower than expected</option>
              <option>Wind affected</option>
              <option>Poor visibility</option>
              <option>Unknown</option>
            </select>
          </div>
        </div>
        <label>Short comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        {msg && <div className={msg.includes("saved") ? "success" : "error"}>{msg}</div>}
        <div className="btns">
          <button onClick={save}>Save miss</button>
          <Link className="button secondary" href={`/sessions/${params.id}`}>
            Back
          </Link>
          <Link className="button secondary" href={`/sessions/${params.id}/analysis`}>
            Analysis
          </Link>
        </div>
      </div>
    </main>
  );
}
