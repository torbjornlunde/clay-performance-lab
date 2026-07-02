"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isPostBasedSportingDiscipline } from "@/lib/disciplines";
import { optionsWithCurrent, targetDetailsHaveValue, targetDetailsSummary, TARGET_ANGLES, TARGET_DIFFICULTIES, TARGET_DIRECTIONS, TARGET_DISTANCES, TARGET_SPEEDS, TARGET_TYPES } from "@/lib/targets/targetDetails";
import { PostTargetEditor } from "./PostTargetEditor";

const machines = ["A", "B", "C", "D", "E", "F"];
const targetTypes = [...TARGET_TYPES];
const directions = [...TARGET_DIRECTIONS];
const angles = [...TARGET_ANGLES];
const speeds = [...TARGET_SPEEDS];
const distances = [...TARGET_DISTANCES];
const difficulties = [...TARGET_DIFFICULTIES];

type Definition = {
  machine: string;
  target_type: string;
  direction: string;
  angle: string;
  speed: string;
  distance: string;
  difficulty: string;
  notes: string;
};

type DefinitionRow = Definition & {
  session_id?: string;
  course_number?: number;
  updated_at?: string;
};
function blank(): Record<string, Definition> {
  return Object.fromEntries(
    machines.map((machine) => [
      machine,
      {
        machine,
        target_type: "Unknown",
        direction: "Unknown",
        angle: "Unknown",
        speed: "Unknown",
        distance: "Unknown",
        difficulty: "Unknown",
        notes: "",
      },
    ]),
  );
}

export default function TargetDefinitionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [courses, setCourses] = useState<number[]>([1]);
  const [courseNumber, setCourseNumber] = useState(1);
  const [copyFrom, setCopyFrom] = useState(1);
  const [copyTo, setCopyTo] = useState(1);
  const [defs, setDefs] = useState<Record<string, Definition>>(blank());
  const [msg, setMsg] = useState("");

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    loadDefinitions(courseNumber);
  }, [courseNumber]);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data: sessionData } = await supabase
      .from("sessions")
      .select("id,name,discipline,course_count,post_count,total_targets,targets_per_post,default_post_format,own_score,winning_score")
      .eq("id", params.id)
      .single();
    const { data: courseRows } = await supabase
      .from("session_courses")
      .select("course_number")
      .eq("session_id", params.id)
      .order("course_number");
    setSession(sessionData);
    const nums = (courseRows || []).map((row: any) => row.course_number);
    const finalNums = nums.length
      ? nums
      : Array.from({ length: sessionData?.course_count || 1 }, (_, i) => i + 1);
    setCourses(finalNums);
    setCourseNumber(finalNums[0] || 1);
    setCopyFrom(finalNums[0] || 1);
    setCopyTo(finalNums[1] || finalNums[0] || 1);
  }

  async function loadDefinitions(course: number) {
    const { data } = await supabase
      .from("session_target_definitions")
      .select("machine,target_type,direction,angle,speed,distance,difficulty,notes")
      .eq("session_id", params.id)
      .eq("course_number", course);
    const next = blank();
    (data || []).forEach((row: any) => {
      next[row.machine] = {
        ...next[row.machine],
        ...row,
        notes: row.notes || "",
      };
    });
    setDefs(next);
  }

  function update(machine: string, field: keyof Definition, value: string) {
    setDefs((old) => ({
      ...old,
      [machine]: { ...old[machine], [field]: value },
    }));
  }
  async function save() {
    setMsg("");
    const rows = machines.map((machine) => ({
      session_id: params.id,
      course_number: courseNumber,
      ...defs[machine],
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("session_target_definitions")
      .upsert(rows, { onConflict: "session_id,course_number,machine" });
    setMsg(error ? error.message : "Target definitions saved");
  }

  async function definitionsFor(course: number): Promise<DefinitionRow[]> {
    const { data, error } = await supabase
      .from("session_target_definitions")
      .select("machine,target_type,direction,angle,speed,distance,difficulty,notes")
      .eq("session_id", params.id)
      .eq("course_number", course);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      machine: row.machine,
      target_type: row.target_type || "Unknown",
      direction: row.direction || "Unknown",
      angle: row.angle || "Unknown",
      speed: row.speed || "Unknown",
      distance: row.distance || "Unknown",
      difficulty: row.difficulty || "Unknown",
      notes: row.notes || "",
    }));
  }

  function currentDefinitionRows(): DefinitionRow[] {
    return machines.map((machine) => ({ ...defs[machine] }));
  }

  function hasSourceDefinitions(source: DefinitionRow[]) {
    return source.some(
      (definition) =>
        definition.target_type !== "Unknown" ||
        definition.direction !== "Unknown" ||
        definition.angle !== "Unknown" ||
        definition.speed !== "Unknown" ||
        definition.distance !== "Unknown" ||
        definition.difficulty !== "Unknown" ||
        Boolean(definition.notes.trim()),
    );
  }

  async function copyDefinitions(
    sourceCourse: number,
    destinationCourses: number[],
    copyAll = false,
  ) {
    setMsg("");
    try {
      const destinations = Array.from(
        new Set(destinationCourses.filter((course) => course !== sourceCourse)),
      );
      if (destinations.length === 0) {
        setMsg("No other courses to copy to.");
        return;
      }

      const source =
        sourceCourse === courseNumber
          ? currentDefinitionRows()
          : await definitionsFor(sourceCourse);
      if (source.length === 0 || !hasSourceDefinitions(source)) {
        setMsg("No target definitions to copy from this course.");
        return;
      }

      const existingDestinations: number[] = [];
      for (const destination of destinations) {
        const existing = await definitionsFor(destination);
        if (existing.length > 0 && hasSourceDefinitions(existing))
          existingDestinations.push(destination);
      }
      if (existingDestinations.length > 0) {
        const warning =
          existingDestinations.length === 1
            ? `This will overwrite existing target definitions for Course ${existingDestinations[0]}.`
            : `This will overwrite existing target definitions for Courses ${existingDestinations.join(", ")}.`;
        if (!window.confirm(`${warning}\n\nContinue?`)) return;
      }

      const now = new Date().toISOString();
      const rows = destinations.flatMap((destination) =>
        source.map((definition) => ({
          session_id: params.id,
          course_number: destination,
          machine: definition.machine,
          target_type: definition.target_type,
          direction: definition.direction,
          angle: definition.angle,
          speed: definition.speed,
          distance: definition.distance,
          difficulty: definition.difficulty,
          notes: definition.notes.trim() || null,
          updated_at: now,
        })),
      );
      const { error } = await supabase
        .from("session_target_definitions")
        .upsert(rows, { onConflict: "session_id,course_number,machine" });
      if (error) throw error;

      if (destinations.includes(courseNumber))
        await loadDefinitions(courseNumber);
      setMsg(
        copyAll
          ? "Target definitions copied to all courses."
          : `Copied Course ${sourceCourse} definitions to Course ${destinations[0]}.`,
      );
    } catch (err) {
      setMsg(
        err instanceof Error
          ? err.message
          : "Could not copy target definitions.",
      );
    }
  }

  function buttonGroup(
    machine: string,
    field: keyof Definition,
    options: string[],
  ) {
    return (
      <div className="quickButtonGrid compactQuickGrid">
        {optionsWithCurrent(options, defs[machine][field]).map((option) => (
          <button
            type="button"
            key={option}
            className={
              defs[machine][field] === option
                ? "quickButton selected"
                : "quickButton"
            }
            onClick={() => update(machine, field, option)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  function clearMachineDetails(machine: string) {
    const current = defs[machine];
    const hasDetails = targetDetailsHaveValue({
      targetType: current.target_type,
      direction: current.direction,
      angle: current.angle,
      speed: current.speed,
      distance: current.distance,
      difficulty: current.difficulty,
      notes: current.notes,
    });
    if (hasDetails && !window.confirm(`Clear optional details for Machine ${machine}? The A-F target and program references will remain.`)) return;
    setDefs((old) => ({ ...old, [machine]: { ...blank()[machine] } }));
  }

  function machineDetailsSummary(machine: string) {
    const current = defs[machine];
    return targetDetailsSummary({
      angle: current.angle,
      speed: current.speed,
      distance: current.distance,
      difficulty: current.difficulty,
      notes: current.notes,
    });
  }

  if (!session)
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  if (isPostBasedSportingDiscipline(session.discipline)) {
    return (
      <main>
        <PostTargetEditor session={session} courseRows={courses.map((course_number) => ({ course_number }))} />
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Target definitions</h2><p className="small muted">Set target details for each course using machines A–F. FITASC schemes are configured on the session setup page.</p>
        <p className="small muted">{session.name}</p>
        <label>Course</label>
        <select
          value={courseNumber}
          onChange={(e) => setCourseNumber(Number(e.target.value))}
        >
          {courses.map((n) => (
            <option key={n} value={n}>
              Course {n}
            </option>
          ))}
        </select>
        <div className="subcard">
          <h3>Copy / reuse definitions</h3>
          <p className="small muted">
            Copies target type, direction / angle, speed, distance, difficulty
            and notes.
          </p>
          <div className="btns">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                copyDefinitions(
                  courseNumber,
                  courses.filter((course) => course !== courseNumber),
                  true,
                )
              }
            >
              Copy to all courses
            </button>
          </div>
          <div className="row">
            <div>
              <label>Copy from course</label>
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(Number(e.target.value))}
              >
                {courses.map((n) => (
                  <option key={n} value={n}>
                    Course {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Copy to course</label>
              <select
                value={copyTo}
                onChange={(e) => setCopyTo(Number(e.target.value))}
              >
                {courses.map((n) => (
                  <option key={n} value={n}>
                    Course {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => copyDefinitions(copyFrom, [copyTo])}
            disabled={copyFrom === copyTo}
          >
            Copy selected course
          </button>
        </div>
        {machines.map((machine) => (
          <div className="subcard" key={machine}>
            <h3>Machine {machine}</h3>
            <div className="row">
              <div>
                <label>Target type</label>
                <select
                  value={defs[machine].target_type}
                  onChange={(e) =>
                    update(machine, "target_type", e.target.value)
                  }
                >
                  {optionsWithCurrent(targetTypes, defs[machine].target_type).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Direction / angle</label>
                <select
                  value={defs[machine].direction}
                  onChange={(e) => update(machine, "direction", e.target.value)}
                >
                  {optionsWithCurrent(directions, defs[machine].direction).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <details>
              <summary>More target details · {machineDetailsSummary(machine)}</summary>
              <label>Angle</label>
              {buttonGroup(machine, "angle", angles)}
              <label>Speed</label>
              {buttonGroup(machine, "speed", speeds)}
              <label>Distance</label>
              {buttonGroup(machine, "distance", distances)}
              <label>Difficulty</label>
              {buttonGroup(machine, "difficulty", difficulties)}
              <label>Notes</label>
              <textarea
                value={defs[machine].notes}
                onChange={(e) => update(machine, "notes", e.target.value)}
                placeholder="Optional lead, hold point or visual note"
              />
              <button type="button" className="secondary smallButton" onClick={() => clearMachineDetails(machine)}>Clear details</button>
            </details>
          </div>
        ))}
        {msg && (
          <div
            className={
              msg.includes("saved") ||
              msg.includes("Copied") ||
              msg.includes("copied")
                ? "success"
                : "error"
            }
          >
            {msg}
          </div>
        )}
        <div className="btns">
          <button onClick={save}>Save course definitions</button>
          <Link href={`/sessions/${params.id}`} className="button secondary">
            Session
          </Link>
        </div>
      </div>
    </main>
  );
}
