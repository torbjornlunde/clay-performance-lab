"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { analysisPresentation } from "@/lib/analysis/sessionAnalysis";
import { isCompactDiscipline, isOrdinaryLeirduesti } from "@/lib/disciplines";
import { getSchemeType, plateRotation } from "@/lib/fitasc/schemes";
import { normalizeLeirduestiLabel, shortMissedTarget } from "@/lib/misses/labels";
import { supabase } from "@/lib/supabase/client";

type Miss = {
  id: string;
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_label: string | null;
  target_type: string | null;
  base_presentation?: string | null;
  actual_presentation?: string | null;
  presented_pair_label?: string | null;
  shooting_order_label?: string | null;
  is_reversed_order?: boolean | null;
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
  created_at: string;
};

type TargetDefinition = {
  id: string;
  course_number: number;
  machine: string;
  target_type: string | null;
  direction: string | null;
  speed: string | null;
  distance: string | null;
  difficulty: string | null;
  notes: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function value(text: string | number | null | undefined) {
  return text === null || text === undefined || text === "" ? "-" : text;
}

function compactDateTime(valueToFormat: string) {
  return new Date(valueToFormat).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function entryType(session: any, resultOnly: boolean) {
  if (resultOnly) return "Result only";
  return session.session_type === "Competition" ? "Competition" : "Training";
}

function missLocation(session: any, miss: Miss) {
  const targetType = analysisPresentation(miss);
  const reversed = miss.is_reversed_order ? " · Reversed order" : "";
  const pair = miss.presented_pair_label || miss.target_label;
  if (session.discipline === "Sporttrap")
    return `Series ${value(miss.course_number)} · Stand ${value(miss.plate)} · ${value(pair)} · ${targetType}${reversed}`;
  if (isOrdinaryLeirduesti(session.discipline))
    return `Post ${value(miss.course_number)} · ${targetType} · Pair / sequence ${value(miss.target_number)}${reversed}`;
  if (isCompactDiscipline(session.discipline))
    return `Course ${value(miss.course_number)} · Plate ${value(miss.plate)} · ${value(pair)} · ${targetType}${reversed}`;
  return `Course ${value(miss.course_number)} · ${value(pair)} · ${targetType}${reversed}`;
}

function DetailMetric({ label, value: metricValue }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="compactMetricTile">
      <span>{label}</span>
      <strong>{value(metricValue)}</strong>
    </div>
  );
}

function DetailSection({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="detailAccordion" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {badge !== undefined && <span className="countPill">{badge}</span>}
      </summary>
      <div className="detailAccordionBody">{children}</div>
    </details>
  );
}

function ResultRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detailRow">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [targetDefinitions, setTargetDefinitions] = useState<TargetDefinition[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { router.push("/login"); return; }
    const { data: sessionData } = await supabase.from("sessions").select("*").eq("id", params.id).single();
    const { data: courseData } = await supabase.from("session_courses").select("*").eq("session_id", params.id).order("course_number");
    const { data: missData, count: missCount } = await supabase
      .from("misses")
      .select("*", { count: "exact" })
      .eq("session_id", params.id)
      .order("created_at", { ascending: false })
      .returns<Miss[]>();
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select("id,course_number,machine,target_type,direction,speed,distance,difficulty,notes")
      .eq("session_id", params.id)
      .order("course_number")
      .order("machine")
      .returns<TargetDefinition[]>();
    setSession(sessionData); setCourses(courseData || []); setMisses(missData || []); setTargetDefinitions(definitionData || []); setCount(missCount || 0);
  }

  if (!session) return <main><div className="card">Loading...</div></main>;

  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);
  const isCompact = isCompactDiscipline(session.discipline);
  const sporttrapSeriesCount = isSporttrap ? session.sporttrap_series_count || (session.total_targets ? Math.max(Math.round(session.total_targets / 25), 1) : 1) : null;
  const leirduestiPostCount = isLeirduesti ? session.post_count || session.course_count || (courses.length || null) : null;
  const leirduestiTargetsPerPost = isLeirduesti
    ? session.targets_per_post || (session.total_targets && leirduestiPostCount ? Math.max(Math.round(session.total_targets / leirduestiPostCount), 1) : 10)
    : null;
  const totalTargets = isSporttrap && sporttrapSeriesCount
    ? sporttrapSeriesCount * 25
    : isLeirduesti && leirduestiPostCount && leirduestiTargetsPerPost
      ? leirduestiPostCount * leirduestiTargetsPerPost
      : session.total_targets;
  const calculatedScore = typeof totalTargets === "number" ? Math.max(totalTargets - count, 0) : null;
  const scoreUsed = typeof session.own_score === "number" ? session.own_score : calculatedScore;
  const percentage = typeof scoreUsed === "number" && typeof session.winning_score === "number" && session.winning_score > 0 ? (scoreUsed / session.winning_score) * 100 : null;
  const resultOnly = session.session_type === "Competition" && session.own_score !== null && session.winning_score !== null && courses.length === 0 && count === 0;
  const sporttrapStand = courses[0]?.shooter_number;
  const scoreLine = typeof scoreUsed === "number" && typeof totalTargets === "number" ? `${scoreUsed} / ${totalTargets}` : value(scoreUsed);
  const performanceLine = percentage === null ? null : `${percentage.toFixed(1)}%`;
  const hasScoreMismatch = typeof session.own_score === "number" && typeof calculatedScore === "number" && session.own_score !== calculatedScore;
  const metadataChips = [
    formatDate(session.competition_date || session.created_at),
    session.discipline,
    session.shooting_ground,
    entryType(session, resultOnly),
    session.shooting_format && !isSporttrap ? session.shooting_format : null,
  ].filter(Boolean);
  const showSourceDetails = Boolean(session.leirdue_result_url || (typeof session.notes === "string" && session.notes.toLowerCase().includes("leirdue")));

  return (
    <main>
      <div className="card sessionSummaryCard">
        <div className="sessionSummaryHeader">
          <div>
            <p className="eyebrow">Session overview</p>
            <h2>{session.name}</h2>
          </div>
          {resultOnly && <span className="badge badgeBlue">Result only</span>}
        </div>
        <div className="metadataLine" aria-label="Session metadata">
          {metadataChips.map((chip) => <span key={chip} className="pill">{chip}</span>)}
        </div>
        <div className="scoreSummaryLine">
          <div>
            <span>Score</span>
            <strong>{scoreLine}</strong>
          </div>
          {performanceLine && (
            <div>
              <span>Vs winner</span>
              <strong>{performanceLine}</strong>
            </div>
          )}
        </div>
        <p className="supportingSummaryLine">
          Misses logged: <strong>{count}</strong>
          {typeof session.winning_score === "number" && <> · Winning score: <strong>{session.winning_score}</strong></>}
        </p>
        {hasScoreMismatch && (
          <div className="compactNotice">Manual score differs from logged misses. This can happen if not all misses were logged.</div>
        )}
        <div className="compactMetricGrid" aria-label="Session metrics">
          <DetailMetric label="Targets" value={totalTargets} />
          <DetailMetric label="Misses" value={count} />
          <DetailMetric label="Calculated" value={calculatedScore} />
          <DetailMetric label="Official" value={session.own_score} />
          <DetailMetric label="Winner" value={session.winning_score} />
          <DetailMetric label="Vs winner" value={performanceLine || "-"} />
        </div>
      </div>

      <div className="card actionsCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Actions</p>
            <h2>What do you want to do?</h2>
          </div>
        </div>
        <div className="primaryActionGrid">
          <Link href={`/sessions/${session.id}/log`} className="button">Log miss</Link>
          <Link href={`/sessions/${session.id}/misses`} className="button secondary">Review misses</Link>
          <Link href={`/sessions/${session.id}/analysis`} className="button secondary">Analysis</Link>
        </div>
      </div>

      <div className="sessionDetailSections">
        <DetailSection title="Misses" badge={count} defaultOpen={count > 0}>
          {misses.length === 0 ? (
            <div className="emptyState compactEmptyState">No misses logged yet.</div>
          ) : (
            <div className="compactMissList">
              {misses.map((miss) => (
                <div className="compactMissCard" key={miss.id}>
                  <div className="missReviewHeader">
                    <div>
                      <strong>{missLocation(session, miss)}</strong>
                      <div className="small muted">{compactDateTime(miss.created_at)}</div>
                    </div>
                    <Link className="button secondary smallButton" href={`/sessions/${session.id}/misses/${miss.id}/edit`}>Edit / correct</Link>
                  </div>
                  <div className="missCompactMeta">
                    <span>Missed: <strong>{shortMissedTarget(miss.missed_target)}</strong></span>
                    <span>Reason: <strong>{value(miss.main_reason || miss.first_main_reason || miss.second_main_reason)}</strong></span>
                    <span>Where: <strong>{value(miss.where_miss || miss.first_where_miss || miss.second_where_miss)}</strong></span>
                    {miss.shooting_order_label && <span>Order: <strong>{miss.shooting_order_label}{miss.is_reversed_order ? " · Reversed" : ""}</strong></span>}
                  </div>
                  {(miss.comment || miss.first_comment || miss.second_comment) && (
                    <p className="small muted missCompactNote">{miss.comment || miss.first_comment || miss.second_comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Result details">
          <div className="detailRowsGrid">
            <ResultRow label="Total targets">{value(totalTargets)}</ResultRow>
            <ResultRow label="Registered misses">{count}</ResultRow>
            <ResultRow label="Calculated score">{value(calculatedScore)}</ResultRow>
            <ResultRow label="Manual/official score">{value(session.own_score)}</ResultRow>
            <ResultRow label="Winning score">{value(session.winning_score)}</ResultRow>
            <ResultRow label="Performance vs winning score">{performanceLine || "-"}</ResultRow>
            <ResultRow label="Entry type">{entryType(session, resultOnly)}</ResultRow>
            <ResultRow label="Discipline">{session.discipline}</ResultRow>
            <ResultRow label="Shooting ground">{value(session.shooting_ground)}</ResultRow>
            <ResultRow label="Competition/session date">{formatDate(session.competition_date || session.created_at)}</ResultRow>
            {session.shooting_format && <ResultRow label="Shooting format">{session.shooting_format}</ResultRow>}
          </div>
        </DetailSection>

        {targetDefinitions.length > 0 && (
          <DetailSection title="Target definitions" badge={targetDefinitions.length}>
            <div className="targetDefinitionList">
              {targetDefinitions.map((definition) => (
                <div className="subcard compactSubcard" key={definition.id}>
                  <strong>Course {definition.course_number} · {definition.machine}</strong>
                  <div className="missCompactMeta">
                    <span>Type: <strong>{value(normalizeLeirduestiLabel(definition.target_type))}</strong></span>
                    <span>Direction: <strong>{value(definition.direction)}</strong></span>
                    <span>Speed: <strong>{value(definition.speed)}</strong></span>
                    <span>Distance: <strong>{value(definition.distance)}</strong></span>
                    <span>Difficulty: <strong>{value(definition.difficulty)}</strong></span>
                  </div>
                  {definition.notes && <p className="small muted missCompactNote">{definition.notes}</p>}
                </div>
              ))}
            </div>
            <Link href={`/sessions/${session.id}/targets`} className="button secondary smallButton">Edit target definitions</Link>
          </DetailSection>
        )}

        {session.notes && (
          <DetailSection title="Notes">
            <p className="detailNote">{session.notes}</p>
          </DetailSection>
        )}

        {showSourceDetails && (
          <DetailSection title="Source / import details">
            <div className="detailRowsGrid singleColumnRows">
              <ResultRow label="Source">Leirdue import</ResultRow>
              {session.leirdue_result_url && (
                <ResultRow label="Result URL"><a href={session.leirdue_result_url} target="_blank" rel="noreferrer">Open Leirdue.net result</a></ResultRow>
              )}
            </div>
          </DetailSection>
        )}

        <DetailSection title="Advanced details">
            {isSporttrap && (
              <div className="subcard">
                <strong>Sporttrap setup</strong>
                <div className="small muted">Number of 25-target series: {sporttrapSeriesCount ?? "-"}</div>
                <div className="small muted">Total targets: {totalTargets ?? "-"}</div>
                <div className="small muted">Stand/shooter number: {sporttrapStand ?? "-"}</div>
              </div>
            )}
            {isLeirduesti && (
              <div className="subcard">
                <strong>Leirduesti setup</strong>
                <div className="small muted">Number of posts: {leirduestiPostCount ?? "-"}</div>
                <div className="small muted">Targets per post: {leirduestiTargetsPerPost ?? "-"}</div>
                <div className="small muted">Total targets: {totalTargets ?? "-"}</div>
              </div>
            )}
            {isCompact && courses.length > 0 && (
              <>
                <div className="subcard">
                  <strong>{session.discipline}</strong>
                  <div className="small muted">Number of courses/layouts: {session.course_count || courses.length}</div>
                  <div className="small muted">Total targets: {totalTargets ?? "-"}</div>
                </div>
                {courses.map((course) => (
                  <div className="subcard" key={course.id}>
                    <strong>Course {course.course_number}</strong>
                    <div className="small muted">{course.fitasc_scheme ? `Scheme ${course.fitasc_scheme} — ${getSchemeType(course.fitasc_scheme)}` : "FITASC scheme not set yet"}</div>
                    {session.shooting_format === "Squad" && course.start_plate && <div className="small muted">Shooter {course.shooter_number} · starts plate {course.start_plate} · rotation {plateRotation(course.start_plate).join(" → ")}</div>}
                  </div>
                ))}
              </>
            )}
            <div className="btns compactActions">
              <Link href={`/sessions/${session.id}/edit`} className="button secondary smallButton">Edit setup</Link>
              {isCompact && <Link href={`/sessions/${session.id}/targets`} className="button secondary smallButton">Target definitions</Link>}
              <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
            </div>
          </DetailSection>
      </div>
    </main>
  );
}
