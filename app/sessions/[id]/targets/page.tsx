"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Session = {
  id: string;
  name: string;
  discipline: string;
  course_count: number | null;
};

type Course = {
  course_number: number;
};

type TargetDefinition = {
  session_id: string;
  course_number: number;
  machine: string;
  target_type: string | null;
  direction: string | null;
};

type EditableDefinition = {
  machine: string;
  targetType: string;
  direction: string;
};

const machines = ["A", "B", "C", "D", "E", "F"];
const targetTypes = ["Unknown", "Standard", "Battue", "Midi", "Mini", "Rabbit", "Looper", "Teal", "Chandelle", "Overhead"];
const directions = ["Unknown", "Left to right", "Right to left", "Going away", "Incoming", "Rising", "Dropping", "Quartering", "Overhead"];

function blankDefinitions() {
  return machines.map((machine) => ({ machine, targetType: "Unknown", direction: "Unknown" }));
}

export default function TargetDefinitionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseNumber, setCourseNumber] = useState(1);
  const [definitions, setDefinitions] = useState<EditableDefinition[]>(blankDefinitions());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const courseOptions = useMemo(() => {
    if (courses.length > 0) return courses.map((course) => course.course_number);
    return Array.from({ length: session?.course_count || 1 }, (_, index) => index + 1);
  }, [courses, session?.course_count]);

  useEffect(() => {
    loadSetup();
  }, []);

  useEffect(() => {
    if (session) loadDefinitions(courseNumber);
  }, [courseNumber, session]);

  async function loadSetup() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      router.push("/login");
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("sessions")
      .select("id,name,discipline,course_count")
      .eq("id", params.id)
      .single<Session>();
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("course_number")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<Course[]>();

    if (sessionError || !sessionData) {
      setError(sessionError?.message || "Session not found.");
      setLoading(false);
      return;
    }

    setSession(sessionData);
    setCourses(courseData || []);
    setCourseNumber(courseData?.[0]?.course_number || 1);
    setLoading(false);
  }

  async function loadDefinitions(nextCourseNumber: number) {
    setMessage("");
    setError("");
    const { data, error: definitionsError } = await supabase
      .from("session_target_definitions")
      .select("session_id,course_number,machine,target_type,direction")
      .eq("session_id", params.id)
      .eq("course_number", nextCourseNumber)
      .returns<TargetDefinition[]>();

    if (definitionsError) {
      setError(definitionsError.message);
      setDefinitions(blankDefinitions());
      return;
    }

    setDefinitions(
      blankDefinitions().map((definition) => {
        const saved = data?.find((row) => row.machine === definition.machine);
        return saved
          ? {
              machine: definition.machine,
              targetType: saved.target_type || "Unknown",
              direction: saved.direction || "Unknown",
            }
          : definition;
      }),
    );
  }

  function updateDefinition(index: number, update: Partial<EditableDefinition>) {
    setDefinitions((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)));
  }

  async function saveCourseDefinitions() {
    setMessage("");
    setError("");
    setSaving(true);

    const rows = definitions.map((definition) => ({
      session_id: params.id,
      course_number: courseNumber,
      machine: definition.machine,
      target_type: definition.targetType === "Unknown" ? null : definition.targetType,
      direction: definition.direction === "Unknown" ? null : definition.direction,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("session_target_definitions")
      .upsert(rows, { onConflict: "session_id,course_number,machine" });

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setMessage("Target definitions saved");
  }

  if (loading) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Target definitions</h2>
        <p>Save machine definitions for one course at a time. You can return later and edit the same course.</p>
        {session && <p className="small muted">{session.name}</p>}
        <label>Course</label>
        <select value={courseNumber} onChange={(event) => setCourseNumber(Number(event.target.value))}>
          {courseOptions.map((option) => (
            <option key={option} value={option}>
              Course {option}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>Course {courseNumber}</h2>
        {definitions.map((definition, index) => (
          <div className="subcard" key={definition.machine}>
            <h3>Machine {definition.machine}</h3>
            <div className="row">
              <div>
                <label>Target type</label>
                <select value={definition.targetType} onChange={(event) => updateDefinition(index, { targetType: event.target.value })}>
                  {targetTypes.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Direction</label>
                <select value={definition.direction} onChange={(event) => updateDefinition(index, { direction: event.target.value })}>
                  {directions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
        <div className="btns">
          <button onClick={saveCourseDefinitions} disabled={saving}>
            {saving ? "Saving..." : "Save course definitions"}
          </button>
          <Link className="button secondary" href={`/sessions/${params.id}`}>
            Back to session
          </Link>
        </div>
      </div>
    </main>
  );
}
