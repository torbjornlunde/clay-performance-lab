"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { isCompactDiscipline, isOrdinaryLeirduesti } from "@/lib/disciplines";
import {
  getExpectedPresentationRows,
  getMachineLabelFromRow,
  getPresentationLabel,
  type CompakSchemeRow,
} from "@/lib/fitasc/compakSchemes";
import {
  getSporttrapEvent,
  getSporttrapMachineLabel,
  getSporttrapPresentationLabel,
} from "@/lib/sporttrap/program";
import { supabase } from "@/lib/supabase/client";
import {
  defaultLeirduestiSituation,
  leirduestiSituationOptions,
  normalizeLeirduestiLabel,
} from "@/lib/misses/labels";
import {
  actualPresentationOptions,
  normalizePresentation,
  orderedPairMachines,
  orderLabel,
  pairLabel,
  splitPairLabel,
} from "@/lib/misses/presentation";

type Session = {
  id: string;
  name: string;
  discipline: string;
  shooting_format: string | null;
  total_targets: number | null;
  course_count: number | null;
  sporttrap_series_count?: number | null;
  targets_per_post?: number | null;
  default_post_format?: string | null;
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

type CourseOverride = {
  session_id: string;
  course_number: number;
  plate_number: number | null;
  event_number: number | null;
  base_presentation: string | null;
  actual_presentation: string | null;
};

type RecentMiss = {
  id: string;
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_type: string | null;
  target_label: string | null;
  base_presentation: string | null;
  actual_presentation: string | null;
  presented_pair_label: string | null;
  shooting_order_label: string | null;
  is_reversed_order: boolean | null;
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
  "id,course_number,plate,target_number,target_label,target_type,base_presentation,actual_presentation,presented_pair_label,shooting_order_label,is_reversed_order,missed_target,where_miss,main_reason,target_read,comment,first_where_miss,first_main_reason,first_target_read,first_comment,second_where_miss,second_main_reason,second_target_read,second_comment,created_at";

const pairMissedTargetOptions = [
  { baseLabel: "First", value: "First target in pair" },
  { baseLabel: "Second", value: "Second target in pair" },
  { baseLabel: "Both", value: "Both targets in pair" },
  { baseLabel: "Unknown", value: "Unknown" },
];

const whereMissOptions = ["Behind", "In front", "Over", "Under", "Not sure"];
const reasonOptions = [
  "Technical",
  "Tactical",
  "Mental",
  "Fatigue",
  "Target difficulty",
  "Wind/weather",
  "Unknown",
];
const successMessage = "Miss saved. Ready for the next one.";

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
  const [leirduestiSituation, setLeirduestiSituation] = useState("Report pair");
  const [showManualMachine, setShowManualMachine] = useState(false);
  const [manualMachine, setManualMachine] = useState("Unknown");
  const [schemeRows, setSchemeRows] = useState<CompakSchemeRow[]>([]);
  const [courseOverrides, setCourseOverrides] = useState<CourseOverride[]>([]);
  const [actualPresentation, setActualPresentation] = useState("Unknown");
  const [isReversedOrder, setIsReversedOrder] = useState(false);
  const [missedTarget, setMissedTarget] = useState("Single target");
  const [genericDetail, setGenericDetail] = useState<MissDetail>(defaultDetail);
  const [firstDetail, setFirstDetail] = useState<MissDetail>(defaultDetail);
  const [secondDetail, setSecondDetail] = useState<MissDetail>(defaultDetail);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const current = useMemo(
    () =>
      courses.find((course) => course.course_number === courseNumber) ||
      courses[0],
    [courses, courseNumber],
  );
  const isCompak = isCompactDiscipline(session?.discipline);
  const isSporttrap = session?.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session?.discipline);
  const schemeMissing = Boolean(isCompak && current && !current.fitasc_scheme);
  const expectedRows = current?.fitasc_scheme
    ? getExpectedPresentationRows(current.fitasc_scheme)
    : ["unknown"];
  const schemeRow = schemeRows.find(
    (row) =>
      row.scheme_number === current?.fitasc_scheme &&
      row.plate_number === plate &&
      row.event_number === targetNumber,
  );
  const sporttrapSeriesCount = isSporttrap
    ? session?.sporttrap_series_count ||
      (session?.total_targets
        ? Math.max(Math.round(session.total_targets / 25), 1)
        : 1)
    : 1;
  const leirduestiTargetsPerPost = isLeirduesti
    ? session?.targets_per_post ||
      (session?.total_targets && session?.course_count
        ? Math.max(Math.round(session.total_targets / session.course_count), 1)
        : 10)
    : 10;
  const sporttrapEvent = getSporttrapEvent(plate, targetNumber);
  const sporttrapTargetType = getSporttrapPresentationLabel(
    sporttrapEvent.presentation,
  );
  const sporttrapTargetLabel = getSporttrapMachineLabel(sporttrapEvent);
  const sporttrapSequenceText = `${sporttrapTargetType} ${sporttrapTargetLabel}`;
  const basePresentation = isSporttrap
    ? sporttrapTargetType
    : isLeirduesti
      ? leirduestiSituation
      : schemeRow
        ? getPresentationLabel(schemeRow.presentation)
        : current?.fitasc_scheme
          ? getPresentationLabel(expectedRows[targetNumber - 1])
          : "Unknown";
  const matchingOverride = courseOverrides.find(
    (override) =>
      override.course_number === courseNumber &&
      (override.plate_number ?? null) === (isCompak ? plate : null) &&
      (override.event_number ?? null) === (isCompak ? targetNumber : null),
  );
  const targetType = normalizePresentation(
    actualPresentation ||
      matchingOverride?.actual_presentation ||
      basePresentation,
  );
  const targetLabel = isSporttrap
    ? sporttrapTargetLabel
    : isLeirduesti
      ? `Post ${courseNumber}`
      : showManualMachine
        ? manualMachine
        : getMachineLabelFromRow(schemeRow);
  const schemeFirstMachine = isSporttrap
    ? sporttrapEvent.firstMachine
    : isCompak
      ? schemeRow?.first_machine || (showManualMachine ? manualMachine : null)
      : null;
  const schemeSecondMachine = isSporttrap
    ? sporttrapEvent.secondMachine || null
    : isCompak
      ? schemeRow?.second_machine || null
      : null;
  const presentedPairLabel = pairLabel(schemeFirstMachine, schemeSecondMachine);
  const shootingOrderLabel = orderLabel(
    schemeFirstMachine,
    schemeSecondMachine,
    isReversedOrder,
  );
  const orderedMachines = orderedPairMachines(
    schemeFirstMachine,
    schemeSecondMachine,
    isReversedOrder,
  );
  const firstMachine = orderedMachines.first;
  const secondMachine = orderedMachines.second;
  const isSinglePresentation = targetType === "Single";
  const shouldAskMissedTarget = !isSinglePresentation;
  const calculatedText = isSporttrap
    ? `Calculated: ${sporttrapSequenceText}`
    : isLeirduesti
      ? `Post ${courseNumber} · ${targetType} · Pair / sequence ${targetNumber}`
      : schemeRow
        ? `Calculated: ${getMachineLabelFromRow(schemeRow)} · ${basePresentation}${targetType !== basePresentation ? ` → actual ${targetType}` : ""}`
        : "Machine unavailable for this plate and target / pair selection.";

  useEffect(() => {
    const override = courseOverrides.find(
      (item) =>
        item.course_number === courseNumber &&
        (item.plate_number ?? null) === (isCompak ? plate : null) &&
        (item.event_number ?? null) === (isCompak ? targetNumber : null),
    );
    setActualPresentation(
      normalizePresentation(override?.actual_presentation || basePresentation),
    );
    setIsReversedOrder(false);
  }, [
    courseNumber,
    plate,
    targetNumber,
    basePresentation,
    courseOverrides,
    isCompak,
  ]);

  useEffect(() => {
    if (isSinglePresentation) setMissedTarget("Single target");
    else if (targetType === "Unknown" && missedTarget === "Single target")
      setMissedTarget("Unknown");
    else if (missedTarget === "Single target")
      setMissedTarget("Second target in pair");
  }, [isSinglePresentation, missedTarget, targetType]);

  useEffect(() => {
    if (msg !== successMessage) return;

    const timeout = window.setTimeout(() => setMsg(""), 3500);

    return () => window.clearTimeout(timeout);
  }, [msg]);

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
      .select("sporttrap_series_count,targets_per_post,default_post_format")
      .eq("id", params.id)
      .maybeSingle<
        Pick<
          Session,
          "sporttrap_series_count" | "targets_per_post" | "default_post_format"
        >
      >();
    const sessionWithOptional = sessionData
      ? { ...sessionData, ...(optionalSession || {}) }
      : null;
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("id,course_number,fitasc_scheme,start_plate,shooter_number")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<Course[]>();

    setSession(sessionWithOptional);
    if (isOrdinaryLeirduesti(sessionWithOptional?.discipline))
      setLeirduestiSituation(
        defaultLeirduestiSituation(sessionWithOptional.default_post_format),
      );
    const loadedCourses = courseData || [];
    const displayCourses =
      isOrdinaryLeirduesti(sessionWithOptional?.discipline) &&
      loadedCourses.length === 0
        ? Array.from(
            { length: sessionWithOptional.course_count || 5 },
            (_, index) => ({
              course_number: index + 1,
              fitasc_scheme: null,
              start_plate: null,
              shooter_number: null,
            }),
          )
        : loadedCourses;
    setCourses(displayCourses);
    const schemeNumbers = Array.from(
      new Set(
        (courseData || [])
          .map((course) => course.fitasc_scheme)
          .filter(Boolean),
      ),
    );
    if (
      isCompactDiscipline(sessionWithOptional?.discipline) &&
      schemeNumbers.length > 0
    ) {
      const { data: fitascRows } = await supabase
        .from("fitasc_compak_schemes")
        .select(
          "scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified",
        )
        .in("scheme_number", schemeNumbers)
        .returns<CompakSchemeRow[]>();
      setSchemeRows(fitascRows || []);
      const { data: overrides } = await supabase
        .from("session_course_overrides")
        .select(
          "session_id,course_number,plate_number,event_number,base_presentation,actual_presentation",
        )
        .eq("session_id", params.id)
        .returns<CourseOverride[]>();
      setCourseOverrides(overrides || []);
    }
    if (displayCourses?.[0]) {
      setCourseNumber(displayCourses[0].course_number);
      if (
        sessionWithOptional?.discipline === "Sporttrap" &&
        displayCourses[0].shooter_number
      )
        setPlate(displayCourses[0].shooter_number);
      else if (
        sessionWithOptional?.shooting_format === "Squad" &&
        displayCourses[0].start_plate
      )
        setPlate(displayCourses[0].start_plate);
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
    if (session?.shooting_format === "Squad" && course?.start_plate)
      setPlate(course.start_plate);
    setTargetNumber(1);
  }

  function updateDetail(
    kind: "generic" | "first" | "second",
    update: Partial<MissDetail>,
  ) {
    const setter =
      kind === "first"
        ? setFirstDetail
        : kind === "second"
          ? setSecondDetail
          : setGenericDetail;
    setter((detail) => ({ ...detail, ...update }));
  }

  function activePrimaryDetail() {
    if (
      missedTarget === "First target in pair" ||
      missedTarget === "Both targets in pair"
    )
      return firstDetail;
    if (missedTarget === "Second target in pair") return secondDetail;
    return genericDetail;
  }

  function combinedBothComment() {
    return [
      firstDetail.comment.trim() &&
        `First target: ${firstDetail.comment.trim()}`,
      secondDetail.comment.trim() &&
        `Second target: ${secondDetail.comment.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function nextMissedTargetDefault() {
    if (isSinglePresentation) return "Single target";
    if (targetType === "Unknown") return "Unknown";
    return "Second target in pair";
  }

  function resetMissSpecificFields() {
    setMissedTarget(nextMissedTargetDefault());
    setGenericDetail(defaultDetail());
    setFirstDetail(defaultDetail());
    setSecondDetail(defaultDetail());
  }

  async function save() {
    if (savingRef.current) return;

    setMsg("");
    if (!session) {
      setMsg("Session missing.");
      return;
    }

    const primaryDetail = activePrimaryDetail();
    const isFirst = missedTarget === "First target in pair";
    const isSecond = missedTarget === "Second target in pair";
    const isBoth = missedTarget === "Both targets in pair";
    const originalComment = isBoth
      ? combinedBothComment()
      : primaryDetail.comment.trim();

    savingRef.current = true;
    setSaving(true);
    const { error } = await supabase.from("misses").insert({
      session_id: session.id,
      course_number: isSporttrap
        ? seriesNumber
        : isCompak || isLeirduesti
          ? courseNumber
          : null,
      plate: isCompak || isSporttrap ? plate : null,
      target_number:
        isCompak || isSporttrap || isLeirduesti ? targetNumber : null,
      target_label:
        isCompak || isSporttrap || isLeirduesti ? targetLabel : null,
      target_type: normalizeLeirduestiLabel(targetType),
      base_presentation: normalizePresentation(basePresentation),
      actual_presentation: normalizePresentation(targetType),
      presented_pair_label: presentedPairLabel,
      shooting_order_label: shootingOrderLabel,
      is_reversed_order: Boolean(isReversedOrder),
      missed_target: isSinglePresentation ? "Single target" : missedTarget,
      where_miss: primaryDetail.whereMiss,
      main_reason: primaryDetail.mainReason,
      target_read: primaryDetail.targetRead,
      comment: originalComment || null,
      first_where_miss: isFirst || isBoth ? firstDetail.whereMiss : null,
      first_main_reason: isFirst || isBoth ? firstDetail.mainReason : null,
      first_target_read: isFirst || isBoth ? firstDetail.targetRead : null,
      first_comment:
        isFirst || isBoth ? firstDetail.comment.trim() || null : null,
      second_where_miss: isSecond || isBoth ? secondDetail.whereMiss : null,
      second_main_reason: isSecond || isBoth ? secondDetail.mainReason : null,
      second_target_read: isSecond || isBoth ? secondDetail.targetRead : null,
      second_comment:
        isSecond || isBoth ? secondDetail.comment.trim() || null : null,
    });

    if (error) {
      savingRef.current = false;
      setSaving(false);
      setMsg(error.message);
      return;
    }

    if (
      isCompak &&
      normalizePresentation(basePresentation) !==
        normalizePresentation(targetType)
    ) {
      await supabase.from("session_course_overrides").upsert(
        {
          session_id: session.id,
          course_number: courseNumber,
          plate_number: plate,
          event_number: targetNumber,
          base_presentation: normalizePresentation(basePresentation),
          actual_presentation: normalizePresentation(targetType),
        },
        { onConflict: "session_id,course_number,plate_number,event_number" },
      );
      setCourseOverrides((items) => [
        ...items.filter(
          (item) =>
            !(
              item.course_number === courseNumber &&
              item.plate_number === plate &&
              item.event_number === targetNumber
            ),
        ),
        {
          session_id: session.id,
          course_number: courseNumber,
          plate_number: plate,
          event_number: targetNumber,
          base_presentation: normalizePresentation(basePresentation),
          actual_presentation: normalizePresentation(targetType),
        },
      ]);
    }

    resetMissSpecificFields();
    setMsg(successMessage);
    await loadRecentMisses();
    savingRef.current = false;
    setSaving(false);
  }

  async function deleteMiss(id: string) {
    setMsg("");
    setDeletingId(id);
    const { error } = await supabase
      .from("misses")
      .delete()
      .eq("id", id)
      .eq("session_id", params.id);
    setDeletingId(null);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadRecentMisses();
  }

  function renderButtonGroup(
    options: string[],
    value: string,
    onChange: (nextValue: string) => void,
    compact = false,
  ) {
    return (
      <div
        className={
          compact ? "quickButtonGrid compactQuickGrid" : "quickButtonGrid"
        }
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={
              value === option ? "quickButton selected" : "quickButton"
            }
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  function renderDetailFields(
    kind: "generic" | "first" | "second",
    label?: string,
  ) {
    const detail =
      kind === "first"
        ? firstDetail
        : kind === "second"
          ? secondDetail
          : genericDetail;
    return (
      <div className="logDetailBlock">
        {label && <h3>{label}</h3>}
        <div className="fieldBlock">
          <label>Where miss</label>
          {renderButtonGroup(whereMissOptions, detail.whereMiss, (whereMiss) =>
            updateDetail(kind, { whereMiss }),
          )}
        </div>
        <div className="fieldBlock">
          <label>Main reason</label>
          {renderButtonGroup(
            reasonOptions,
            detail.mainReason,
            (mainReason) => updateDetail(kind, { mainReason }),
            true,
          )}
        </div>
        <details className="optionalDetails">
          <summary>Target read and comment</summary>
          <label>Target read</label>
          <select
            value={detail.targetRead}
            onChange={(e) => updateDetail(kind, { targetRead: e.target.value })}
          >
            <option>Normal</option>
            <option>Looked faster than expected</option>
            <option>Looked slower than expected</option>
            <option>Wind affected</option>
            <option>Poor visibility</option>
            <option>Unknown</option>
          </select>
          <label>Short comment</label>
          <textarea
            value={detail.comment}
            onChange={(e) => updateDetail(kind, { comment: e.target.value })}
            placeholder="Optional note"
          />
        </details>
      </div>
    );
  }

  function targetDetailLabel(position: "first" | "second") {
    const base = position === "first" ? "First target" : "Second target";
    const machine = position === "first" ? firstMachine : secondMachine;
    return machine && machine !== "Unknown" ? `${base} — ${machine}` : base;
  }

  function missedTargetButtonLabel(baseLabel: string) {
    if (baseLabel === "First" && firstMachine && firstMachine !== "Unknown")
      return `First — ${firstMachine}`;
    if (baseLabel === "Second" && secondMachine && secondMachine !== "Unknown")
      return `Second — ${secondMachine}`;
    if (
      baseLabel === "Both" &&
      firstMachine &&
      secondMachine &&
      firstMachine !== "Unknown" &&
      secondMachine !== "Unknown"
    )
      return `Both — ${firstMachine}+${secondMachine}`;
    return baseLabel;
  }

  function recentMissedTargetLabel(miss: RecentMiss) {
    if (isLeirduesti) {
      if (miss.missed_target === "First target in pair") return "First";
      if (miss.missed_target === "Second target in pair") return "Second";
      if (miss.missed_target === "Both targets in pair") return "Both";
      if (miss.missed_target === "Single target") return "Single";
      return miss.missed_target || "Missed target unknown";
    }
    const order = splitPairLabel(
      miss.shooting_order_label ||
        miss.presented_pair_label ||
        miss.target_label,
    );
    if (miss.missed_target === "First target in pair")
      return order.first ? `First — ${order.first}` : "First";
    if (miss.missed_target === "Second target in pair")
      return order.second ? `Second — ${order.second}` : "Second";
    if (miss.missed_target === "Both targets in pair")
      return pairLabel(order.first, order.second)
        ? `Both — ${pairLabel(order.first, order.second)}`
        : "Both";
    if (miss.missed_target === "Single target") return "Single";
    return miss.missed_target || "Missed target unknown";
  }

  function renderActiveDetails() {
    if (isSinglePresentation) return renderDetailFields("generic");
    if (missedTarget === "First target in pair")
      return renderDetailFields("first", targetDetailLabel("first"));
    if (missedTarget === "Second target in pair")
      return renderDetailFields("second", targetDetailLabel("second"));
    if (missedTarget === "Both targets in pair") {
      return (
        <>
          {renderDetailFields("first", targetDetailLabel("first"))}
          {renderDetailFields("second", targetDetailLabel("second"))}
        </>
      );
    }
    return renderDetailFields("generic");
  }

  function recentLocation(miss: RecentMiss) {
    const targetTypeLabel =
      normalizeLeirduestiLabel(miss.target_type) || "Situation unknown";
    const actual = normalizePresentation(
      miss.actual_presentation || miss.target_type,
    );
    const reversed = miss.is_reversed_order ? " · Reversed order" : "";
    const pair =
      miss.presented_pair_label || miss.target_label || "Machine unknown";
    if (isSporttrap)
      return `Series ${miss.course_number ?? "-"} · Stand ${miss.plate ?? "-"} · ${pair} · ${actual}${reversed}`.trim();
    if (isLeirduesti)
      return `Post ${miss.course_number ?? "-"} · ${actual || targetTypeLabel}${reversed}`;
    return `Course ${miss.course_number ?? "-"} · Plate ${miss.plate ?? "-"} · ${pair} · ${actual}${reversed}`;
  }

  function renderRecentDetail(miss: RecentMiss, target: "first" | "second") {
    const prefix = target === "first" ? "first" : "second";
    const where =
      target === "first" ? miss.first_where_miss : miss.second_where_miss;
    const reason =
      target === "first" ? miss.first_main_reason : miss.second_main_reason;
    const read =
      target === "first" ? miss.first_target_read : miss.second_target_read;
    const comment =
      target === "first" ? miss.first_comment : miss.second_comment;

    return (
      <div className="recentDetailLine" key={`${miss.id}-${prefix}`}>
        <strong>{target === "first" ? "First" : "Second"}</strong>
        <span>{where || "-"}</span>
        <span>{reason || "-"}</span>
        <span>{read || "-"}</span>
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
      <div className="card logMissCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Fast logging</p>
            <h2>Log miss</h2>
            <p className="small muted">{session.name}</p>
          </div>
          <span className="badge badgeGold">{session.discipline}</span>
        </div>

        <section className="logSection">
          <div className="logSectionTitle">
            <span>1</span>
            <div>
              <h3>Where / setup</h3>
              <p className="small muted">
                Choose the current position once, then keep saving misses from
                the same spot.
              </p>
            </div>
          </div>

          {isSporttrap && (
            <>
              <div className="row compactLogRow">
                {sporttrapSeriesCount > 1 && (
                  <div>
                    <label>Series</label>
                    <select
                      value={seriesNumber}
                      onChange={(e) => setSeriesNumber(Number(e.target.value))}
                    >
                      {Array.from(
                        { length: sporttrapSeriesCount },
                        (_, index) => index + 1,
                      ).map((v) => (
                        <option key={v} value={v}>
                          Series {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label>Stand</label>
                  <select
                    value={plate}
                    onChange={(e) => setPlate(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={v}>
                        Stand {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Sequence</label>
                  <select
                    value={targetNumber}
                    onChange={(e) => setTargetNumber(Number(e.target.value))}
                  >
                    {[1, 2, 3].map((v) => {
                      const event = getSporttrapEvent(plate, v);
                      return (
                        <option key={v} value={v}>
                          {getSporttrapPresentationLabel(event.presentation)}{" "}
                          {getSporttrapMachineLabel(event)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="notice calculatedNotice small">
                {calculatedText}
              </div>
            </>
          )}

          {isLeirduesti && (
            <>
              <div className="row compactLogRow">
                <div>
                  <label>Post</label>
                  <select
                    value={courseNumber}
                    onChange={(e) => changeCourse(Number(e.target.value))}
                  >
                    {courses.map((course) => (
                      <option
                        key={course.id || course.course_number}
                        value={course.course_number}
                      >
                        Post {course.course_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Pair / sequence</label>
                  <select
                    value={targetNumber}
                    onChange={(e) => setTargetNumber(Number(e.target.value))}
                  >
                    {Array.from(
                      { length: leirduestiTargetsPerPost },
                      (_, index) => index + 1,
                    ).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="fieldBlock">
                <label>Situation</label>
                {renderButtonGroup(
                  leirduestiSituationOptions,
                  leirduestiSituation,
                  setLeirduestiSituation,
                  true,
                )}
              </div>
              <div className="notice calculatedNotice small">
                {calculatedText}
              </div>
            </>
          )}

          {isCompak && (
            <>
              <div className="row compactLogRow">
                <div>
                  <label>Course</label>
                  <select
                    value={courseNumber}
                    onChange={(e) => changeCourse(Number(e.target.value))}
                  >
                    {courses.map((course) => (
                      <option
                        key={course.id || course.course_number}
                        value={course.course_number}
                      >
                        Course {course.course_number} —{" "}
                        {course.fitasc_scheme
                          ? `Scheme ${course.fitasc_scheme}`
                          : "Scheme unknown"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Plate</label>
                  <select
                    value={plate}
                    onChange={(e) => setPlate(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={v}>
                        Plate {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label>Target / pair</label>
              <select
                value={targetNumber}
                onChange={(e) => setTargetNumber(Number(e.target.value))}
              >
                {expectedRows.map((_row, index) => {
                  const row = schemeRows.find(
                    (item) =>
                      item.scheme_number === current?.fitasc_scheme &&
                      item.plate_number === plate &&
                      item.event_number === index + 1,
                  );
                  const label = row
                    ? `${getMachineLabelFromRow(row)} · ${getPresentationLabel(row.presentation)}`
                    : getPresentationLabel(expectedRows[index]);
                  return (
                    <option key={index + 1} value={index + 1}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <div className="notice calculatedNotice small">
                {calculatedText}
              </div>
              <button
                type="button"
                className="secondary smallButton inlineToggle"
                onClick={() => setShowManualMachine((value) => !value)}
              >
                Manual machine entry
              </button>
              {showManualMachine && (
                <div className="subcard compactSubcard">
                  <label>Machine</label>
                  <select
                    value={manualMachine}
                    onChange={(e) => setManualMachine(e.target.value)}
                  >
                    {["A", "B", "C", "D", "E", "F", "Unknown"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <p className="small muted">
                    Use only when the machine is known but the plate or target /
                    pair selection is not.
                  </p>
                </div>
              )}
              {schemeMissing && (
                <div className="notice small">
                  No FITASC scheme set for this course yet. You can still log
                  the miss, but target type may be unknown.
                </div>
              )}
            </>
          )}
        </section>

        {shouldAskMissedTarget && (
          <section className="logSection compactPairControls">
            <div className="logSectionTitle">
              <span>2</span>
              <div>
                <h3>Pair setup</h3>
                <p className="small muted">
                  Actual presentation and shooting order for this pair.
                </p>
              </div>
            </div>
            <div className="row compactLogRow">
              <div>
                <label>Actual presentation</label>
                <select
                  value={targetType}
                  onChange={(e) => setActualPresentation(e.target.value)}
                >
                  {actualPresentationOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              {(firstMachine || secondMachine) && (
                <div>
                  <label>Order</label>
                  <div className="btns compactActions">
                    <span className="pill">
                      {firstMachine || "First"} → {secondMachine || "Second"}
                    </span>
                    <button
                      type="button"
                      className="secondary smallButton"
                      onClick={() => setIsReversedOrder((value) => !value)}
                    >
                      Switch order
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {shouldAskMissedTarget && (
          <section className="logSection">
            <div className="logSectionTitle">
              <span>3</span>
              <div>
                <h3>Which target did you miss?</h3>
                <p className="small muted">
                  Choose the target position in the pair or sequence.
                </p>
              </div>
            </div>
            <div className="quickButtonGrid missedTargetGrid">
              {pairMissedTargetOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    missedTarget === option.value
                      ? "quickButton selected"
                      : "quickButton"
                  }
                  onClick={() => setMissedTarget(option.value)}
                >
                  {missedTargetButtonLabel(option.baseLabel)}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="logSection">
          <div className="logSectionTitle">
            <span>{shouldAskMissedTarget ? "4" : "2"}</span>
            <div>
              <h3>Why / details</h3>
              <p className="small muted">
                Comment is optional. Save works as soon as the quick fields look
                right.
              </p>
            </div>
          </div>
          {renderActiveDetails()}
        </section>

        <section className="logSection saveSection">
          <div className="logSectionTitle">
            <span>{shouldAskMissedTarget ? "5" : "3"}</span>
            <div>
              <h3>Save</h3>
              <p className="small muted">
                After saving, this session context stays in place while the
                miss-specific fields reset for the next entry.
              </p>
            </div>
          </div>
          {msg && (
            <div className={msg === successMessage ? "success" : "error"}>
              {msg}
            </div>
          )}
          <button
            type="button"
            className="saveMissButton"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save miss"}
          </button>
          <div className="btns compactActions">
            <Link className="button secondary" href={`/sessions/${params.id}`}>
              Back
            </Link>
            <Link
              className="button secondary"
              href={`/sessions/${params.id}/analysis`}
            >
              Analysis
            </Link>
          </div>
        </section>
      </div>

      <div className="card recentMissCard">
        <h2>Recent misses</h2>
        <p className="small muted">
          Last 5 registered misses for this session.
        </p>
        <div className="btns compactActions">
          <Link
            className="button secondary"
            href={`/sessions/${params.id}/misses`}
          >
            Review misses
          </Link>
        </div>
        {recentMisses.length === 0 ? (
          <p>No misses registered yet.</p>
        ) : (
          <div className="recentMissList">
            {recentMisses.map((miss) => (
              <div className="recentMissItem" key={miss.id}>
                <div className="recentMissMain">
                  <strong>{recentLocation(miss)}</strong>
                  <div className="recentPills">
                    <span>
                      {normalizePresentation(
                        miss.actual_presentation || miss.target_type,
                      )}
                      {miss.is_reversed_order ? " · Reversed order" : ""}
                    </span>
                    <span>{recentMissedTargetLabel(miss)}</span>
                    <span>
                      {miss.main_reason ||
                        miss.first_main_reason ||
                        miss.second_main_reason ||
                        "Reason unknown"}
                    </span>
                  </div>
                  {miss.missed_target === "Both targets in pair" ? (
                    <div className="recentDetailStack">
                      {renderRecentDetail(miss, "first")}
                      {renderRecentDetail(miss, "second")}
                    </div>
                  ) : (
                    <>
                      <div className="small muted">
                        {miss.where_miss || "Where unknown"} ·{" "}
                        {miss.main_reason || "Reason unknown"} ·{" "}
                        {miss.target_read || "Read unknown"}
                      </div>
                      {miss.comment && <p>{miss.comment}</p>}
                    </>
                  )}
                </div>
                <div className="btns compactActions recentMissActions">
                  <Link
                    className="button secondary smallButton"
                    href={`/sessions/${params.id}/misses/${miss.id}/edit`}
                  >
                    Edit
                  </Link>
                  <button
                    className="danger smallButton recentDeleteButton"
                    onClick={() => deleteMiss(miss.id)}
                    disabled={deletingId === miss.id}
                  >
                    {deletingId === miss.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
