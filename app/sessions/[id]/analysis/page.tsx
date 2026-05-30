"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  analysisPresentation,
  analyzeMisses,
  MissForAnalysis,
} from "@/lib/analysis/sessionAnalysis";
import { isCompactDiscipline, isOrdinaryLeirduesti } from "@/lib/disciplines";
import {
  normalizeLeirduestiLabel,
  shortMissedTarget,
} from "@/lib/misses/labels";
import { supabase } from "@/lib/supabase/client";

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [misses, setMisses] = useState<any[]>([]);
  const [definitions, setDefinitions] = useState<any[]>([]);

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
      .select("id,name,discipline,shooting_format")
      .eq("id", params.id)
      .single();
    const { data: missData } = await supabase
      .from("misses")
      .select("*")
      .eq("session_id", params.id)
      .order("created_at");
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select("course_number,machine,target_type,direction")
      .eq("session_id", params.id);
    setSession(sessionData);
    setMisses(missData || []);
    setDefinitions(definitionData || []);
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
  const analysis = analyzeMisses(enrichedMisses as MissForAnalysis[]);
  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);
  const isCompak = isCompactDiscipline(session.discipline);

  return (
    <main>
      <div className="card">
        <h2>Analysis</h2>
        <p className="small muted">{session.name}</p>
        <span className="pill">
          Detailed missed targets <strong>{analysis.total}</strong>
        </span>
        <span className="pill">
          Miss rows <strong>{analysis.rowTotal}</strong>
        </span>
        {analysis.overrideCount > 0 && (
          <span className="pill">
            Presentation overrides <strong>{analysis.overrideCount}</strong>
          </span>
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
      <div className="card">
        <h2>Main pattern</h2>
        {analysis.mainPattern.map((text: string) => (
          <p key={text}>• {text}</p>
        ))}
      </div>
      <div className="card">
        <h2>
          {isSporttrap
            ? "Sporttrap patterns"
            : isLeirduesti
              ? "Leirduesti patterns"
              : isCompak
                ? `${session.discipline} patterns`
                : "Patterns"}
        </h2>
        {isSporttrap ? (
          <>
            <p>
              <strong>Misses by target label:</strong>{" "}
              {analysis.formatted.byTargetLabel}
            </p>
            <p>
              <strong>Misses by actual presentation:</strong>{" "}
              {analysis.formatted.byTargetType}
            </p>
            <p>
              <strong>Misses by first/second/both target:</strong>{" "}
              {analysis.formatted.byTargetPosition}
            </p>
            <p>
              <strong>Misses by shooting order:</strong>{" "}
              {analysis.formatted.byReversedOrder}
            </p>
            <p>
              <strong>Misses by series:</strong> {analysis.formatted.byCourse}
            </p>
            <p>
              <strong>Misses by stand:</strong> {analysis.formatted.byPlate}
            </p>
            <p>
              <strong>Misses by sequence:</strong>{" "}
              {analysis.formatted.byTargetNumber}
            </p>
          </>
        ) : isLeirduesti ? (
          <>
            <p>
              <strong>Misses by post:</strong> {analysis.formatted.byCourse}
            </p>
            <p>
              <strong>Misses by actual presentation:</strong>{" "}
              {analysis.formatted.byTargetType}
            </p>
            <p>
              <strong>Misses by first/second/both target:</strong>{" "}
              {analysis.formatted.byTargetPosition}
            </p>
            <p>
              <strong>Misses by shooting order:</strong>{" "}
              {analysis.formatted.byReversedOrder}
            </p>
            <p>
              <strong>Misses by main reason:</strong>{" "}
              {analysis.formatted.byReason}
            </p>
            <p>
              <strong>Misses by where miss:</strong>{" "}
              {analysis.formatted.byWhere}
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>Misses by machine/target label:</strong>{" "}
              {analysis.formatted.byTargetLabel}
            </p>
            <p>
              <strong>Misses by actual presentation:</strong>{" "}
              {analysis.formatted.byTargetType}
            </p>
            <p>
              <strong>Misses by first/second/both target:</strong>{" "}
              {analysis.formatted.byTargetPosition}
            </p>
            <p>
              <strong>Misses by shooting order:</strong>{" "}
              {analysis.formatted.byReversedOrder}
            </p>
            <p>
              <strong>Misses by course:</strong> {analysis.formatted.byCourse}
            </p>
            <p>
              <strong>Misses by plate:</strong> {analysis.formatted.byPlate}
            </p>
          </>
        )}
      </div>
      <div className="card">
        <h2>Training recommendation</h2>
        {analysis.recommendation.map((text: string) => (
          <p key={text}>• {text}</p>
        ))}
      </div>
      <div className="card">
        <h2>Registered misses</h2>
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
      </div>
    </main>
  );
}
