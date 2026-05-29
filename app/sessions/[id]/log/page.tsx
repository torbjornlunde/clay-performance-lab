"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getCompakEvent, getMachineOptions, TargetMachine } from "@/lib/fitasc/compakSchemes";
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

type TargetDefinition = {
  course_number: number;
  machine: TargetMachine;
  target_type: string | null;
  direction: string | null;
  speed: string | null;
  distance: string | null;
  difficulty: string | null;
  notes: string | null;
};

type MissDetail = {
  whereMiss: string;
  mainReason: string;
  targetRead: string;
  comment: string;
};

type RecentMiss = {
  id: string;
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_label: string | null;
  target_type: string | null;
  missed_target: string;
  where_miss: string | null;
  main_reason: string | null;
  target_read: string | null;
  comment: string | null;
  first_where_miss: string | null;
  first_main_reason: string | null;
  first_target_read: string | null;
  first_comment: string | null;
  second_where_miss: string | null;
  second_main_reason: string | null;
  second_target_read: string | null;
  second_comment: string | null;
  created_at: string;
};

const defaultDetail = (): MissDetail => ({
  whereMiss: "Behind",
  mainReason: "Technical",
  targetRead: "Normal",
  comment: "",
});

const detailSelect =
  "id,course_number,plate,target_number,target_label,target_type,missed_target,where_miss,main_reason,target_read,comment,first_where_miss,first_main_reason,first_target_read,first_comment,second_where_miss,second_main_reason,second_target_read,second_comment,created_at";
const manualMachines = getMachineOptions();

function presentationLabel(presentation: string) {
  if (presentation === "single") return "Single";
  if (presentation === "report_pair") return "Report pair";
  if (presentation === "simo_pair") return "Simo pair";
  return "Unknown";
}

function targetDefinitionLabel(definition?: TargetDefinition) {
  if (!definition) return null;
  const parts = [definition.direction, definition.target_type].filter((value) => value && value !== "Unknown");
  return parts.length ? parts.join(" ") : definition.target_type && definition.target_type !== "Unknown" ? definition.target_type : null;
}

export default function LogPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [definitions, setDefinitions] = useState<TargetDefinition[]>([]);
  const [recentMisses, setRecentMisses] = useState<RecentMiss[]>([]);
  const [mode, setMode] = useState<"during" | "manual">("during");
  const [courseNumber, setCourseNumber] = useState(1);
  const [plate, setPlate] = useState(1);
  const [manualPlate, setManualPlate] = useState("");
  const [targetNumber, setTargetNumber] = useState(1);
  const [manualTargetNumber, setManualTargetNumber] = useState("");
  const [manualMachine, setManualMachine] = useState<TargetMachine>("Unknown");
  const [missedTarget, setMissedTarget] = useState("Single target");
  const [genericDetail, setGenericDetail] = useState<MissDetail>(defaultDetail);
  const [firstDetail, setFirstDetail] = useState<MissDetail>(defaultDetail);
  const [secondDetail, setSecondDetail] = useState<MissDetail>(defaultDetail);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const current = useMemo(
    () => courses.find((course) => course.course_number === courseNumber) || courses[0],
    [courses, courseNumber],
  );
  const isCompak = session?.discipline === "Compak Sporting";
  const schemeMissing = Boolean(isCompak && current && !current.fitasc_scheme);
  const calculatedEvent = useMemo(() => getCompakEvent(current?.fitasc_scheme ?? null, plate, targetNumber), [current?.fitasc_scheme, plate, targetNumber]);
  const calculatedLabel = calculatedEvent.machines.join("+");
  const calculatedType = presentationLabel(calculatedEvent.presentation);
  const selectedDefinition = definitions.find((definition) => definition.course_number === courseNumber && definition.machine === manualMachine);
  const calculatedDefinitions = calculatedEvent.machines
    .map((machine) => definitions.find((definition) => definition.course_number === courseNumber && definition.machine === machine))
    .filter(Boolean) as TargetDefinition[];
  const duringTargetType = calculatedDefinitions.map(targetDefinitionLabel).filter(Boolean).join(" + ") || calculatedType;
  const manualTargetType = targetDefinitionLabel(selectedDefinition) || "Unknown";

  useEffect(() => {
    if (calculatedEvent.presentation === "single") setMissedTarget("Single target");
    else if (calculatedEvent.presentation === "report_pair" || calculatedEvent.presentation === "simo_pair") setMissedTarget("Second target in pair");
  }, [calculatedEvent.presentation]);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
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
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select("course_number,machine,target_type,direction,speed,distance,difficulty,notes")
      .eq("session_id", params.id)
      .returns<TargetDefinition[]>();

    setSession(sessionData);
    setCourses(courseData || []);
    setDefinitions(definitionData || []);
    if (courseData?.[0]) {
      setCourseNumber(courseData[0].course_number);
      if (sessionData?.shooting_format === "Squad" && courseData[0].start_plate) setPlate(courseData[0].start_plate);
    }
    await loadRecentMisses();
  }

  async function loadRecentMisses() {
    const { data } = await supabase
      .from("misses")
      .select(detailSelect)
      .eq("session_id", params.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<RecentMiss[]>();

    setRecentMisses(data || []);
  }

  function changeCourse(n: number) {
    setCourseNumber(n);
    const course = courses.find((x) => x.course_number === n);
    if (session?.shooting_format === "Squad" && course?.start_plate) setPlate(course.start_plate);
    setTargetNumber(1);
  }

  function updateDetail(kind: "generic" | "first" | "second", update: Partial<MissDetail>) {
    const setter = kind === "first" ? setFirstDetail : kind === "second" ? setSecondDetail : setGenericDetail;
    setter((detail) => ({ ...detail, ...update }));
  }

  function activePrimaryDetail() {
    if (missedTarget === "First target in pair" || missedTarget === "Both targets in pair") return firstDetail;
    if (missedTarget === "Second target in pair") return secondDetail;
    return genericDetail;
  }

  function combinedBothComment() {
    return [firstDetail.comment.trim() && `First target: ${firstDetail.comment.trim()}`, secondDetail.comment.trim() && `Second target: ${secondDetail.comment.trim()}`]
      .filter(Boolean)
      .join("\n");
  }

  async function save() {
    setMsg("");
    if (!session) {
      setMsg("Session missing.");
      return;
    }

    const isManual = mode === "manual";
    const primaryDetail = activePrimaryDetail();
    const isFirst = missedTarget === "First target in pair";
    const isSecond = missedTarget === "Second target in pair";
    const isBoth = missedTarget === "Both targets in pair";
    const originalComment = isBoth ? combinedBothComment() : primaryDetail.comment.trim();
    const savedPlate = isCompak ? (isManual ? (manualPlate ? Number(manualPlate) : null) : plate) : null;
    const savedTargetNumber = isCompak ? (isManual ? (manualTargetNumber ? Number(manualTargetNumber) : null) : targetNumber) : null;
    const targetLabel = isCompak ? (isManual ? manualMachine : calculatedLabel) : null;
    const targetType = isCompak ? (isManual ? manualTargetType : duringTargetType) : "Unknown";

    setSaving(true);
    const { error } = await supabase.from("misses").insert({
      session_id: session.id,
      course_number: isCompak ? courseNumber : null,
      plate: savedPlate,
      target_number: savedTargetNumber,
      target_label: targetLabel,
      target_type: targetType,
      missed_target: missedTarget,
      where_miss: primaryDetail.whereMiss,
      main_reason: primaryDetail.mainReason,
      target_read: primaryDetail.targetRead,
      comment: originalComment || null,
      first_where_miss: isFirst || isBoth ? firstDetail.whereMiss : null,
      first_main_reason: isFirst || isBoth ? firstDetail.mainReason : null,
      first_target_read: isFirst || isBoth ? firstDetail.targetRead : null,
      first_comment: isFirst || isBoth ? firstDetail.comment.trim() || null : null,
      second_where_miss: isSecond || isBoth ? secondDetail.whereMiss : null,
      second_main_reason: isSecond || isBoth ? secondDetail.mainReason : null,
      second_target_read: isSecond || isBoth ? secondDetail.targetRead : null,
      second_comment: isSecond || isBoth ? secondDetail.comment.trim() || null : null,
    });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setGenericDetail(defaultDetail());
    setFirstDetail(defaultDetail());
    setSecondDetail(defaultDetail());
    setMsg("Miss saved");
    await loadRecentMisses();
  }

  async function deleteMiss(id: string) {
    setMsg("");
    setDeletingId(id);
    const { error } = await supabase.from("misses").delete().eq("id", id).eq("session_id", params.id);
    setDeletingId(null);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadRecentMisses();
  }

  function renderDetailFields(kind: "generic" | "first" | "second", label?: string) {
    const detail = kind === "first" ? firstDetail : kind === "second" ? secondDetail : genericDetail;
    return (
      <div className="subcard">
        {label && <h3>{label}</h3>}
        <div className="row">
          <div>
            <label>Where was the miss?</label>
            <select value={detail.whereMiss} onChange={(e) => updateDetail(kind, { whereMiss: e.target.value })}>
              <option>Behind</option>
              <option>In front</option>
              <option>Over</option>
              <option>Under</option>
              <option>Not sure</option>
            </select>
          </div>
          <div>
            <label>Main reason</label>
            <select value={detail.mainReason} onChange={(e) => updateDetail(kind, { mainReason: e.target.value })}>
              <option>Technical</option>
              <option>Tactical</option>
              <option>Mental</option>
              <option>Fatigue</option>
              <option>Target difficulty</option>
              <option>Weather/wind</option>
              <option>Unknown</option>
            </select>
          </div>
        </div>
        <label>Target read</label>
        <select value={detail.targetRead} onChange={(e) => updateDetail(kind, { targetRead: e.target.value })}>
          <option>Normal</option>
          <option>Looked faster than expected</option>
          <option>Looked slower than expected</option>
          <option>Wind affected</option>
          <option>Poor visibility</option>
          <option>Unknown</option>
        </select>
        <label>Short comment</label>
        <textarea value={detail.comment} onChange={(e) => updateDetail(kind, { comment: e.target.value })} />
      </div>
    );
  }

  function renderActiveDetails() {
    if (missedTarget === "First target in pair") return renderDetailFields("first", "First target");
    if (missedTarget === "Second target in pair") return renderDetailFields("second", "Second target");
    if (missedTarget === "Both targets in pair") {
      return (
        <>
          {renderDetailFields("first", "First target")}
          {renderDetailFields("second", "Second target")}
        </>
      );
    }
    return renderDetailFields("generic");
  }

  function renderRecentDetail(miss: RecentMiss, target: "first" | "second") {
    const prefix = target === "first" ? "first" : "second";
    const where = target === "first" ? miss.first_where_miss : miss.second_where_miss;
    const reason = target === "first" ? miss.first_main_reason : miss.second_main_reason;
    const read = target === "first" ? miss.first_target_read : miss.second_target_read;
    const comment = target === "first" ? miss.first_comment : miss.second_comment;

    return (
      <div className="subcard" key={`${miss.id}-${prefix}`}>
        <strong>{target === "first" ? "First target" : "Second target"}</strong>
        <div className="small muted">
          Where miss: {where || "-"} · Main reason: {reason || "-"} · Read: {read || "-"}
        </div>
        {comment && <p>{comment}</p>}
      </div>
    );
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
            <label>Logging mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "during" | "manual")}>
              <option value="during">During shooting</option>
              <option value="manual">After shooting / manual</option>
            </select>
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
              {mode === "during" ? (
                <div>
                  <label>Plate</label>
                  <select value={plate} onChange={(e) => setPlate(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={v}>
                        Plate {v}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label>Machine</label>
                  <select value={manualMachine} onChange={(e) => setManualMachine(e.target.value as TargetMachine)}>
                    {manualMachines.map((machine) => (
                      <option key={machine}>{machine}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {mode === "during" ? (
              <>
                <label>Target / event number</label>
                <select value={targetNumber} onChange={(e) => setTargetNumber(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      Target {v}
                    </option>
                  ))}
                </select>
                <div className="notice small">
                  {calculatedEvent.presentation === "single" ? "Calculated target" : "Calculated pair"}: <strong>{calculatedEvent.machines.join(" + ")}</strong> · {calculatedType}
                </div>
              </>
            ) : (
              <>
                <div className="notice small">Manual mode is for after-the-fact analysis when you remember the target/machine but not the exact plate/event.</div>
                <div className="row">
                  <div>
                    <label>Plate if known</label>
                    <select value={manualPlate} onChange={(e) => setManualPlate(e.target.value)}>
                      <option value="">Unknown</option>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <option key={v} value={v}>
                          Plate {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Target / event if known</label>
                    <select value={manualTargetNumber} onChange={(e) => setManualTargetNumber(e.target.value)}>
                      <option value="">Unknown</option>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <option key={v} value={v}>
                          Target {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
            {schemeMissing && mode === "during" && (
              <div className="notice small">
                No FITASC scheme set for this course yet. You can still log the miss, but target type may be unknown.
              </div>
            )}
          </>
        )}
        <label>Missed target</label>
        <select value={missedTarget} onChange={(e) => setMissedTarget(e.target.value)}>
          <option>Single target</option>
          <option>First target in pair</option>
          <option>Second target in pair</option>
          <option>Both targets in pair</option>
          <option>Unknown</option>
        </select>
        {renderActiveDetails()}
        {msg && <div className={msg === "Miss saved" ? "success" : "error"}>{msg}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save miss"}
          </button>
          <Link className="button secondary" href={`/sessions/${params.id}`}>
            Back
          </Link>
          <Link className="button secondary" href={`/sessions/${params.id}/targets`}>
            Target definitions
          </Link>
          <Link className="button secondary" href={`/sessions/${params.id}/analysis`}>
            Analysis
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Recent misses</h2>
        <p className="small muted">Last 5 registered misses for this session.</p>
        {recentMisses.length === 0 ? (
          <p>No misses registered yet.</p>
        ) : (
          recentMisses.map((miss) => (
            <div className="subcard" key={miss.id}>
              <strong>
                Course {miss.course_number ?? "-"} · Plate {miss.plate ?? "-"} · Target {miss.target_number ?? "-"}
              </strong>
              <div className="small muted">
                Machine: {miss.target_label || "-"} · Target type: {miss.target_type || "-"} · Missed target: {miss.missed_target || "-"}
              </div>
              {miss.missed_target === "Both targets in pair" ? (
                <>
                  {renderRecentDetail(miss, "first")}
                  {renderRecentDetail(miss, "second")}
                </>
              ) : (
                <>
                  <div className="small muted">
                    Where miss: {miss.where_miss || "-"} · Main reason: {miss.main_reason || "-"} · Read: {miss.target_read || "-"}
                  </div>
                  {miss.comment && <p>{miss.comment}</p>}
                </>
              )}
              <div className="btns">
                <button className="danger" onClick={() => deleteMiss(miss.id)} disabled={deletingId === miss.id}>
                  {deletingId === miss.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
