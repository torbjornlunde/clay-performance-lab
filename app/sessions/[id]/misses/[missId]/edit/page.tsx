"use client";

import { useEffect, useMemo, useState } from "react";
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
  normalizeLeirduestiLabel,
  leirduestiSituationOptions,
} from "@/lib/misses/labels";
import {
  presentationOverrideOptions,
  normalizePresentation,
  orderedPairMachines,
  orderLabel,
  pairLabel,
  splitPairLabel,
} from "@/lib/misses/presentation";
import {
  getSporttrapEvent,
  getSporttrapMachineLabel,
  getSporttrapPresentationLabel,
} from "@/lib/sporttrap/program";
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
  course_number: number;
  fitasc_scheme: number | null;
  start_plate: number | null;
  shooter_number: number | null;
};
type Miss = {
  id: string;
  session_id: string;
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_label: string | null;
  target_type: string | null;
  missed_target: string | null;
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
  base_presentation?: string | null;
  actual_presentation?: string | null;
  presented_pair_label?: string | null;
  shooting_order_label?: string | null;
  is_reversed_order?: boolean | null;
};
type Detail = {
  whereMiss: string;
  mainReason: string;
  targetRead: string;
  comment: string;
};

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
const readOptions = [
  "Normal",
  "Looked faster than expected",
  "Looked slower than expected",
  "Wind affected",
  "Poor visibility",
  "Unknown",
];
const pairMissedOptions = [
  "First target in pair",
  "Second target in pair",
  "Both targets in pair",
  "Unknown",
];
const emptyDetail = (): Detail => ({
  whereMiss: "Behind",
  mainReason: "Technical",
  targetRead: "Normal",
  comment: "",
});

function detailFrom(miss: Miss | null, prefix?: "first" | "second"): Detail {
  if (!miss) return emptyDetail();
  if (prefix === "first")
    return {
      whereMiss: miss.first_where_miss || miss.where_miss || "Behind",
      mainReason: miss.first_main_reason || miss.main_reason || "Technical",
      targetRead: miss.first_target_read || miss.target_read || "Normal",
      comment: miss.first_comment || "",
    };
  if (prefix === "second")
    return {
      whereMiss: miss.second_where_miss || miss.where_miss || "Behind",
      mainReason: miss.second_main_reason || miss.main_reason || "Technical",
      targetRead: miss.second_target_read || miss.target_read || "Normal",
      comment: miss.second_comment || "",
    };
  return {
    whereMiss: miss.where_miss || "Behind",
    mainReason: miss.main_reason || "Technical",
    targetRead: miss.target_read || "Normal",
    comment: miss.comment || "",
  };
}

export default function EditMissPage() {
  const params = useParams<{ id: string; missId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [schemeRows, setSchemeRows] = useState<CompakSchemeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [courseNumber, setCourseNumber] = useState(1);
  const [seriesNumber, setSeriesNumber] = useState(1);
  const [plate, setPlate] = useState(1);
  const [targetNumber, setTargetNumber] = useState(1);
  const [targetLabel, setTargetLabel] = useState("");
  const [basePresentation, setBasePresentation] = useState("Unknown");
  const [actualPresentation, setActualPresentation] = useState("Unknown");
  const [presentedPairLabel, setPresentedPairLabel] = useState<string | null>(
    null,
  );
  const [isReversedOrder, setIsReversedOrder] = useState(false);
  const [missedTarget, setMissedTarget] = useState("Single target");
  const [genericDetail, setGenericDetail] = useState<Detail>(emptyDetail);
  const [firstDetail, setFirstDetail] = useState<Detail>(emptyDetail);
  const [secondDetail, setSecondDetail] = useState<Detail>(emptyDetail);

  useEffect(() => {
    load();
  }, []);

  const isCompak = isCompactDiscipline(session?.discipline);
  const isSporttrap = session?.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session?.discipline);
  const current = useMemo(
    () =>
      courses.find((course) => course.course_number === courseNumber) ||
      courses[0],
    [courses, courseNumber],
  );
  const expectedRows = current?.fitasc_scheme
    ? getExpectedPresentationRows(current.fitasc_scheme)
    : ["unknown"];
  const schemeRow = schemeRows.find(
    (row) =>
      row.scheme_number === current?.fitasc_scheme &&
      row.plate_number === plate &&
      row.event_number === targetNumber,
  );
  const sporttrapSeriesCount =
    session?.sporttrap_series_count ||
    (session?.total_targets
      ? Math.max(Math.round(session.total_targets / 25), 1)
      : 1);
  const leirduestiTargetsPerPost =
    session?.targets_per_post ||
    (session?.total_targets && session?.course_count
      ? Math.max(Math.round(session.total_targets / session.course_count), 1)
      : 10);
  const effectivePresentation =
    actualPresentation === "Use scheme default"
      ? normalizePresentation(basePresentation)
      : normalizePresentation(actualPresentation);
  const pairTarget = effectivePresentation !== "Single";
  const labelParts = splitPairLabel(presentedPairLabel || targetLabel);
  const ordered = orderedPairMachines(
    labelParts.first,
    labelParts.second,
    isReversedOrder,
  );
  const shootingOrderLabel = orderLabel(
    labelParts.first,
    labelParts.second,
    isReversedOrder,
  );

  useEffect(() => {
    if (!session || !loaded) return;
    if (isSporttrap) {
      const event = getSporttrapEvent(plate, targetNumber);
      const base = getSporttrapPresentationLabel(event.presentation);
      setBasePresentation(base);
      setActualPresentation((value) => normalizePresentation(value || base));
      setTargetLabel(getSporttrapMachineLabel(event));
      setPresentedPairLabel(pairLabel(event.firstMachine, event.secondMachine));
    } else if (isCompak && schemeRow) {
      const base = getPresentationLabel(schemeRow.presentation);
      setBasePresentation(base);
      setActualPresentation((value) => normalizePresentation(value || base));
      setTargetLabel(getMachineLabelFromRow(schemeRow));
      setPresentedPairLabel(
        pairLabel(schemeRow.first_machine, schemeRow.second_machine),
      );
    } else if (isLeirduesti) {
      setBasePresentation(
        (value) => normalizeLeirduestiLabel(value) || "Report pair",
      );
      setActualPresentation(
        (value) => normalizeLeirduestiLabel(value) || "Report pair",
      );
      setTargetLabel(`Post ${courseNumber}`);
      setPresentedPairLabel(null);
    }
  }, [
    session,
    loaded,
    isSporttrap,
    isCompak,
    isLeirduesti,
    plate,
    targetNumber,
    schemeRow,
    courseNumber,
  ]);

  useEffect(() => {
    if (!pairTarget) setMissedTarget("Single target");
    if (pairTarget && missedTarget === "Single target")
      setMissedTarget("Second target in pair");
  }, [pairTarget, missedTarget]);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data: sessionData } = await supabase
      .from("sessions")
      .select(
        "id,name,discipline,shooting_format,total_targets,course_count,sporttrap_series_count,targets_per_post",
      )
      .eq("id", params.id)
      .maybeSingle<Session>();
    const { data: missData } = await supabase
      .from("misses")
      .select("*")
      .eq("id", params.missId)
      .maybeSingle<Miss>();
    if (!sessionData || !missData || missData.session_id !== params.id) {
      setError("Miss or session not found.");
      setLoaded(true);
      return;
    }
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("course_number,fitasc_scheme,start_plate,shooter_number")
      .eq("session_id", params.id)
      .order("course_number")
      .returns<Course[]>();
    const displayCourses =
      isOrdinaryLeirduesti(sessionData.discipline) &&
      (!courseData || courseData.length === 0)
        ? Array.from({ length: sessionData.course_count || 5 }, (_, index) => ({
            course_number: index + 1,
            fitasc_scheme: null,
            start_plate: null,
            shooter_number: null,
          }))
        : courseData || [];
    const schemeNumbers = Array.from(
      new Set(
        (courseData || [])
          .map((course) => course.fitasc_scheme)
          .filter((value): value is number => Boolean(value)),
      ),
    );
    if (isCompactDiscipline(sessionData.discipline) && schemeNumbers.length) {
      const { data: rows } = await supabase
        .from("fitasc_compak_schemes")
        .select(
          "scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified",
        )
        .in("scheme_number", schemeNumbers)
        .returns<CompakSchemeRow[]>();
      setSchemeRows(rows || []);
    }
    setSession(sessionData);
    setCourses(displayCourses);
    setCourseNumber(missData.course_number || 1);
    setSeriesNumber(missData.course_number || 1);
    setPlate(missData.plate || 1);
    setTargetNumber(missData.target_number || 1);
    setTargetLabel(missData.target_label || "");
    setBasePresentation(
      normalizePresentation(missData.base_presentation || missData.target_type),
    );
    setActualPresentation(
      missData.actual_presentation
        ? normalizePresentation(missData.actual_presentation)
        : "Use scheme default",
    );
    setPresentedPairLabel(
      missData.presented_pair_label || missData.target_label || null,
    );
    setIsReversedOrder(Boolean(missData.is_reversed_order));
    setMissedTarget(missData.missed_target || "Unknown");
    setGenericDetail(detailFrom(missData));
    setFirstDetail(detailFrom(missData, "first"));
    setSecondDetail(detailFrom(missData, "second"));
    setLoaded(true);
  }

  function updateDetail(
    kind: "generic" | "first" | "second",
    update: Partial<Detail>,
  ) {
    const setter =
      kind === "first"
        ? setFirstDetail
        : kind === "second"
          ? setSecondDetail
          : setGenericDetail;
    setter((detail) => ({ ...detail, ...update }));
  }

  function renderDetail(kind: "generic" | "first" | "second", title?: string) {
    const detail =
      kind === "first"
        ? firstDetail
        : kind === "second"
          ? secondDetail
          : genericDetail;
    return (
      <div className="subcard">
        <h3>{title || "Miss detail"}</h3>
        <label>Where miss</label>
        <select
          value={detail.whereMiss}
          onChange={(e) => updateDetail(kind, { whereMiss: e.target.value })}
        >
          {whereMissOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <label>Main reason</label>
        <select
          value={detail.mainReason}
          onChange={(e) => updateDetail(kind, { mainReason: e.target.value })}
        >
          {reasonOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <label>Target read</label>
        <select
          value={detail.targetRead}
          onChange={(e) => updateDetail(kind, { targetRead: e.target.value })}
        >
          {readOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <label>Comment</label>
        <textarea
          value={detail.comment}
          onChange={(e) => updateDetail(kind, { comment: e.target.value })}
        />
      </div>
    );
  }

  function optionLabel(value: string) {
    if (value === "First target in pair")
      return ordered.first ? `First — ${ordered.first}` : "First";
    if (value === "Second target in pair")
      return ordered.second ? `Second — ${ordered.second}` : "Second";
    if (value === "Both targets in pair")
      return shootingOrderLabel ? `Both — ${shootingOrderLabel}` : "Both";
    return "Unknown";
  }

  async function save() {
    if (!session) return;
    setSaving(true);
    setError("");
    const resolvedActualPresentation =
      actualPresentation === "Use scheme default"
        ? normalizePresentation(basePresentation)
        : normalizePresentation(actualPresentation);
    const isPairTarget = resolvedActualPresentation !== "Single";
    const isFirst = isPairTarget && missedTarget === "First target in pair";
    const isSecond = isPairTarget && missedTarget === "Second target in pair";
    const isBoth = isPairTarget && missedTarget === "Both targets in pair";
    const resolvedPresentedPairLabel = isPairTarget
      ? presentedPairLabel || null
      : null;
    const resolvedShootingOrderLabel = isPairTarget
      ? shootingOrderLabel
      : null;
    const primary = isFirst
      ? firstDetail
      : isSecond
        ? secondDetail
        : genericDetail;
    const { error: updateError } = await supabase
      .from("misses")
      .update({
        course_number: isSporttrap ? seriesNumber : courseNumber,
        plate: isCompak || isSporttrap ? plate : null,
        target_number: targetNumber,
        target_label: targetLabel || null,
        target_type: resolvedActualPresentation,
        base_presentation: normalizePresentation(basePresentation),
        actual_presentation: resolvedActualPresentation,
        presented_pair_label: resolvedPresentedPairLabel,
        shooting_order_label: resolvedShootingOrderLabel,
        is_reversed_order: isPairTarget ? isReversedOrder : false,
        missed_target: !isPairTarget ? "Single target" : missedTarget,
        where_miss: primary.whereMiss,
        main_reason: primary.mainReason,
        target_read: primary.targetRead,
        comment: primary.comment.trim() || null,
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
      })
      .eq("id", params.missId)
      .eq("session_id", params.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push(`/sessions/${params.id}/misses`);
  }

  if (!loaded)
    return (
      <main>
        <div className="card">Loading miss...</div>
      </main>
    );
  if (error && !session)
    return (
      <main>
        <div className="card">
          <h2>{error}</h2>
          <Link
            className="button secondary"
            href={`/sessions/${params.id}/misses`}
          >
            Back
          </Link>
        </div>
      </main>
    );

  return (
    <main>
      <div className="card">
        <h2>Edit miss</h2>
        <p className="small muted">
          {session?.name} · {session?.discipline}
        </p>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="card">
        <div className="row">
          {isSporttrap ? (
            <>
              <div>
                <label>Series</label>
                <select
                  value={seriesNumber}
                  onChange={(e) => setSeriesNumber(Number(e.target.value))}
                >
                  {Array.from(
                    { length: sporttrapSeriesCount },
                    (_, index) => index + 1,
                  ).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Stand</label>
                <select
                  value={plate}
                  onChange={(e) => setPlate(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label>{isLeirduesti ? "Post" : "Course"}</label>
              <select
                value={courseNumber}
                onChange={(e) => setCourseNumber(Number(e.target.value))}
              >
                {courses.map((course) => (
                  <option
                    key={course.course_number}
                    value={course.course_number}
                  >
                    {course.course_number}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isCompak && (
            <div>
              <label>Plate</label>
              <select
                value={plate}
                onChange={(e) => setPlate(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <label>
          {isLeirduesti
            ? "Pair / sequence"
            : isSporttrap
              ? "Sequence"
              : "Target / pair"}
        </label>
        <select
          value={targetNumber}
          onChange={(e) => setTargetNumber(Number(e.target.value))}
        >
          {(isLeirduesti
            ? Array.from({ length: leirduestiTargetsPerPost }, (_, i) => i + 1)
            : isCompak
              ? expectedRows.map((_, i) => i + 1)
              : [1, 2, 3, 4, 5]
          ).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <label>Actual presentation</label>
        <select
          value={actualPresentation}
          onChange={(e) => setActualPresentation(e.target.value)}
        >
          {presentationOverrideOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <p className="small muted">
          Base scheme: {basePresentation}
          {actualPresentation === "Use scheme default"
            ? " · using scheme default"
            : ` · actual: ${effectivePresentation}`}
        </p>
        <label>Target / machine label</label>
        <input
          value={targetLabel}
          onChange={(e) => {
            setTargetLabel(e.target.value);
            setPresentedPairLabel(
              e.target.value.includes("+")
                ? e.target.value
                : presentedPairLabel,
            );
          }}
        />
        <label>Presented pair</label>
        <input
          value={presentedPairLabel || ""}
          onChange={(e) => setPresentedPairLabel(e.target.value || null)}
          placeholder="A+F"
        />
        {pairTarget && (
          <div className="subcard compactSubcard">
            <h3>Pair shooting order</h3>
            <p className="small muted">
              Current order: {ordered.first || "First"} →{" "}
              {ordered.second || "Second"}
            </p>
            <button
              type="button"
              className="secondary smallButton"
              onClick={() => setIsReversedOrder((value) => !value)}
            >
              Switch order
            </button>
            <label>Missed target</label>
            <select
              value={missedTarget}
              onChange={(e) => setMissedTarget(e.target.value)}
            >
              {pairMissedOptions.map((option) => (
                <option key={option} value={option}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="card">
        {!pairTarget ? (
          renderDetail("generic")
        ) : missedTarget === "Both targets in pair" ? (
          <>
            {renderDetail("first", optionLabel("First target in pair"))}
            {renderDetail("second", optionLabel("Second target in pair"))}
          </>
        ) : missedTarget === "First target in pair" ? (
          renderDetail("first", optionLabel("First target in pair"))
        ) : missedTarget === "Second target in pair" ? (
          renderDetail("second", optionLabel("Second target in pair"))
        ) : (
          renderDetail("generic")
        )}
        <div className="btns">
          <button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save correction"}
          </button>
          <Link
            className="button secondary"
            href={`/sessions/${params.id}/misses`}
          >
            Cancel
          </Link>
        </div>
      </div>
    </main>
  );
}
