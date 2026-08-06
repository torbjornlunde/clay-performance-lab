import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { LeirdueCandidate, LeirdueDuplicateMatch } from "@/lib/leirdue/types";
import { extractLeirdueSourceIdentifiers } from "@/lib/leirdue/normalize";
import { compareLeirdueDuplicate, type LeirdueDuplicateSessionRow } from "@/lib/leirdue/duplicates";
import { isLeirdueSaveCandidate, leirdueWinningScoreForInsert } from "@/lib/leirdue/saveValidation";
import { correctedFieldNames, parsedValues, validateLeirdueReviewedCandidate } from "@/lib/leirdue/review";

export const dynamic = "force-dynamic";

type SaveBody = {
  candidates?: unknown;
};

type SaveResult = {
  clientCandidateId?: string;
  candidate: LeirdueCandidate;
  status: "saved" | "duplicate" | "error";
  id?: string;
  message?: string;
  duplicateMatches?: LeirdueDuplicateMatch[];
};

function supabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables.");
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(supabaseUrl, supabaseAnonKey, { global: { headers: authorization ? { Authorization: authorization } : {} } });
}

function isCandidate(value: unknown): value is LeirdueCandidate {
  return isLeirdueSaveCandidate(value);
}

function sourceNotes(candidate: LeirdueCandidate, importedAt: string) {
  const ids = extractLeirdueSourceIdentifiers(candidate.leirdueUrl);
  const parts = [
    "source: leirdue_net",
    "import_type: result_only",
    `imported_at: ${importedAt}`,
    `source_url: ${candidate.leirdueUrl || "unknown"}`,
    `stevne_id: ${ids.stevneId || "unknown"}`,
    `liste_id: ${ids.listeId || "unknown"}`,
    `shooter_name: ${candidate.shooterName || "unknown"}`,
    `shooter_class: ${candidate.shooterClass || "unknown"}`,
    `placement: ${candidate.placement ?? "unknown"}`,
    `series_scores: ${(candidate.reviewedSeriesScores || candidate.seriesScores)?.length ? (candidate.reviewedSeriesScores || candidate.seriesScores)?.map((value) => value ?? "unknown").join(",") : "unknown"}`,
    `Leirdue import: ${candidate.listType}`,
    `confidence: ${candidate.confidence}`,
  ];
  const corrected = correctedFieldNames(candidate);
  if (corrected.length) {
    const original = parsedValues(candidate);
    parts.push(`user_corrected_fields: ${corrected.join(",")}`);
    parts.push(`original_parsed_own_score: ${original.ownScore ?? "unknown"}`);
    parts.push(`original_parsed_total_targets: ${original.totalTargets ?? "unknown"}`);
    parts.push(`original_parsed_winning_score: ${original.winningScore ?? "unknown"}`);
    parts.push(`original_parsed_series_scores: ${original.seriesScores.length ? original.seriesScores.join(",") : "unknown"}`);
    parts.push(`reviewed_series_scores: ${(candidate.reviewedSeriesScores || []).length ? candidate.reviewedSeriesScores?.map((value) => value ?? "unknown").join(",") : "unknown"}`);
  }
  if (candidate.warnings?.length) parts.push(`warnings: ${candidate.warnings.join(" | ")}`);
  if (candidate.notes?.trim()) parts.push(candidate.notes.trim());
  return parts.join(". ");
}

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid save request." }, { status: 400 });
  }

  const requested = Array.isArray(body.candidates) ? body.candidates : [];
  if (requested.length === 0) return NextResponse.json({ error: "No selected candidates to save." }, { status: 400 });
  const invalid = requested.find((candidate) => !isCandidate(candidate));
  if (invalid) return NextResponse.json({ error: "Invalid reviewed result.", fieldErrors: typeof invalid === "object" && invalid ? validateLeirdueReviewedCandidate(invalid as LeirdueCandidate).errors : {} }, { status: 400 });
  const candidates = requested as LeirdueCandidate[];

  const supabase = supabaseForRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "You must be logged in to import Leirdue results." }, { status: 401 });

  const results: SaveResult[] = [];

  for (const candidate of candidates) {
    const ownScore = Number(candidate.ownScore);
    const totalTargets = Number(candidate.totalTargets);
    const winningScore = leirdueWinningScoreForInsert(candidate.winningScore);
    const url = candidate.leirdueUrl?.trim() || null;

    if (!candidate.name.trim() || !candidate.date || totalTargets <= 0 || ownScore < 0 || ownScore > totalTargets) {
      results.push({ clientCandidateId: candidate.clientCandidateId, candidate, status: "error", message: "Missing required result fields." });
      continue;
    }

    const { data: duplicateRows, error: duplicateError } = await supabase
      .from("sessions")
      .select("id,name,discipline,competition_date,own_score,total_targets,winning_score,leirdue_result_url,notes")
      .eq("user_id", userData.user.id)
      .returns<LeirdueDuplicateSessionRow[]>();

    if (duplicateError) {
      results.push({ clientCandidateId: candidate.clientCandidateId, candidate, status: "error", message: duplicateError.message });
      continue;
    }

    const duplicateMatches = (duplicateRows || [])
      .map((row) => compareLeirdueDuplicate(candidate, row))
      .filter((match): match is LeirdueDuplicateMatch => Boolean(match));
    const exactDuplicate = duplicateMatches.find((match) => match.exact);
    const possibleDuplicate = duplicateMatches.find((match) => !match.exact);

    if (exactDuplicate) {
      results.push({ clientCandidateId: candidate.clientCandidateId, candidate: { ...candidate, alreadyImported: true, duplicateStatus: "exact", duplicateMatches }, status: "duplicate", id: exactDuplicate.id, message: "Already imported from the same Leirdue source.", duplicateMatches });
      continue;
    }

    if (possibleDuplicate && !candidate.allowDuplicateSave) {
      results.push({ clientCandidateId: candidate.clientCandidateId, candidate: { ...candidate, duplicateStatus: "possible", duplicateMatches }, status: "duplicate", id: possibleDuplicate.id, message: "Possible duplicate found. Review it and choose Save anyway if this is a separate result.", duplicateMatches });
      continue;
    }

    const importedAt = new Date().toISOString();
    const notes = sourceNotes(candidate, importedAt);
    const { data: inserted, error: insertError } = await supabase
      .from("sessions")
      .insert({
        user_id: userData.user.id,
        session_type: "Competition",
        name: candidate.name.trim(),
        discipline: candidate.discipline,
        competition_date: candidate.date,
        shooting_ground: candidate.shootingGround?.trim() || null,
        total_targets: totalTargets,
        own_score: ownScore,
        winning_score: winningScore,
        leirdue_result_url: url,
        notes,
        shooting_format: null,
        course_count: null,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError) {
      results.push({ clientCandidateId: candidate.clientCandidateId, candidate, status: "error", message: insertError.message });
    } else {
      results.push({ clientCandidateId: candidate.clientCandidateId, candidate, status: "saved", id: inserted.id });
    }
  }

  return NextResponse.json({ results });
}
