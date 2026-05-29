"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { analyzeMisses, MissForAnalysis } from "@/lib/analysis/sessionAnalysis";
import { supabase } from "@/lib/supabase/client";

type TargetDefinition = {
  course_number: number;
  machine: string;
  target_type: string | null;
  direction: string | null;
};

function definitionText(definition?: TargetDefinition) {
  if (!definition) return null;
  const parts = [definition.direction, definition.target_type].filter((value) => value && value !== "Unknown");
  return parts.length ? parts.join(" ").toLowerCase() : null;
}

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [misses, setMisses] = useState<any[]>([]);
  const [definitions, setDefinitions] = useState<TargetDefinition[]>([]);

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
    const { data: missData } = await supabase.from("misses").select("*").eq("session_id", params.id).order("created_at");
    const { data: definitionData } = await supabase
      .from("session_target_definitions")
      .select("course_number,machine,target_type,direction")
      .eq("session_id", params.id)
      .returns<TargetDefinition[]>();
    setSession(sessionData);
    setMisses(missData || []);
    setDefinitions(definitionData || []);
  }

  const enrichedMisses = useMemo(
    () =>
      misses.map((miss) => {
        const labels = String(miss.target_label || "")
          .split("+")
          .map((label) => label.trim())
          .filter(Boolean);
        const enrichedLabels = labels.map((label) => {
          const text = definitionText(definitions.find((definition) => definition.course_number === miss.course_number && definition.machine === label));
          return text ? `${label} – ${text}` : label;
        });
        return { ...miss, target_display_label: enrichedLabels.length ? enrichedLabels.join(" + ") : miss.target_label };
      }),
    [definitions, misses],
  );

  if (!session) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  const analysis = analyzeMisses(enrichedMisses as MissForAnalysis[]);

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
        {session.shooting_format && <span className="pill">{session.shooting_format}</span>}
        <div className="btns">
          <Link className="button" href={`/sessions/${session.id}/log`}>
            Log more
          </Link>
          <Link className="button secondary" href={`/sessions/${session.id}/targets`}>
            Target definitions
          </Link>
          <Link className="button secondary" href={`/sessions/${session.id}`}>
            Session
          </Link>
        </div>
      </div>
      <div className="card">
        <h2>Patterns</h2>
        <p>
          <strong>Course:</strong> {analysis.formatted.byCourse}
        </p>
        <p>
          <strong>Plate:</strong> {analysis.formatted.byPlate}
        </p>
        <p>
          <strong>Misses by machine/target label:</strong> {analysis.formatted.byTargetLabel}
        </p>
        <p>
          <strong>Misses by target type:</strong> {analysis.formatted.byTargetType}
        </p>
        <p>
          <strong>Miss row type:</strong> {analysis.formatted.byMissedTarget}
        </p>
        <p>
          <strong>Detailed missed target:</strong> {analysis.formatted.byTargetPosition}
        </p>
        <p>
          <strong>Where miss:</strong> {analysis.formatted.byWhere}
        </p>
        <p>
          <strong>Main reason:</strong> {analysis.formatted.byReason}
        </p>
      </div>
      <div className="card">
        <h2>Interpretation</h2>
        {analysis.interpretation.map((text: string) => (
          <p key={text}>• {text}</p>
        ))}
      </div>
      <div className="card">
        <h2>Training recommendation</h2>
        {analysis.recommendation.map((text: string) => (
          <p key={text}>• {text}</p>
        ))}
      </div>
      <div className="card">
        <h2>Registered misses</h2>
        {enrichedMisses.length === 0 ? (
          <p>No misses registered yet.</p>
        ) : (
          enrichedMisses.map((miss) => (
            <div className="subcard" key={miss.id}>
              <strong>
                Course {miss.course_number ?? "-"} · Plate {miss.plate ?? "-"} · Target {miss.target_number ?? "-"}
              </strong>
              <div className="small muted">
                {miss.target_display_label || miss.target_label || "-"} · {miss.target_type || "-"} · {miss.missed_target} · {miss.where_miss || "-"} · {miss.main_reason || "-"}
              </div>
              {miss.missed_target === "Both targets in pair" && (
                <>
                  <div className="small muted">
                    First target: {miss.first_where_miss || "-"} · {miss.first_main_reason || "-"}
                  </div>
                  <div className="small muted">
                    Second target: {miss.second_where_miss || "-"} · {miss.second_main_reason || "-"}
                  </div>
                </>
              )}
              {miss.comment && <div>{miss.comment}</div>}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
