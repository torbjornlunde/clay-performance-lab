"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { analyzeMisses, MissForAnalysis } from "@/lib/analysis/sessionAnalysis";
import { formatScore, getScoreSummary } from "@/lib/sessionScores";
import { supabase } from "@/lib/supabase/client";

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [misses, setMisses] = useState<any[]>([]);

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
      .select("id,name,discipline,shooting_format,total_targets,own_score,winning_score")
      .eq("id", params.id)
      .single();
    const { data: missData } = await supabase.from("misses").select("*").eq("session_id", params.id).order("created_at");
    setSession(sessionData);
    setMisses(missData || []);
  }

  if (!session) {
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  }

  const analysis = analyzeMisses(misses as MissForAnalysis[]);
  const score = getScoreSummary({ total_targets: session.total_targets, own_score: session.own_score, misses });

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
        {score.totalTargets !== null && (
          <span className="pill">
            Total targets <strong>{score.totalTargets}</strong>
          </span>
        )}
        {score.calculatedScore !== null && (
          <span className="pill">
            Calculated score: <strong>{formatScore(score.calculatedScore, score.totalTargets)}</strong>
          </span>
        )}
        {session.own_score !== null && session.own_score !== undefined && (
          <span className="pill">
            Official/manual score: <strong>{session.own_score}</strong>
          </span>
        )}
        {score.manualDiffers && (
          <p className="small notice">Manual score differs from logged misses. This can happen if not all misses were logged.</p>
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
        <h2>Patterns</h2>
        <p>
          <strong>Course:</strong> {analysis.formatted.byCourse}
        </p>
        <p>
          <strong>Plate:</strong> {analysis.formatted.byPlate}
        </p>
        <p>
          <strong>Target type:</strong> {analysis.formatted.byTargetType}
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
        {misses.length === 0 ? (
          <p>No misses registered yet.</p>
        ) : (
          misses.map((miss) => (
            <div className="subcard" key={miss.id}>
              <strong>
                Course {miss.course_number ?? "-"} · Plate {miss.plate ?? "-"} · Target {miss.target_number ?? "-"}
              </strong>
              <div className="small muted">
                {miss.target_type || "-"} · {miss.missed_target} · {miss.where_miss || "-"} · {miss.main_reason || "-"}
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
