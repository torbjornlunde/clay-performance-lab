"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const machines = ["A", "B", "C", "D", "E", "F"];
const targetTypes = ["Crossing", "Incoming", "Going away", "Rising", "Dropping", "Rabbit", "Looper", "Teal", "Battue", "Overhead", "Other", "Unknown"];
const directions = ["Left to right", "Right to left", "Incoming", "Going away", "Quartering left", "Quartering right", "Overhead", "Unknown"];
const speeds = ["Slow", "Medium", "Fast", "Unknown"];
const distances = ["Close", "Medium", "Long", "Unknown"];
const difficulties = ["Easy", "Medium", "Hard", "Tricky", "Unknown"];

type Definition = { machine: string; target_type: string; direction: string; speed: string; distance: string; difficulty: string };
function blank(): Record<string, Definition> { return Object.fromEntries(machines.map((machine) => [machine, { machine, target_type: "Unknown", direction: "Unknown", speed: "Unknown", distance: "Unknown", difficulty: "Unknown" }])); }

export default function TargetDefinitionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [courses, setCourses] = useState<number[]>([1]);
  const [courseNumber, setCourseNumber] = useState(1);
  const [defs, setDefs] = useState<Record<string, Definition>>(blank());
  const [msg, setMsg] = useState("");

  useEffect(() => { load(); }, []);
  useEffect(() => { loadDefinitions(courseNumber); }, [courseNumber]);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { router.push("/login"); return; }
    const { data: sessionData } = await supabase.from("sessions").select("id,name,course_count").eq("id", params.id).single();
    const { data: courseRows } = await supabase.from("session_courses").select("course_number").eq("session_id", params.id).order("course_number");
    setSession(sessionData);
    const nums = (courseRows || []).map((row: any) => row.course_number);
    const finalNums = nums.length ? nums : Array.from({ length: sessionData?.course_count || 1 }, (_, i) => i + 1);
    setCourses(finalNums); setCourseNumber(finalNums[0] || 1);
  }

  async function loadDefinitions(course: number) {
    const { data } = await supabase.from("session_target_definitions").select("machine,target_type,direction,speed,distance,difficulty").eq("session_id", params.id).eq("course_number", course);
    const next = blank();
    (data || []).forEach((row: any) => { next[row.machine] = { ...next[row.machine], ...row }; });
    setDefs(next);
  }

  function update(machine: string, field: keyof Definition, value: string) { setDefs((old) => ({ ...old, [machine]: { ...old[machine], [field]: value } })); }
  async function save() {
    setMsg("");
    const rows = machines.map((machine) => ({ session_id: params.id, course_number: courseNumber, ...defs[machine], updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("session_target_definitions").upsert(rows, { onConflict: "session_id,course_number,machine" });
    setMsg(error ? error.message : "Target definitions saved");
  }

  if (!session) return <main><div className="card">Loading...</div></main>;
  return <main><div className="card"><h2>Target definitions</h2><p className="small muted">{session.name}</p><label>Course</label><select value={courseNumber} onChange={(e) => setCourseNumber(Number(e.target.value))}>{courses.map((n) => <option key={n} value={n}>Course {n}</option>)}</select>{machines.map((machine) => <div className="subcard" key={machine}><h3>Machine {machine}</h3><div className="row"><div><label>Target type</label><select value={defs[machine].target_type} onChange={(e) => update(machine, "target_type", e.target.value)}>{targetTypes.map((v) => <option key={v}>{v}</option>)}</select></div><div><label>Direction</label><select value={defs[machine].direction} onChange={(e) => update(machine, "direction", e.target.value)}>{directions.map((v) => <option key={v}>{v}</option>)}</select></div><div><label>Speed</label><select value={defs[machine].speed} onChange={(e) => update(machine, "speed", e.target.value)}>{speeds.map((v) => <option key={v}>{v}</option>)}</select></div><div><label>Distance</label><select value={defs[machine].distance} onChange={(e) => update(machine, "distance", e.target.value)}>{distances.map((v) => <option key={v}>{v}</option>)}</select></div><div><label>Difficulty</label><select value={defs[machine].difficulty} onChange={(e) => update(machine, "difficulty", e.target.value)}>{difficulties.map((v) => <option key={v}>{v}</option>)}</select></div></div></div>)}{msg && <div className={msg === "Target definitions saved" ? "success" : "error"}>{msg}</div>}<div className="btns"><button onClick={save}>Save course definitions</button><Link href={`/sessions/${params.id}`} className="button secondary">Session</Link></div></div></main>;
}
