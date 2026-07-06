"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  analysisPresentation,
  analyzeMisses,
  type MissForAnalysis,
} from "@/lib/analysis/sessionAnalysis";
import { buildDeterministicSessionAnalysis } from "@/lib/analysis/deterministicSessionAnalysis";
import { isCompactDiscipline, isOrdinaryLeirduesti, isPostBasedSportingDiscipline } from "@/lib/disciplines";
import {
  normalizeLeirduestiLabel,
  shortMissedTarget,
} from "@/lib/misses/labels";
import { supabase } from "@/lib/supabase/client";

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [misses, setMisses] = useState<any[]>([]);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [postTargets, setPostTargets] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

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
      .select("id,name,discipline,shooting_format,session_type,own_score,winning_score,total_targets,post_count,targets_per_post,created_at,competition_date,leirdue_result_url,user_id")
      .eq("id", params.id)
      .single();
    const { data: missData } = await supabase
      .from("misses")
      .select("*")
      .eq("session_id", params.id)
      .order("created_at");
    const [{ data: postTargetData }, { data: importData }, { data: historyData }] = await Promise.all([
      supabase
        .from("session_post_targets")
        .select("post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type,direction,angle,speed,distance,difficulty,notes")
        .eq("session_id", params.id),
      supabase
        .from("scorecard_imports")
        .select("reviewed_total_targets,reviewed_hits,reviewed_misses,inserted_misses,skipped_duplicates,created_at")
        .eq("session_id", params.id)
        .order("created_at", { ascending: false }),
      sessionData
        ? supabase
            .from("sessions")
            .select("id,name,discipline,session_type,own_score,total_targets,winning_score,competition_date,created_at")
            .eq("user_id", sessionData.user_id)
            .order("competition_date", { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: [] }),
    ]);
    const useScorecardPath = Boolean(importData?.[0]) && isPostBasedSportingDiscipline(sessionData?.discipline);
    const { data: definitionData } = useScorecardPath
      ? { data: [] }
      : await supabase
          .from("session_target_definitions")
          .select("course_number,machine,target_type,direction")
          .eq("session_id", params.id);
    setSession(sessionData);
    setMisses(missData || []);
    setDefinitions(definitionData || []);
    setPostTargets(postTargetData || []);
    setImports(importData || []);
    setHistory(historyData || []);
  }

  if (!session) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  const enrichedMisses = misses.map((miss) => {
    const definition = definitions.find(
      (item) =>
        item.course_number === miss.course_number &&
        item.machine === miss.target_label,
    );
    return definition
      ? {
          ...miss,
          target_label: `${miss.target_label} – ${definition.direction?.toLowerCase()} ${definition.target_type?.toLowerCase()}`,
        }
      : miss;
  });
  const scorecardImport = imports[0] || null;
  const deterministic = buildDeterministicSessionAnalysis({
    session,
    misses,
    scorecardImport,
    postTargets,
    history,
  });
  const hasReviewedPostScorecard = Boolean(scorecardImport) && isPostBasedSportingDiscipline(session.discipline);
  const legacyAnalysis = analyzeMisses(enrichedMisses as MissForAnalysis[]);
  const importedNotice = searchParams.get("scorecardImported") === "1";
  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);
  const isCompak = isCompactDiscipline(session.discipline);

  return (
    <main>
      <div className="card">
        <h2>Analysis</h2>
        <p className="small muted">{session.name}</p>
        {hasReviewedPostScorecard ? (
          <>
            <span className="pill">
              Score <strong>{deterministic.summary.score}/{deterministic.summary.totalTargets}</strong>
            </span>
            <span className="pill">
              Misses <strong>{deterministic.summary.misses}</strong>
            </span>
          </>
        ) : (
          <>
            <span className="pill">
              Detailed missed targets <strong>{legacyAnalysis.total}</strong>
            </span>
            <span className="pill">
              Miss rows <strong>{legacyAnalysis.rowTotal}</strong>
            </span>
            {legacyAnalysis.overrideCount > 0 && (
              <span className="pill">
                Presentation overrides <strong>{legacyAnalysis.overrideCount}</strong>
              </span>
            )}
          </>
        )}
        {session.shooting_format && !isSporttrap && (
          <span className="pill">{session.shooting_format}</span>
        )}
        <div className="btns">
          <Link className="button" href={`/sessions/${session.id}/log`}>
            Log more
          </Link>
          <Link className="button secondary" href={`/sessions/${session.id}`}>
            Session
          </Link>
        </div>
      </div>
      {importedNotice && (
        <div className="success">
          Import complete: score {searchParams.get("score") || deterministic.summary.score}, inserted misses {searchParams.get("inserted") || scorecardImport?.inserted_misses || 0}, skipped duplicates {searchParams.get("skipped") || scorecardImport?.skipped_duplicates || 0}.
        </div>
      )}
      {hasReviewedPostScorecard ? (
        <>
          <section className="card analysisSection">
            <h2>What this scorecard tells us</h2>
            {deterministic.findings.map((text) => <p key={text}>• {text}</p>)}
            {deterministic.winningScore && <p>• {deterministic.winningScore.message}</p>}
          </section>
          <section className="card analysisSection">
            <h2>Compared with your recent results</h2>
            <p>{deterministic.competitionComparison.message}</p>
            <p>{deterministic.trainingComparison.message}</p>
            {deterministic.confidence.smallSample && <p className="small muted">Small sample: comparisons become more reliable after at least three earlier sessions of the same type.</p>}
          </section>
          <section className="card analysisSection">
            <h2>Training focus</h2>
            {deterministic.recommendations.map((item) => (
              <div className="subcard" key={item.title}>
                <strong>{item.title}</strong>
                <p className="small muted">Evidence: {item.evidence}</p>
              </div>
            ))}
          </section>
          {deterministic.missingData.length > 0 && (
            <section className="card analysisSection">
              <h2>What is missing for deeper analysis</h2>
              {deterministic.missingData.map((text) => <p key={text}>• {text}</p>)}
            </section>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <h2>Main pattern</h2>
            {legacyAnalysis.mainPattern.map((text: string) => (
              <p key={text}>• {text}</p>
            ))}
          </div>
          <div className="card">
            <h2>{isSporttrap ? "Sporttrap patterns" : isLeirduesti ? "Leirduesti patterns" : isCompak ? `${session.discipline} patterns` : "Patterns"}</h2>
            {isSporttrap ? (
              <>
                <p><strong>Misses by target label:</strong> {legacyAnalysis.formatted.byTargetLabel}</p>
                <p><strong>Misses by actual presentation:</strong> {legacyAnalysis.formatted.byTargetType}</p>
                <p><strong>Misses by first/second/both target:</strong> {legacyAnalysis.formatted.byTargetPosition}</p>
                <p><strong>Misses by shooting order:</strong> {legacyAnalysis.formatted.byReversedOrder}</p>
                <p><strong>Misses by series:</strong> {legacyAnalysis.formatted.byCourse}</p>
                <p><strong>Misses by stand:</strong> {legacyAnalysis.formatted.byPlate}</p>
                <p><strong>Misses by sequence:</strong> {legacyAnalysis.formatted.byTargetNumber}</p>
              </>
            ) : isLeirduesti ? (
              <>
                <p><strong>Misses by post:</strong> {legacyAnalysis.formatted.byCourse}</p>
                <p><strong>Misses by actual presentation:</strong> {legacyAnalysis.formatted.byTargetType}</p>
                <p><strong>Misses by first/second/both target:</strong> {legacyAnalysis.formatted.byTargetPosition}</p>
                <p><strong>Misses by shooting order:</strong> {legacyAnalysis.formatted.byReversedOrder}</p>
                <p><strong>Misses by main reason:</strong> {legacyAnalysis.formatted.byReason}</p>
                <p><strong>Misses by where miss:</strong> {legacyAnalysis.formatted.byWhere}</p>
              </>
            ) : (
              <>
                <p><strong>Misses by machine/target label:</strong> {legacyAnalysis.formatted.byTargetLabel}</p>
                <p><strong>Misses by actual presentation:</strong> {legacyAnalysis.formatted.byTargetType}</p>
                <p><strong>Misses by first/second/both target:</strong> {legacyAnalysis.formatted.byTargetPosition}</p>
                <p><strong>Misses by shooting order:</strong> {legacyAnalysis.formatted.byReversedOrder}</p>
                <p><strong>Misses by course:</strong> {legacyAnalysis.formatted.byCourse}</p>
                <p><strong>Misses by plate:</strong> {legacyAnalysis.formatted.byPlate}</p>
              </>
            )}
          </div>
          <div className="card">
            <h2>Training recommendation</h2>
            {legacyAnalysis.recommendation.map((text: string) => (
              <p key={text}>• {text}</p>
            ))}
          </div>
        </>
      )}
      <details className="card analysisRegisteredMisses">
        <summary><h2>Registered misses</h2></summary>
        {misses.length === 0 ? (
          <p>No misses registered yet.</p>
        ) : (
          misses.map((miss) => {
            const actualPresentation = analysisPresentation(miss);
            const basePresentation = analysisPresentation({
              actual_presentation: miss.base_presentation,
            });
            const hasPresentationOverride =
              Boolean(miss.actual_presentation && miss.base_presentation) &&
              actualPresentation !== basePresentation;
            return (
            <div className="subcard" key={miss.id}>
              <strong>
                {isSporttrap
                  ? `Series ${miss.course_number ?? "-"} · Stand ${miss.plate ?? "-"} · Sporttrap sequence ${miss.target_type || "-"} · ${miss.target_label || "Unknown"}`
                  : isLeirduesti
                    ? `Post ${miss.course_number ?? "-"} · ${normalizeLeirduestiLabel(miss.target_type) || "Situation unknown"} · Pair / sequence ${miss.target_number ?? "-"}`
                    : `Course ${miss.course_number ?? "-"} · Plate ${miss.plate ?? "-"} · ${miss.target_label || "Unknown"}`}
              </strong>
              <div className="small muted">
                {normalizeLeirduestiLabel(actualPresentation) || "-"}{" "}
                · {shortMissedTarget(miss.missed_target)} ·{" "}
                {miss.where_miss || "-"} · {miss.main_reason || "-"}
                {miss.is_reversed_order ? " · Reversed order" : ""}
              </div>
              {hasPresentationOverride && (
                <div className="small muted">
                  Base presentation: {basePresentation} · Actual presentation:{" "}
                  {actualPresentation}
                </div>
              )}
              {miss.missed_target === "Both targets in pair" && (
                <>
                  <div className="small muted">
                    First target: {miss.first_where_miss || "-"} ·{" "}
                    {miss.first_main_reason || "-"}
                  </div>
                  <div className="small muted">
                    Second target: {miss.second_where_miss || "-"} ·{" "}
                    {miss.second_main_reason || "-"}
                  </div>
                </>
              )}
              {miss.comment && <div>{miss.comment}</div>}
            </div>
            );
          })
        )}
      </details>
    </main>
  );
}
