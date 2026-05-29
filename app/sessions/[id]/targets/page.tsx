"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getMachineOptions, TargetMachine } from "@/lib/fitasc/compakSchemes";
import { supabase } from "@/lib/supabase/client";

type Session = { id: string; name: string; discipline: string };
type Course = { id: string; course_number: number; fitasc_scheme: number | null };
type TargetDefinition = {
  id?: string;
  session_id?: string;
  course_number: number;
  machine: TargetMachine;
  target_type: string | null;
  direction: string | null;
  speed: string | null;
  distance: string | null;
  difficulty: string | null;
  notes: string | null;
};

const machines = getMachineOptions().filter((machine) => machine !== "Unknown") as Exclude<TargetMachine, "Unknown">[];
const targetTypes = ["Crossing", "Incoming", "Going away", "Rising", "Dropping", "Rabbit", "Looper", "Teal", "Battue", "Other", "Unknown"];
const directions = ["Left to right", "Right to left", "Incoming", "Going away", "Quartering left", "Quartering right", "Unknown"];
const speeds = ["Slow", "Medium", "Fast", "Unknown"];
const distances = ["Close", "Medium", "Long", "Unknown"];
const difficulties = ["Easy", "Medium", "Hard", "Tricky", "Unknown"];

function emptyDefinition(courseNumber: number, machine: TargetMachine): TargetDefinition {
  return {
    course_number: courseNumber,
    machine,
    target_type: "Unknown",
    direction: "Unknown",
    speed: "Unknown",
    distance: "Unknown",
    difficulty: "Unknown",
    notes: "",
  };
}

export default function TargetDefinitionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [definitions, setDefinitions] = useState<TargetDefinition[]>([]);
  const [courseNumber, setCourseNumber] = useState(1);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const visibleDefinitions = useMemo(
    () => machines.map((machine) => definitions.find((definition) => definition.course_number === courseNumber && definition.machine === machine) || emptyDefinition(courseNumber, machine)),
    [courseNumber, definitions],
  );

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data: sessionData } = await supabase.from("sessions").select("id,name,discipline").eq("id", params.id).single<Session>();
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("id,course_number,fitasc_scheme")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<Course[]>();
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select("*")
      .eq("session_id", params.id)
      .order("course_number")
      .order("machine")
      .returns<TargetDefinition[]>();

    setSession(sessionData);
    setCourses(courseData || []);
    setDefinitions(definitionData || []);
    if (courseData?.[0]) setCourseNumber(courseData[0].course_number);
  }

  function updateDefinition(machine: TargetMachine, update: Partial<TargetDefinition>) {
    setDefinitions((current) => {
      const existing = current.find((definition) => definition.course_number === courseNumber && definition.machine === machine);
      if (existing) {
        return current.map((definition) => (definition.course_number === courseNumber && definition.machine === machine ? { ...definition, ...update } : definition));
      }
      return [...current, { ...emptyDefinition(courseNumber, machine), ...update }];
    });
  }

  async function save() {
    setMsg("");
    setSaving(true);

    const rows = visibleDefinitions.map((definition) => ({
      session_id: params.id,
      course_number: courseNumber,
      machine: definition.machine,
      target_type: definition.target_type || "Unknown",
      direction: definition.direction || "Unknown",
      speed: definition.speed || "Unknown",
      distance: definition.distance || "Unknown",
      difficulty: definition.difficulty || "Unknown",
      notes: definition.notes?.trim() || null,
    }));

    const { error } = await supabase.from("session_target_definitions").upsert(rows, { onConflict: "session_id,course_number,machine" });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Target definitions saved");
    await load();
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
        <h2>Target definitions</h2>
        <p className="small muted">Describe machines A-F per course for optional after-the-fact analysis. Logging still works if these are blank.</p>
        <label>Course</label>
        <select value={courseNumber} onChange={(event) => setCourseNumber(Number(event.target.value))}>
          {courses.map((course) => (
            <option key={course.id} value={course.course_number}>
              Course {course.course_number} — {course.fitasc_scheme ? `Scheme ${course.fitasc_scheme}` : "Scheme unknown"}
            </option>
          ))}
        </select>
      </div>

      {visibleDefinitions.map((definition) => (
        <div className="card" key={`${definition.course_number}-${definition.machine}`}>
          <h2>Machine {definition.machine}</h2>
          <div className="row">
            <div>
              <label>Target type</label>
              <select value={definition.target_type || "Unknown"} onChange={(event) => updateDefinition(definition.machine, { target_type: event.target.value })}>
                {targetTypes.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Direction</label>
              <select value={definition.direction || "Unknown"} onChange={(event) => updateDefinition(definition.machine, { direction: event.target.value })}>
                {directions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div>
              <label>Speed</label>
              <select value={definition.speed || "Unknown"} onChange={(event) => updateDefinition(definition.machine, { speed: event.target.value })}>
                {speeds.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Distance</label>
              <select value={definition.distance || "Unknown"} onChange={(event) => updateDefinition(definition.machine, { distance: event.target.value })}>
                {distances.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <label>Difficulty</label>
          <select value={definition.difficulty || "Unknown"} onChange={(event) => updateDefinition(definition.machine, { difficulty: event.target.value })}>
            {difficulties.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <label>Notes</label>
          <textarea value={definition.notes || ""} onChange={(event) => updateDefinition(definition.machine, { notes: event.target.value })} placeholder="Optional notes" />
        </div>
      ))}

      <div className="card">
        {msg && <div className={msg === "Target definitions saved" ? "success" : "error"}>{msg}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving || courses.length === 0}>
            {saving ? "Saving..." : "Save definitions"}
          </button>
          <Link className="button secondary" href={`/sessions/${params.id}`}>
            Back to session
          </Link>
        </div>
      </div>
    </main>
  );
}
