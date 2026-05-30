"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getExpectedPresentationRows, getMachineLabelFromRow, getPresentationLabel, type CompakSchemeRow } from "@/lib/fitasc/compakSchemes";
import { getSporttrapEvent, getSporttrapMachineLabel, getSporttrapPresentationLabel } from "@/lib/sporttrap/program";
import { supabase } from "@/lib/supabase/client";

type Session = {
  id: string;
  name: string;
  discipline: string;
  shooting_format: string | null;
  total_targets: number | null;
  course_count: number | null;
  sporttrap_series_count?: number | null;
  targets_per_post?: number | null;
};

type Course = {
  id?: string;
  course_number: number;
  fitasc_scheme: number | null;
  start_plate: number | null;
  shooter_number: number | null;
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
  target_type: string | null;
  target_label: string | null;
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

export default function LogPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [recentMisses, setRecentMisses] = useState<RecentMiss[]>([]);
  const [courseNumber, setCourseNumber] = useState(1);
  const [seriesNumber, setSeriesNumber] = useState(1);
  const [plate, setPlate] = useState(1);
  const [targetNumber, setTargetNumber] = useState(1);
  const [showManualMachine, setShowManualMachine] = useState(false);
  const [manualMachine, setManualMachine] = useState("Unknown");
  const [schemeRows, setSchemeRows] = useState<CompakSchemeRow[]>([]);
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
  const isSporttrap = session?.discipline === "Sporttrap";
  const isLeirduesti = session?.discipline === "Leirduesti";
  const schemeMissing = Boolean(isCompak && current && !current.fitasc_scheme);
  const expectedRows = current?.fitasc_scheme ? getExpectedPresentationRows(current.fitasc_scheme) : ["unknown"];
  const schemeRow = schemeRows.find((row) => row.scheme_number === current?.fitasc_scheme && row.plate_number === plate && row.event_number === targetNumber);
  const sporttrapSeriesCount = isSporttrap ? session?.sporttrap_series_count || (session?.total_targets ? Math.max(Math.round(session.total_targets / 25), 1) : 1) : 1;
  const leirduestiTargetsPerPost = isLeirduesti ? session?.targets_per_post || (session?.total_targets && session?.course_count ? Math.max(Math.round(session.total_targets / session.course_count), 1) : 10) : 10;
  const sporttrapEvent = getSporttrapEvent(plate, targetNumber);
  const sporttrapTargetType = getSporttrapPresentationLabel(sporttrapEvent.presentation);
  const sporttrapTargetLabel = getSporttrapMachineLabel(sporttrapEvent);
  const targetType = isSporttrap
    ? sporttrapTargetType
    : isLeirduesti
      ? "Post target"
      : schemeRow
      ? getPresentationLabel(schemeRow.presentation)
      : current?.fitasc_scheme
        ? getPresentationLabel(expectedRows[targetNumber - 1])
        : "Unknown";
  const targetLabel = isSporttrap ? sporttrapTargetLabel : isLeirduesti ? `Post ${courseNumber}` : showManualMachine ? manualMachine : getMachineLabelFromRow(schemeRow);
  const calculatedText = isSporttrap
    ? `Sporttrap sequence: ${sporttrapTargetType} · ${sporttrapTargetLabel}`
    : isLeirduesti
      ? `Leirduesti post ${courseNumber} · Target ${targetNumber}`
      : schemeRow
      ? `Calculated: ${getMachineLabelFromRow(schemeRow)} · ${getPresentationLabel(schemeRow.presentation)}`
      : "Machine unavailable for this plate and target / pair selection.";

  useEffect(() => {
    if (targetType === "Single") setMissedTarget("Single target");
    else if (targetType === "Report pair" || targetType === "Simo pair") setMissedTarget("Second target in pair");
  }, [targetType]);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data: sessionData } = await supabase
      .from("sessions")
      .select("id,name,discipline,shooting_format,total_targets,course_count")
      .eq("id", params.id)
      .single<Session>();
    const { data: optionalSession } = await supabase
      .from("sessions")
      .select("sporttrap_series_count,targets_per_post")
      .eq("id", params.id)
      .maybeSingle<Pick<Session, "sporttrap_series_count" | "targets_per_post">>();
    const sessionWithOptional = sessionData ? { ...sessionData, ...(optionalSession || {}) } : null;
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("id,course_number,fitasc_scheme,start_plate,shooter_number")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<Course[]>();

    setSession(sessionWithOptional);
    const loadedCourses = courseData || [];
    const displayCourses = sessionWithOptional?.discipline === "Leirduesti" && loadedCourses.length === 0
      ? Array.from({ length: sessionWithOptional.course_count || 5 }, (_, index) => ({ course_number: index + 1, fitasc_scheme: null, start_plate: null, shooter_number: null }))
      : loadedCourses;
    setCourses(displayCourses);
    const schemeNumbers = Array.from(new Set((courseData || []).map((course) => course.fitasc_scheme).filter(Boolean)));
    if (sessionWithOptional?.discipline === "Compak Sporting" && schemeNumbers.length > 0) {
      const { data: fitascRows } = await supabase
        .from("fitasc_compak_schemes")
        .select("scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified")
        .in("scheme_number", schemeNumbers)
        .returns<CompakSchemeRow[]>();
      setSchemeRows(fitascRows || []);
    }
    if (displayCourses?.[0]) {
      setCourseNumber(displayCourses[0].course_number);
      if (sessionWithOptional?.discipline === "Sporttrap" && displayCourses[0].shooter_number) setPlate(displayCourses[0].shooter_number);
      else if (sessionWithOptional?.shooting_format === "Squad" && displayCourses[0].start_plate) setPlate(displayCourses[0].start_plate);
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

    const primaryDetail = activePrimaryDetail();
    const isFirst = missedTarget === "First target in pair";
    const isSecond = missedTarget === "Second target in pair";
    const isBoth = missedTarget === "Both targets in pair";
    const originalComment = isBoth ? combinedBothComment() : primaryDetail.comment.trim();

    setSaving(true);
    const { error } = await supabase.from("misses").insert({
      session_id: session.id,
      course_number: isSporttrap ? seriesNumber : isCompak || isLeirduesti ? courseNumber : null,
      plate: isCompak || isSporttrap ? plate : null,
      target_number: isCompak || isSporttrap || isLeirduesti ? targetNumber : null,
      target_label: isCompak || isSporttrap || isLeirduesti ? targetLabel : null,
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

        {session.discipline === "Sporttrap" && (
          <>
            <div className="row">
              {sporttrapSeriesCount > 1 && (
                <div>
                  <label>Series</label>
                  <select value={seriesNumber} onChange={(e) => setSeriesNumber(Number(e.target.value))}>
                    {Array.from({ length: sporttrapSeriesCount }, (_, index) => index + 1).map((v) => (
                      <option key={v} value={v}>
                        Series {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label>Stand / shooter number</label>
                <select value={plate} onChange={(e) => setPlate(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      Stand {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Sporttrap sequence</label>
                <select value={targetNumber} onChange={(e) => setTargetNumber(Number(e.target.value))}>
                  {[1, 2, 3].map((v) => {
                    const event = getSporttrapEvent(plate, v);
                    return (
                      <option key={v} value={v}>
                        {getSporttrapPresentationLabel(event.presentation)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="notice small">{calculatedText}</div>
          </>
        )}
        {session.discipline === "Leirduesti" && (
          <>
            <div className="row">
              <div>
                <label>Post</label>
                <select value={courseNumber} onChange={(e) => changeCourse(Number(e.target.value))}>
                  {courses.map((course) => (
                    <option key={course.id || course.course_number} value={course.course_number}>
                      Post {course.course_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Target on post</label>
                <select value={targetNumber} onChange={(e) => setTargetNumber(Number(e.target.value))}>
                  {Array.from({ length: leirduestiTargetsPerPost }, (_, index) => index + 1).map((v) => (
                    <option key={v} value={v}>
                      Target {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="notice small">{calculatedText}</div>
          </>
        )}
        {session.discipline === "Compak Sporting" && (
          <>
            <div className="row">
              <div>
                <label>Course</label>
                <select value={courseNumber} onChange={(e) => changeCourse(Number(e.target.value))}>
                  {courses.map((course) => (
                    <option key={course.id || course.course_number} value={course.course_number}>
                      Course {course.course_number} — {course.fitasc_scheme ? `Scheme ${course.fitasc_scheme}` : "Scheme unknown"}
                    </option>
                  ))}
                </select>
              </div>
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
            </div>
            <label>Target / pair</label>
            <select value={targetNumber} onChange={(e) => setTargetNumber(Number(e.target.value))}>
              {expectedRows.map((_row, index) => {
                const row = schemeRows.find((item) => item.scheme_number === current?.fitasc_scheme && item.plate_number === plate && item.event_number === index + 1);
                const label = row ? `${getPresentationLabel(row.presentation)} ${getMachineLabelFromRow(row)}` : getPresentationLabel(expectedRows[index]);
                return <option key={index + 1} value={index + 1}>{label}</option>;
              })}
            </select>
            <div className="notice small">{calculatedText}</div>
            <button type="button" className="secondary smallButton inlineToggle" onClick={() => setShowManualMachine((value) => !value)}>
              Manual machine entry
            </button>
            {showManualMachine && (
              <div className="subcard compactSubcard">
                <label>Machine</label>
                <select value={manualMachine} onChange={(e) => setManualMachine(e.target.value)}>
                  {["A", "B", "C", "D", "E", "F", "Unknown"].map((v) => <option key={v}>{v}</option>)}
                </select>
                <p className="small muted">Use only when the machine is known but the plate or target / pair selection is not.</p>
              </div>
            )}
            {schemeMissing && (
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
                {isSporttrap
                  ? `Series ${miss.course_number ?? "-"} · Stand ${miss.plate ?? "-"} · Sporttrap sequence ${miss.target_type || "-"} · ${miss.target_label || "Unknown"}`
                  : isLeirduesti
                    ? `Post ${miss.course_number ?? "-"} · Target ${miss.target_number ?? "-"}`
                    : `Course ${miss.course_number ?? "-"} · Plate ${miss.plate ?? "-"} · ${miss.target_label || "Unknown"}`}
              </strong>
              <div className="small muted">
                Presentation: {miss.target_type || "-"} · Missed target: {miss.missed_target || "-"}
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
