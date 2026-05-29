"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSchemeType, plateRotation } from "@/lib/fitasc/schemes";
import { supabase } from "@/lib/supabase/client";

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data: sessionData } = await supabase.from("sessions").select("*").eq("id", params.id).single();
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("*")
      .eq("session_id", params.id)
      .order("course_number");
    const { count: missCount } = await supabase.from("misses").select("id", { count: "exact", head: true }).eq("session_id", params.id);
    setSession(sessionData);
    setCourses(courseData || []);
    setCount(missCount || 0);
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
        <h2>{session.name}</h2>
        <span className="pill">{session.discipline}</span>
        <span className="pill">{session.session_type}</span>
        {session.shooting_format && <span className="pill">{session.shooting_format}</span>}
        <span className="pill">
          Misses <strong>{count}</strong>
        </span>
        <div className="btns">
          <Link href={`/sessions/${session.id}/log`} className="button">
            Log miss
          </Link>
          {session.leirdue_result_url && (
            <a href={session.leirdue_result_url} target="_blank" rel="noreferrer" className="button secondary">
              Open Leirdue.net result
            </a>
          )}
          <Link href={`/sessions/${session.id}/edit`} className="button secondary">
            Edit setup
          </Link>
          <Link href={`/sessions/${session.id}/analysis`} className="button secondary">
            Analysis
          </Link>
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
        </div>
      </div>
      {session.discipline === "Compak Sporting" && (
        <div className="card">
          <h2>Courses</h2>
          {courses.map((course) => (
            <div className="subcard" key={course.id}>
              <strong>Course {course.course_number}</strong>
              <div className="small muted">
                {course.fitasc_scheme ? `Scheme ${course.fitasc_scheme} — ${getSchemeType(course.fitasc_scheme)}` : "FITASC scheme not set yet"}
              </div>
              {session.shooting_format === "Squad" && course.start_plate && (
                <div className="small muted">
                  Shooter {course.shooter_number} · starts plate {course.start_plate} · rotation {plateRotation(course.start_plate).join(" → ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
