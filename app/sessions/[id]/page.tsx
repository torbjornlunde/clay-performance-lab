"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { analysisPresentation } from "@/lib/analysis/sessionAnalysis";
import {
  isCompactDiscipline,
  isOrdinaryLeirduesti,
  isPostBasedSportingDiscipline,
  postTargetUnitLabel,
} from "@/lib/disciplines";
import {
  postNumbersMeetingExpected,
  scoreDisplay,
} from "@/lib/targets/postSetupState";
import { getSchemeType, plateRotation } from "@/lib/fitasc/schemes";
import {
  normalizeLeirduestiLabel,
  shortMissedTarget,
} from "@/lib/misses/labels";
import { scoreFromMisses, totalMisses } from "@/lib/misses/scoring";
import { supabase } from "@/lib/supabase/client";
import { recordAnalyticsEvent } from "@/lib/analytics";
import {
  isQuickScoreNotes,
  parseQuickScoreMetadata,
} from "@/lib/quick-score/metadata";
import { equipmentSnapshotLines } from "@/lib/equipment/logSnapshots";

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
  source_type?: string | null;
  target_position?: number | null;
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
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function value(text: string | number | null | undefined) {
  return text === null || text === undefined || text === "" ? "-" : text;
}

function firstValue(...items: Array<string | null | undefined>) {
  return (
    items.find((item) => item !== null && item !== undefined && item !== "") ||
    null
  );
}

function compactDateTime(valueToFormat: string) {
  return new Date(valueToFormat).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function entryType(session: any, _resultOnly: boolean, missCount = 0) {
  if (isLeirdueImported(session)) return "Imported";
  if (
    typeof session.own_score === "number" ||
    isQuickScoreNotes(session.notes) ||
    missCount > 0
  )
    return "Result recorded";
  if (session.session_type === "Competition") return "Needs result";
  return "Training";
}

function isLeirdueImported(session: any) {
  return Boolean(
    session.leirdue_result_url ||
    (typeof session.notes === "string" &&
      (session.notes.toLowerCase().includes("source: leirdue_net") ||
        session.notes.toLowerCase().includes("leirdue import"))),
  );
}

function importDetail(session: any, key: string) {
  if (typeof session.notes !== "string") return null;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = session.notes.match(
    new RegExp(
      `(?:^|\\. )${escapedKey}:\\s*([\\s\\S]*?)(?=\\. [a-z_]+:|$)`,
      "i",
    ),
  );
  return match?.[1]?.trim() || null;
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

function DetailMetric({
  label,
  value: metricValue,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
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

function ResultRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
  const searchParams = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [templateApplyFailedMessage, setTemplateApplyFailedMessage] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [targetDefinitions, setTargetDefinitions] = useState<
    TargetDefinition[]
  >([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [postSetupCount, setPostSetupCount] = useState<number | null>(null);
  const [sourceRefresh, setSourceRefresh] = useState<any>(null);
  const [sourceRefreshing, setSourceRefreshing] = useState(false);
  const [sourceApplying, setSourceApplying] = useState(false);
  const [selectedSourceFields, setSelectedSourceFields] = useState<string[]>([]);
  const trackedSessionOpenRef = useRef<string | null>(null);


  useEffect(() => {
    const failedKind = searchParams.get("templateApplyFailed");
    if (failedKind !== "result" && failedKind !== "session") return;
    setTemplateApplyFailedMessage(
      failedKind === "result"
        ? "Resultatet ble lagret, men det delte dueoppsettet kunne ikke legges til. Du kan fortsette uten det."
        : "Konkurransen ble lagret, men det delte dueoppsettet kunne ikke legges til. Du kan fortsette uten det.",
    );
    const next = new URLSearchParams(searchParams.toString());
    next.delete("templateApplyFailed");
    const suffix = next.toString();
    router.replace(`/sessions/${params.id}${suffix ? `?${suffix}` : ""}`);
  }, [params.id, router, searchParams]);
  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data: sessionData } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", params.id)
      .single();
    const { data: courseData } = await supabase
      .from("session_courses")
      .select("*")
      .eq("session_id", params.id)
      .order("course_number");
    const { data: missData } = await supabase
      .from("misses")
      .select("*", { count: "exact" })
      .eq("session_id", params.id)
      .order("created_at", { ascending: false })
      .returns<Miss[]>();
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select(
        "id,course_number,machine,target_type,direction,speed,distance,difficulty,notes",
      )
      .eq("session_id", params.id)
      .order("course_number")
      .order("machine")
      .returns<TargetDefinition[]>();
    let configuredPosts: number | null = null;
    if (sessionData && isPostBasedSportingDiscipline(sessionData.discipline)) {
      const targetRows = await supabase
        .from("session_post_targets")
        .select("post_number")
        .eq("session_id", params.id);
      if (!targetRows.error) {
        const expectedTargets =
          sessionData.targets_per_post ||
          (sessionData.total_targets &&
          (sessionData.post_count || sessionData.course_count)
            ? Math.max(
                Math.round(
                  sessionData.total_targets /
                    (sessionData.post_count || sessionData.course_count),
                ),
                1,
              )
            : 10);
        configuredPosts = postNumbersMeetingExpected(
          targetRows.data || [],
          expectedTargets,
        );
      }
    }
    const weightedMissCount = totalMisses(missData || []);
    setSession(sessionData);
    setCourses(courseData || []);
    setMisses(missData || []);
    setTargetDefinitions(definitionData || []);
    setCount(weightedMissCount);
    setPostSetupCount(configuredPosts);
    setSourceRefresh(null);
    setSelectedSourceFields([]);
    if (sessionData?.id && trackedSessionOpenRef.current !== sessionData.id) {
      trackedSessionOpenRef.current = sessionData.id;
      void recordAnalyticsEvent(supabase, "session_detail_opened", {
        route: "/sessions/[id]",
        feature: "session_detail",
        discipline: sessionData.discipline,
        sessionId: sessionData.id,
      });
    }
  }

  async function refreshLeirdueSource() {
    if (!session) return;
    setSourceRefreshing(true);
    setErr("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      void recordAnalyticsEvent(supabase, "leirdue_source_refresh_checked", { route: "/sessions/[id]", feature: "leirdue_source_refresh", discipline: session.discipline, sessionId: session.id });
      const response = await fetch(`/api/leirdue/source-refresh/${session.id}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await response.json();
      if (!response.ok) { setErr(payload.error || "Could not refresh Leirdue.net source."); return; }
      setSourceRefresh(payload);
      setSelectedSourceFields((payload.diffs || []).filter((item: any) => item.changed && item.safeToApply).map((item: any) => item.field));
      setSession((current: any) => current ? { ...current, last_source_checked_at: payload.checkedAt, last_source_status: payload.status, source_change_summary: payload } : current);
    } catch {
      setErr("Could not refresh Leirdue.net source.");
    } finally {
      setSourceRefreshing(false);
    }
  }

  async function applyLeirdueSourceChanges(applyAll = false) {
    if (!session || !sourceRefresh?.diffs?.length) return;
    const fields = applyAll ? sourceRefresh.diffs.filter((item: any) => item.changed && item.safeToApply).map((item: any) => item.field) : selectedSourceFields;
    if (!window.confirm("Apply the selected Leirdue.net source changes to this saved result?")) return;
    setSourceApplying(true);
    setErr("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const response = await fetch(`/api/leirdue/source-refresh/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ confirmed: true, selectedFields: fields }) });
      const payload = await response.json();
      if (!response.ok) { setErr(payload.error || "Could not apply source changes."); return; }
      await load();
      void recordAnalyticsEvent(supabase, "leirdue_source_refresh_applied", { route: "/sessions/[id]", feature: "leirdue_source_refresh", discipline: session.discipline, sessionId: session.id, metadata: { count: fields.length } });
      setSourceRefresh({ ...sourceRefresh, status: "applied", checkedAt: payload.checkedAt });
    } catch {
      setErr("Could not apply source changes.");
    } finally {
      setSourceApplying(false);
    }
  }

  async function deleteSession() {
    if (!session) return;
    const confirmed = window.confirm(
      "Delete this result? This cannot be undone.",
    );
    if (!confirmed) return;

    setDeleting(true);
    setErr("");
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", session.id);
    setDeleting(false);

    if (error) {
      setErr(error.message);
      return;
    }

    router.push("/results");
  }

  if (!session)
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );

  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);
  const isCompact = isCompactDiscipline(session.discipline);
  const sporttrapSeriesCount = isSporttrap
    ? session.sporttrap_series_count ||
      (session.total_targets
        ? Math.max(Math.round(session.total_targets / 25), 1)
        : 1)
    : null;
  const leirduestiPostCount = isLeirduesti
    ? session.post_count || session.course_count || courses.length || null
    : null;
  const leirduestiTargetsPerPost = isLeirduesti
    ? session.targets_per_post ||
      (session.total_targets && leirduestiPostCount
        ? Math.max(Math.round(session.total_targets / leirduestiPostCount), 1)
        : 10)
    : null;
  const quickScore = parseQuickScoreMetadata(session.notes);
  const totalTargets =
    quickScore?.totalTargets ??
    (isSporttrap && sporttrapSeriesCount
      ? sporttrapSeriesCount * 25
      : isLeirduesti && leirduestiPostCount && leirduestiTargetsPerPost
        ? leirduestiPostCount * leirduestiTargetsPerPost
        : session.total_targets);
  const calculatedScore =
    quickScore?.totalHits ??
    (typeof totalTargets === "number" && count > 0
      ? scoreFromMisses(totalTargets, count)
      : null);
  const scoreUsed =
    typeof session.own_score === "number" ? session.own_score : calculatedScore;
  const percentage =
    typeof scoreUsed === "number" &&
    typeof session.winning_score === "number" &&
    session.winning_score > 0
      ? (scoreUsed / session.winning_score) * 100
      : null;
  const resultOnly =
    session.session_type === "Competition" &&
    session.own_score !== null &&
    courses.length === 0 &&
    count === 0;
  const sporttrapStand = courses[0]?.shooter_number;
  const scoreLine = scoreDisplay(scoreUsed, totalTargets);
  const performanceLine =
    percentage === null ? null : `${percentage.toFixed(1)}%`;
  const hasScoreMismatch =
    !quickScore &&
    typeof session.own_score === "number" &&
    typeof calculatedScore === "number" &&
    session.own_score !== calculatedScore;
  const metadataChips = [
    formatDate(session.competition_date || session.created_at),
    session.discipline,
    session.shooting_ground,
  ].filter(Boolean);
  const showSourceDetails = isLeirdueImported(session);
  const sourceUrl =
    importDetail(session, "source_url") || session.leirdue_result_url;
  const canRefreshLeirdueSource = Boolean(sourceUrl && /^https?:\/\/(www\.)?leirdue\.net\//i.test(sourceUrl));
  const importedAt = importDetail(session, "imported_at");
  const importConfidence = importDetail(session, "confidence");
  const stevneId = importDetail(session, "stevne_id");
  const listeId = importDetail(session, "liste_id");
  const summaryMetrics = [
    {
      label: "Targets",
      value: totalTargets,
      show: totalTargets !== null && totalTargets !== undefined,
    },
    {
      label: resultOnly ? "Detailed misses" : "Misses",
      value: resultOnly ? "Not added" : (quickScore?.totalMisses ?? count),
      show: true,
    },
    {
      label: "Calculated",
      value: calculatedScore,
      show: calculatedScore !== null && calculatedScore !== undefined,
    },
    {
      label: "Official",
      value: session.own_score,
      show: typeof session.own_score === "number",
    },
    {
      label: "Winner",
      value: session.winning_score,
      show: typeof session.winning_score === "number",
    },
    {
      label: "Vs winner",
      value: performanceLine,
      show: Boolean(performanceLine),
    },
  ].filter((metric) => metric.show);
  const hasAdvancedDetails =
    isSporttrap || isLeirduesti || (isCompact && courses.length > 0);
  const equipmentLines = equipmentSnapshotLines(session.equipment_snapshot);
  const postUnit = postTargetUnitLabel(session.discipline).toLowerCase();
  const expectedPostCount =
    leirduestiPostCount ||
    session.post_count ||
    session.course_count ||
    courses.length ||
    1;
  const setupComplete =
    (postSetupCount ?? 0) >= expectedPostCount && expectedPostCount > 0;
  const setupPartial = (postSetupCount ?? 0) > 0 && !setupComplete;
  const setupAction = isPostBasedSportingDiscipline(session.discipline)
    ? {
        href: `/sessions/${session.id}/targets`,
        label: setupComplete
          ? `Review ${postUnit}s and targets`
          : setupPartial
            ? `Continue ${postUnit} setup`
            : `Set up ${postUnit}s and targets`,
        progress: `${postSetupCount ?? 0} of ${expectedPostCount} ${postUnit}s set up`,
      }
    : isCompact
      ? {
          href: `/sessions/${session.id}/edit#course-setup`,
          label: "Set up courses and schemes",
          progress: `${courses.filter((course) => course.fitasc_scheme !== null && course.fitasc_scheme !== undefined).length} of ${session.course_count || courses.length || 1} courses have schemes`,
        }
      : isSporttrap
        ? {
            href: `/sessions/${session.id}/edit#sporttrap-setup`,
            label: "Set up series and stand",
            progress: `${sporttrapSeriesCount || 1} series · Stand ${sporttrapStand ?? "not set"}`,
          }
        : null;
  const loggingLabel = resultOnly
    ? "Add detailed logging"
    : count > 0
      ? "Continue logging"
      : "Start logging";

  return (
    <main>
      <div className="card sessionSummaryCard">
        <div className="sessionSummaryHeader">
          <div>
            <p className="eyebrow">Session overview</p>
            <h2>{session.name}</h2>
          </div>
          <span className="badge badgeBlue">
            {entryType(session, resultOnly, count)}
          </span>
        </div>
        <div className="metadataLine" aria-label="Session metadata">
          {metadataChips.map((chip) => (
            <span key={chip} className="pill">
              {chip}
            </span>
          ))}
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
          {resultOnly ? (
            <>
              Detailed misses: <strong>Not added yet</strong>
            </>
          ) : (
            <>
              Misses logged: <strong>{quickScore?.totalMisses ?? count}</strong>
            </>
          )}
          {typeof session.winning_score === "number" && (
            <>
              {" "}
              · Winning score: <strong>{session.winning_score}</strong>
            </>
          )}
        </p>
        {equipmentLines.length > 0 && (
          <div className="compactNotice equipmentSummary">
            <strong>Equipment used</strong>
            {equipmentLines.map((line) => (
              <div className="small" key={line}>
                {line}
              </div>
            ))}
          </div>
        )}
        {hasScoreMismatch && (
          <div className="compactNotice">
            {resultOnly
              ? "This is a result-only entry. Detailed misses have not been logged yet."
              : "Manual score differs from logged misses. This can happen if not all misses were logged."}
          </div>
        )}
        {templateApplyFailedMessage && (
          <div className="compactNotice">{templateApplyFailedMessage}</div>
        )}
        {searchParams.get("scorecardImported") === "1" && (
          <div className="compactNotice">
            Scorecard import complete: score{" "}
            <strong>{searchParams.get("score") || "-"}</strong>, new misses{" "}
            <strong>{searchParams.get("inserted") || "0"}</strong>, skipped
            duplicates <strong>{searchParams.get("skipped") || "0"}</strong>.
            {searchParams.get("alreadyImported") === "true"
              ? " This scorecard had already been imported."
              : ""}
            {searchParams.get("ownScoreUpdated") === "true"
              ? " Your score was updated."
              : ""}
          </div>
        )}
        {resultOnly && !hasScoreMismatch ? (
          <div className="compactNotice">
            This is a result-only entry. Detailed misses have not been logged
            yet.
          </div>
        ) : null}
        <div className="compactMetricGrid" aria-label="Session metrics">
          {summaryMetrics.map((metric) => (
            <DetailMetric
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </div>
      </div>

      <div className="card actionsCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Actions</p>
            <h2>What do you want to do?</h2>
          </div>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="primaryActionGrid">
          {setupAction && !setupComplete && (
            <Link href={setupAction.href} className="button setupActionButton">
              <span>{setupAction.label}</span>
              <small>{setupAction.progress}</small>
            </Link>
          )}
          {isPostBasedSportingDiscipline(session.discipline) &&
            setupComplete &&
            count === 0 && (
              <Link
                href={`/sessions/${session.id}/scorecard-import`}
                className="button"
              >
                Import scorecard
              </Link>
            )}
          {isPostBasedSportingDiscipline(session.discipline) &&
            (!setupComplete || count > 0) && (
              <Link
                href={`/sessions/${session.id}/scorecard-import`}
                className="button secondary"
              >
                Import scorecard
              </Link>
            )}
          <Link href={`/sessions/${session.id}/log`} className="button">
            {loggingLabel}
          </Link>
          {setupAction && setupComplete && (
            <Link
              href={setupAction.href}
              className="button secondary setupActionButton"
            >
              <span>{setupAction.label}</span>
              <small>{setupAction.progress}</small>
            </Link>
          )}
          {count > 0 && (
            <Link
              href={`/sessions/${session.id}/misses`}
              className="button secondary"
            >
              Review misses
            </Link>
          )}
        </div>
        <details className="detailAccordion">
          <summary>
            <span>More actions</span>
          </summary>
          <div className="detailAccordionBody">
            <p className="muted small">
              Manage this saved result. Delete only removes the local app entry
              and cannot affect any external Leirdue.net source data.
            </p>
            <div className="btns compactActions">
              <Link
                href={`/sessions/${session.id}/analysis`}
                className="button secondary smallButton"
              >
                Analysis
              </Link>
              <Link
                href={`/sessions/${session.id}/edit`}
                className="button secondary smallButton"
              >
                Edit competition/setup
              </Link>
              <Link
                href={`/sessions/${session.id}/share-setup`}
                className="button secondary smallButton"
              >
                Share competition setup
              </Link>
              <Link href="/results" className="button secondary smallButton">
                Results history
              </Link>
              <button
                className="button danger smallButton"
                type="button"
                disabled={deleting}
                onClick={deleteSession}
              >
                {deleting ? "Deleting..." : "Delete result"}
              </button>
            </div>
          </div>
        </details>
      </div>

      <div className="sessionDetailSections">
        <DetailSection title="Misses" badge={count} defaultOpen={count > 0}>
          {misses.length === 0 ? (
            <div className="emptyState compactEmptyState">
              No misses logged yet.
            </div>
          ) : (
            <div className="compactMissList">
              {misses.map((miss) => (
                <div className="compactMissCard" key={miss.id}>
                  <div className="missReviewHeader">
                    <div>
                      <strong>{missLocation(session, miss)}</strong>
                      <div className="small muted">
                        {compactDateTime(miss.created_at)}
                        {miss.source_type === "scorecard_import"
                          ? " · Scorecard import"
                          : ""}
                      </div>
                    </div>
                    <Link
                      className="button secondary smallButton"
                      href={`/sessions/${session.id}/misses/${miss.id}/edit`}
                    >
                      Edit / correct
                    </Link>
                  </div>
                  <div className="missCompactMeta">
                    <span>
                      Missed:{" "}
                      <strong>{shortMissedTarget(miss.missed_target)}</strong>
                    </span>
                    <span>
                      Reason:{" "}
                      <strong>
                        {miss.source_type === "scorecard_import" &&
                        firstValue(
                          miss.main_reason,
                          miss.first_main_reason,
                          miss.second_main_reason,
                        ) === "Unknown"
                          ? "Details not added"
                          : value(
                              firstValue(
                                miss.main_reason,
                                miss.first_main_reason,
                                miss.second_main_reason,
                              ),
                            )}
                      </strong>
                    </span>
                    <span>
                      Where:{" "}
                      <strong>
                        {value(
                          firstValue(
                            miss.where_miss,
                            miss.first_where_miss,
                            miss.second_where_miss,
                          ),
                        )}
                      </strong>
                    </span>
                    <span>
                      Read:{" "}
                      <strong>
                        {value(
                          firstValue(
                            miss.target_read,
                            miss.first_target_read,
                            miss.second_target_read,
                          ),
                        )}
                      </strong>
                    </span>
                    {miss.shooting_order_label && (
                      <span>
                        Order:{" "}
                        <strong>
                          {miss.shooting_order_label}
                          {miss.is_reversed_order ? " · Reversed" : ""}
                        </strong>
                      </span>
                    )}
                  </div>
                  {firstValue(
                    miss.comment,
                    miss.first_comment,
                    miss.second_comment,
                  ) && (
                    <p className="small muted missCompactNote">
                      {firstValue(
                        miss.comment,
                        miss.first_comment,
                        miss.second_comment,
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        {equipmentLines.length > 0 && (
          <DetailSection title="Equipment used" badge="Saved">
            <div className="detailRowsGrid singleColumnRows">
              {equipmentLines.map((line) => (
                <ResultRow label="Equipment" key={line}>
                  {line}
                </ResultRow>
              ))}
            </div>
          </DetailSection>
        )}

        <DetailSection title="Result details" badge="Full">
          <div className="detailRowsGrid">
            <ResultRow label="Total targets">{value(totalTargets)}</ResultRow>
            <ResultRow label="Registered misses">
              {quickScore?.totalMisses ?? count}
            </ResultRow>
            <ResultRow label="Calculated score">
              {value(calculatedScore)}
            </ResultRow>
            <ResultRow label="Manual/official score">
              {value(session.own_score)}
            </ResultRow>
            <ResultRow label="Winning score">
              {value(session.winning_score)}
            </ResultRow>
            <ResultRow label="Performance vs winning score">
              {performanceLine || "-"}
            </ResultRow>
            <ResultRow label="Status">
              {entryType(session, resultOnly, count)}
            </ResultRow>
            {quickScore && (
              <ResultRow label="Start course/post">
                {quickScore.startCourse}
              </ResultRow>
            )}
            {quickScore && (
              <ResultRow label="Generated order">
                {quickScore.courseOrder.join(" → ")}
              </ResultRow>
            )}
            <ResultRow label="Discipline">{session.discipline}</ResultRow>
            <ResultRow label="Shooting ground">
              {value(session.shooting_ground)}
            </ResultRow>
            <ResultRow label="Competition/session date">
              {formatDate(session.competition_date || session.created_at)}
            </ResultRow>
            {session.shooting_format && (
              <ResultRow label="Shooting format">
                {session.shooting_format}
              </ResultRow>
            )}
          </div>
        </DetailSection>

        {quickScore && (
          <DetailSection
            title="Quick score breakdown"
            badge="Result recorded"
            defaultOpen
          >
            <div className="quickScoreList">
              {quickScore.breakdown.map((row) => (
                <div className="quickScoreRow" key={row.course}>
                  <strong>Course/post {row.course}</strong>
                  <span className="small muted">
                    Targets <strong>{row.targets}</strong>
                  </span>
                  <span className="small muted">
                    Score{" "}
                    <strong>
                      {row.hits}/{row.targets}
                    </strong>
                  </span>
                  <span className="small muted">
                    Misses <strong>{row.misses}</strong>
                  </span>
                </div>
              ))}
            </div>
            <p className="small muted">
              This is a result-only quick score. Detailed misses and target
              definitions can be added later.
            </p>
          </DetailSection>
        )}

        {isPostBasedSportingDiscipline(session.discipline) && (
          <DetailSection title="Target definitions" badge="Setup">
            <p className="small muted">
              Describe each stable post or stand target position for later
              score-sheet matching.
            </p>
            <Link
              href={`/sessions/${session.id}/targets`}
              className="button secondary smallButton"
            >
              Describe posts and targets
            </Link>
          </DetailSection>
        )}

        {!isPostBasedSportingDiscipline(session.discipline) &&
          targetDefinitions.length > 0 && (
            <DetailSection
              title="Target definitions"
              badge={targetDefinitions.length}
            >
              <div className="targetDefinitionList">
                {targetDefinitions.map((definition) => (
                  <div className="subcard compactSubcard" key={definition.id}>
                    <strong>
                      Course {definition.course_number} · {definition.machine}
                    </strong>
                    <div className="missCompactMeta">
                      <span>
                        Type:{" "}
                        <strong>
                          {value(
                            normalizeLeirduestiLabel(definition.target_type),
                          )}
                        </strong>
                      </span>
                      <span>
                        Direction:{" "}
                        <strong>{value(definition.direction)}</strong>
                      </span>
                      <span>
                        Speed: <strong>{value(definition.speed)}</strong>
                      </span>
                      <span>
                        Distance: <strong>{value(definition.distance)}</strong>
                      </span>
                      <span>
                        Difficulty:{" "}
                        <strong>{value(definition.difficulty)}</strong>
                      </span>
                    </div>
                    {definition.notes && (
                      <p className="small muted missCompactNote">
                        {definition.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <Link
                href={`/sessions/${session.id}/targets`}
                className="button secondary smallButton"
              >
                Edit target definitions
              </Link>
            </DetailSection>
          )}

        {session.notes && (
          <DetailSection title="Notes" badge="Saved">
            <p className="detailNote">{session.notes}</p>
          </DetailSection>
        )}

        {showSourceDetails && (
          <DetailSection title="Source / import details" badge="Import">
            <div className="detailRowsGrid singleColumnRows">
              <ResultRow label="Source">Leirdue.net</ResultRow>
              {sourceUrl && (
                <ResultRow label="Source URL">
                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                    Open Leirdue.net result
                  </a>
                </ResultRow>
              )}
              {importedAt && (
                <ResultRow label="Imported at">
                  {compactDateTime(importedAt)}
                </ResultRow>
              )}
              {importConfidence && (
                <ResultRow label="Duplicate/import status">
                  Imported · Confidence {importConfidence}
                </ResultRow>
              )}
              {(stevneId || listeId) && (
                <ResultRow label="Source ids">
                  Stevne {value(stevneId)} · Liste {value(listeId)}
                </ResultRow>
              )}
            </div>
            {canRefreshLeirdueSource && (
              <div className="leirdueSourceReview">
                <div>
                  <strong>Linked to Leirdue.net</strong>
                  <p>Last checked: {session.last_source_checked_at ? compactDateTime(session.last_source_checked_at) : "never"}</p>
                </div>
                <button type="button" className="secondary smallButton" onClick={() => void refreshLeirdueSource()} disabled={sourceRefreshing}>
                  {sourceRefreshing ? "Checking…" : "Refresh from Leirdue.net"}
                </button>
                {(sourceRefresh || session.last_source_status) && (
                  <div className="sourceReviewStatus">
                    {((sourceRefresh?.status || session.last_source_status) === "no_changes") && <strong>Source checked · No changes found</strong>}
                    {((sourceRefresh?.status || session.last_source_status) === "changed") && <strong>Source changed · Review update</strong>}
                    {((sourceRefresh?.status || session.last_source_status) === "could_not_match") && <strong>Could not safely match source result</strong>}
                    {((sourceRefresh?.status || session.last_source_status) === "fetch_failed") && <strong>Could not check Leirdue.net source</strong>}
                    {sourceRefresh?.error && <p>{sourceRefresh.error}</p>}
                  </div>
                )}
                {sourceRefresh?.diffs?.some((item: any) => item.changed) && (
                  <div className="sourceDiffList">
                    {sourceRefresh.diffs.filter((item: any) => item.changed).map((item: any) => (
                      <label key={item.field} className="sourceDiffRow">
                        <input type="checkbox" disabled={!item.safeToApply || sourceApplying} checked={selectedSourceFields.includes(item.field)} onChange={(event) => setSelectedSourceFields((fields) => event.target.checked ? Array.from(new Set([...fields, item.field])) : fields.filter((field) => field !== item.field))} />
                        <span><strong>{item.label}</strong><small>Saved: {value(item.currentValue)} → Leirdue: {value(item.sourceValue)}{!item.safeToApply ? " · review only" : ""}</small></span>
                      </label>
                    ))}
                    <div className="btns">
                      <button type="button" className="primary smallButton" onClick={() => void applyLeirdueSourceChanges(false)} disabled={sourceApplying || selectedSourceFields.length === 0}>{sourceApplying ? "Applying…" : "Apply selected changes"}</button>
                      <button type="button" className="secondary smallButton" onClick={() => void applyLeirdueSourceChanges(true)} disabled={sourceApplying}>Apply all safe changes</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DetailSection>
        )}

        {hasAdvancedDetails && (
          <DetailSection title="Advanced details">
            {isSporttrap && (
              <div className="subcard">
                <strong>Sporttrap setup</strong>
                <div className="small muted">
                  Number of 25-target series: {sporttrapSeriesCount ?? "-"}
                </div>
                <div className="small muted">
                  Total targets: {totalTargets ?? "-"}
                </div>
                <div className="small muted">
                  Stand/shooter number: {sporttrapStand ?? "-"}
                </div>
              </div>
            )}
            {isLeirduesti && (
              <div className="subcard">
                <strong>Leirduesti setup</strong>
                <div className="small muted">
                  Number of posts: {leirduestiPostCount ?? "-"}
                </div>
                <div className="small muted">
                  Targets per post: {leirduestiTargetsPerPost ?? "-"}
                </div>
                <div className="small muted">
                  Total targets: {totalTargets ?? "-"}
                </div>
              </div>
            )}
            {isCompact && courses.length > 0 && (
              <>
                <div className="subcard">
                  <strong>{session.discipline}</strong>
                  <div className="small muted">
                    Number of courses/layouts:{" "}
                    {session.course_count || courses.length}
                  </div>
                  <div className="small muted">
                    Total targets: {totalTargets ?? "-"}
                  </div>
                </div>
                {courses.map((course) => (
                  <div className="subcard" key={course.id}>
                    <strong>Course {course.course_number}</strong>
                    <div className="small muted">
                      {course.fitasc_scheme
                        ? `Scheme ${course.fitasc_scheme} — ${getSchemeType(course.fitasc_scheme)}`
                        : "FITASC scheme not set yet"}
                    </div>
                    {session.shooting_format === "Squad" &&
                      course.start_plate && (
                        <div className="small muted">
                          Shooter {course.shooter_number} · starts plate{" "}
                          {course.start_plate} · rotation{" "}
                          {plateRotation(course.start_plate).join(" → ")}
                        </div>
                      )}
                  </div>
                ))}
              </>
            )}
          </DetailSection>
        )}

        <div
          className="btns compactActions sessionUtilityActions"
          aria-label="Session utility actions"
        >
          <Link
            href={`/sessions/${session.id}/edit`}
            className="button secondary smallButton"
          >
            Edit setup
          </Link>
          {isCompact && (
            <Link
              href={`/sessions/${session.id}/targets`}
              className="button secondary smallButton"
            >
              Target definitions
            </Link>
          )}
          <Link href="/dashboard" className="button secondary smallButton">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
