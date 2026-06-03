"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { analysisPresentation } from "@/lib/analysis/sessionAnalysis";
import { isCompactDiscipline, isOrdinaryLeirduesti } from "@/lib/disciplines";
import { getSchemeType, plateRotation } from "@/lib/fitasc/schemes";
import { normalizeLeirduestiLabel, shortMissedTarget } from "@/lib/misses/labels";
import { supabase } from "@/lib/supabase/client";

const machines = ["A", "B", "C", "D", "E", "F"];

type SessionRow = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  total_targets: number | null;
  notes: string | null;
  leirdue_result_url: string | null;
  created_at: string;
  competition_date: string | null;
  own_score: number | null;
  winning_score: number | null;
  shooting_ground: string | null;
  sporttrap_series_count: number | null;
  post_count: number | null;
  targets_per_post: number | null;
};

type CourseRow = {
  id: string;
  course_number: number;
  fitasc_scheme: number | null;
  shooter_number: number | null;
  start_plate: number | null;
};

type MissRow = {
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

type TargetDefinitionRow = {
  session_id?: string;
  course_number: number | null;
  machine: string | null;
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

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(score: number | null, total: number | null) {
  if (!isUsableNumber(score) || !isUsableNumber(total) || total <= 0) return null;
  return (score / total) * 100;
}

function sessionKind(session: SessionRow, resultOnly: boolean) {
  if (resultOnly) return "Result only";
  return session.session_type === "Competition" ? "Competition" : "Training";
}

function isMeaningfulDefinition(definition: TargetDefinitionRow) {
  return (
    Boolean(definition.machine) &&
    (definition.target_type !== "Unknown" ||
      definition.direction !== "Unknown" ||
      definition.speed !== "Unknown" ||
      definition.distance !== "Unknown" ||
      definition.difficulty !== "Unknown" ||
      Boolean(definition.notes?.trim()))
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="missReviewRow">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function DetailSection({ title, badge, defaultOpen = false, children }: { title: string; badge?: string | number; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="detailAccordion" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {badge !== undefined && <span className="accordionBadge">{badge}</span>}
      </summary>
      <div className="detailAccordionBody">{children}</div>
    </details>
  );
}

function labelFor(session: SessionRow, miss: MissRow) {
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

function MissCard({ session, miss }: { session: SessionRow; miss: MissRow }) {
  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);

  return (
    <div className="subcard missReviewCard compactMissCard">
      <div className="missReviewHeader">
        <div>
          <strong>{labelFor(session, miss)}</strong>
          <div className="small muted">{new Date(miss.created_at).toLocaleString()}</div>
        </div>
        <div className="btns compactActions recentMissActions">
          <Link className="button secondary smallButton" href={`/sessions/${session.id}/misses/${miss.id}/edit`}>
            Edit / correct
          </Link>
        </div>
      </div>
      <div className="missReviewGrid compactMissGrid">
        {isSporttrap ? (
          <>
            <DetailRow label="Series">{value(miss.course_number)}</DetailRow>
            <DetailRow label="Stand">{value(miss.plate)}</DetailRow>
            <DetailRow label="Sequence / presentation">{value(normalizeLeirduestiLabel(miss.target_type))}</DetailRow>
            <DetailRow label="Target label">{value(miss.target_label)}</DetailRow>
          </>
        ) : isLeirduesti ? (
          <>
            <DetailRow label="Post">{value(miss.course_number)}</DetailRow>
            <DetailRow label="Situation">{value(normalizeLeirduestiLabel(miss.target_type))}</DetailRow>
            <DetailRow label="Pair / sequence">{value(miss.target_number)}</DetailRow>
          </>
        ) : (
          <>
            <DetailRow label="Course">{value(miss.course_number)}</DetailRow>
            <DetailRow label="Plate">{value(miss.plate)}</DetailRow>
            <DetailRow label="Target/machine label">{value(miss.target_label)}</DetailRow>
            <DetailRow label="Presentation/target type">{value(normalizeLeirduestiLabel(miss.target_type))}</DetailRow>
          </>
        )}
        <DetailRow label="Actual presentation">{value(analysisPresentation(miss))}</DetailRow>
        {miss.shooting_order_label && (
          <DetailRow label="Shooting order">
            {miss.shooting_order_label}
            {miss.is_reversed_order ? " · Reversed" : ""}
          </DetailRow>
        )}
        <DetailRow label="Missed target">{shortMissedTarget(miss.missed_target)}</DetailRow>
        <DetailRow label="Where miss">{value(miss.where_miss || miss.first_where_miss || miss.second_where_miss)}</DetailRow>
        <DetailRow label="Main reason">{value(miss.main_reason || miss.first_main_reason || miss.second_main_reason)}</DetailRow>
        {miss.comment && <DetailRow label="Notes">{miss.comment}</DetailRow>}
        {miss.missed_target === "Both targets in pair" && (
          <>
            <DetailRow label="First target detail">{`${value(miss.first_where_miss)} · ${value(miss.first_main_reason)} · ${value(miss.first_target_read)}`}</DetailRow>
            <DetailRow label="Second target detail">{`${value(miss.second_where_miss)} · ${value(miss.second_main_reason)} · ${value(miss.second_target_read)}`}</DetailRow>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [misses, setMisses] = useState<MissRow[]>([]);
  const [targetDefinitions, setTargetDefinitions] = useState<TargetDefinitionRow[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data: sessionData } = await supabase.from("sessions").select("*").eq("id", params.id).single<SessionRow>();
    const { data: courseData } = await supabase.from("session_courses").select("*").eq("session_id", params.id).order("course_number").returns<CourseRow[]>();
    const { data: missData } = await supabase.from("misses").select("*").eq("session_id", params.id).order("created_at", { ascending: false }).returns<MissRow[]>();
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select("session_id,course_number,machine,target_type,direction,speed,distance,difficulty,notes")
      .eq("session_id", params.id)
      .order("course_number")
      .order("machine")
      .returns<TargetDefinitionRow[]>();
    setSession(sessionData);
    setCourses(courseData || []);
    setMisses(missData || []);
    setTargetDefinitions((definitionData || []).filter(isMeaningfulDefinition));
  }

  const definitionsByCourse = useMemo(() => {
    return targetDefinitions.reduce<Record<string, TargetDefinitionRow[]>>((acc, definition) => {
      const key = String(definition.course_number || 1);
      acc[key] = [...(acc[key] || []), definition];
      return acc;
    }, {});
  }, [targetDefinitions]);

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
  const count = misses.length;
  const calculatedScore = isUsableNumber(totalTargets) ? Math.max(totalTargets - count, 0) : null;
  const scoreUsed = isUsableNumber(session.own_score) ? session.own_score : calculatedScore;
  const scorePercentage = percent(scoreUsed, totalTargets);
  const winnerPercentage = isUsableNumber(scoreUsed) && isUsableNumber(session.winning_score) && session.winning_score > 0 ? (scoreUsed / session.winning_score) * 100 : null;
  const behindWinner = isUsableNumber(scoreUsed) && isUsableNumber(session.winning_score) ? session.winning_score - scoreUsed : null;
  const resultOnly = session.session_type === "Competition" && session.own_score !== null && session.winning_score !== null && courses.length === 0 && count === 0;
  const sporttrapStand = courses[0]?.shooter_number;
  const hasSetupDetails = isSporttrap || isLeirduesti || (isCompact && courses.length > 0);
  const hasImportDetails = Boolean(session.leirdue_result_url);
  const hasNotes = Boolean(session.notes?.trim());

  return (
    <main>
      <div className="card sessionSummaryCard">
        <div className="sessionSummaryHeader">
          <div>
            <p className="eyebrow">Session summary</p>
            <h2>{session.name}</h2>
          </div>
          <span className="badge badgeGold">{sessionKind(session, resultOnly)}</span>
        </div>
        <div className="sessionSummaryPills">
          <span className="pill">{formatDate(session.competition_date || session.created_at)}</span>
          <span className="pill">{session.discipline}</span>
          {session.shooting_ground && <span className="pill">Shooting ground: {session.shooting_ground}</span>}
        </div>
        <div className="topSummaryGrid">
          <div className="summaryStat heroSummaryStat"><span>Score</span><strong>{scoreUsed ?? "-"}{totalTargets ? `/${totalTargets}` : ""}</strong></div>
          <div className="summaryStat"><span>Performance</span><strong>{scorePercentage === null ? "-" : `${scorePercentage.toFixed(1)}%`}</strong></div>
          <div className="summaryStat"><span>Misses</span><strong>{count}</strong></div>
          {isUsableNumber(session.winning_score) && <div className="summaryStat"><span>Winning / vs winner</span><strong>{session.winning_score}{behindWinner !== null ? ` / ${behindWinner > 0 ? `${behindWinner} back` : behindWinner === 0 ? "tied" : `${Math.abs(behindWinner)} ahead`}` : ""}</strong></div>}
        </div>
        {winnerPercentage !== null && <p className="small muted summaryHint">Performance vs winning score: {winnerPercentage.toFixed(1)}%.</p>}
        {count === 0 && <div className="emptyState compactEmptyState">No misses logged yet.</div>}
        <div className="btns stackedOnMobile">
          <Link href={`/sessions/${session.id}/log`} className="button">Log miss</Link>
          <Link href={`/sessions/${session.id}/misses`} className="button secondary">Review misses</Link>
          <Link href={`/sessions/${session.id}/analysis`} className="button secondary">Analysis</Link>
          <Link href={`/sessions/${session.id}/edit`} className="button secondary">Edit setup</Link>
          {isCompact && <Link href={`/sessions/${session.id}/targets`} className="button secondary">Edit target definitions</Link>}
          <Link href="/dashboard" className="button secondary">Dashboard</Link>
        </div>
      </div>

      <div className="detailAccordionStack">
        <DetailSection title="Misses" badge={count} defaultOpen={count > 0}>
          {count === 0 ? (
            <div className="emptyState">No misses logged yet.</div>
          ) : (
            <div className="missReviewList compactMissList">
              {misses.map((miss) => <MissCard key={miss.id} session={session} miss={miss} />)}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Result details" defaultOpen={false}>
          <div className="summaryGrid detailSummaryGrid">
            <div className="summaryStat"><span>Total targets</span><strong>{totalTargets ?? "-"}</strong></div>
            <div className="summaryStat"><span>Registered misses</span><strong>{count}</strong></div>
            <div className="summaryStat"><span>Calculated score</span><strong>{calculatedScore ?? "-"}</strong></div>
            <div className="summaryStat"><span>Manual/official score</span><strong>{session.own_score ?? "-"}</strong></div>
            <div className="summaryStat"><span>Winning score</span><strong>{session.winning_score ?? "-"}</strong></div>
            <div className="summaryStat"><span>Score percentage</span><strong>{scorePercentage === null ? "-" : `${scorePercentage.toFixed(1)}%`}</strong></div>
            <div className="summaryStat"><span>Performance vs winning score</span><strong>{winnerPercentage === null ? "-" : `${winnerPercentage.toFixed(1)}%`}</strong></div>
          </div>
          {typeof session.own_score === "number" && typeof calculatedScore === "number" && session.own_score !== calculatedScore && (
            <div className="notice">Manual score differs from logged misses. This can happen if not all misses were logged.</div>
          )}
          <div className="sessionMeta detailMetaList">
            <span>Type: {session.session_type}</span>
            {resultOnly && <span>Result only</span>}
            {session.shooting_format && !isSporttrap && <span>Format: {session.shooting_format}</span>}
            {session.shooting_ground && <span>Shooting ground: {session.shooting_ground}</span>}
            {session.competition_date && <span>Competition date: {formatDate(session.competition_date)}</span>}
          </div>
        </DetailSection>

        {hasSetupDetails && (
          <DetailSection title="Advanced details" defaultOpen={false}>
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
          </DetailSection>
        )}

        {targetDefinitions.length > 0 && (
          <DetailSection title="Target definitions" badge={targetDefinitions.length} defaultOpen={false}>
            <div className="targetDefinitionList">
              {Object.entries(definitionsByCourse).map(([courseNumber, definitions]) => (
                <div className="subcard" key={courseNumber}>
                  <div className="targetDefinitionHeader">
                    <strong>Course {courseNumber}</strong>
                    <span className="pill">{definitions.length} defined</span>
                  </div>
                  <div className="targetDefinitionGrid">
                    {definitions
                      .sort((a, b) => machines.indexOf(a.machine || "") - machines.indexOf(b.machine || ""))
                      .map((definition) => (
                        <div className="missReviewRow" key={`${courseNumber}-${definition.machine}`}>
                          <span>Machine {definition.machine}</span>
                          <strong>{value(definition.target_type)}</strong>
                          <div className="small muted">Direction: {value(definition.direction)} · Speed: {value(definition.speed)} · Distance: {value(definition.distance)} · Difficulty: {value(definition.difficulty)}</div>
                          {definition.notes && <p className="small muted targetDefinitionNotes">{definition.notes}</p>}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            {isCompact && <Link href={`/sessions/${session.id}/targets`} className="button secondary smallButton">Edit target definitions</Link>}
          </DetailSection>
        )}

        {hasNotes && (
          <DetailSection title="Notes" defaultOpen={false}>
            <p className="notesBlock">{session.notes}</p>
          </DetailSection>
        )}

        {hasImportDetails && (
          <DetailSection title="Import/source details" defaultOpen={false}>
            <div className="subcard">
              <strong>Leirdue.net import</strong>
              <div className="small muted">Source label: Leirdue.net result</div>
              {session.leirdue_result_url && <a href={session.leirdue_result_url} target="_blank" rel="noreferrer" className="button secondary smallButton sourceLink">Open Leirdue.net result</a>}
            </div>
          </DetailSection>
        )}
      </div>
    </main>
  );
}
