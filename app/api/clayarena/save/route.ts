import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { validateClayArenaUrl } from "@/lib/clayarena/parser";
import type { ClayArenaCandidate } from "@/lib/clayarena/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");
  const authorization = request.headers.get("authorization");
  const supabase = createClient(url, key, { global: { headers: authorization ? { Authorization: authorization } : {} } });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "You must be logged in to import results." }, { status: 401 });
  const body = await request.json().catch(() => null) as { candidate?: ClayArenaCandidate } | null;
  const candidate = body?.candidate;
  const validUrl = candidate && validateClayArenaUrl(candidate.sourceUrl);
  if (!candidate || candidate.provider !== "ClayArena" || !validUrl || !candidate.resultIdentity || !candidate.competition?.trim() || !candidate.date || !DISCIPLINE_OPTIONS.includes(candidate.discipline) || !Number.isInteger(candidate.ownScore) || !Number.isInteger(candidate.totalTargets) || candidate.totalTargets! <= 0 || candidate.ownScore < 0 || candidate.ownScore > candidate.totalTargets!) return NextResponse.json({ error: "Review the required result fields before saving." }, { status: 400 });
  const { data: duplicate } = await supabase.from("sessions").select("id").eq("user_id", auth.user.id).eq("result_source_provider", "clayarena").eq("result_source_identity", candidate.resultIdentity).maybeSingle<{ id: string }>();
  if (duplicate) return NextResponse.json({ error: "This ClayArena result is already imported.", id: duplicate.id }, { status: 409 });
  const notes = [`source: clayarena`, `shooter_name: ${candidate.shooterName}`, candidate.category ? `shooter_class: ${candidate.category}` : null, candidate.competitorNumber ? `competitor_number: ${candidate.competitorNumber}` : null, candidate.placement ? `placement: ${candidate.placement}` : null, candidate.seriesScores.length ? `series_scores: ${candidate.seriesScores.join(",")}` : null, candidate.shootOff !== null ? `shoot_off: ${candidate.shootOff}` : null].filter(Boolean).join(". ");
  const { data, error } = await supabase.from("sessions").insert({ user_id: auth.user.id, session_type: "Competition", name: candidate.competition.trim(), competition_date: candidate.date, discipline: candidate.discipline, shooting_ground: candidate.venue?.trim() || null, own_score: candidate.ownScore, total_targets: candidate.totalTargets, winning_score: candidate.winningScore, notes, result_source_provider: "clayarena", result_source_competition_id: candidate.competitionId, result_source_identity: candidate.resultIdentity, result_source_url: validUrl.url }).select("id").single<{ id: string }>();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This ClayArena result is already imported." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ id: data.id });
}
