import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { LeirdueCandidate } from "@/lib/leirdue/types";

export const dynamic = "force-dynamic";

type SaveBody = {
  candidates?: unknown;
};

type SaveResult = {
  candidate: LeirdueCandidate;
  status: "saved" | "duplicate" | "error";
  id?: string;
  message?: string;
};

function supabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables.");
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(supabaseUrl, supabaseAnonKey, { global: { headers: authorization ? { Authorization: authorization } : {} } });
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCandidate(value: unknown): value is LeirdueCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeirdueCandidate>;
  return Boolean(
    typeof candidate.date === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.discipline === "string" &&
      numberOrNull(candidate.totalTargets) !== null &&
      numberOrNull(candidate.ownScore) !== null &&
      numberOrNull(candidate.winningScore) !== null,
  );
}

function sourceNotes(candidate: LeirdueCandidate) {
  const parts = [`Leirdue import: ${candidate.listType}`, `confidence: ${candidate.confidence}`];
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

  const candidates = Array.isArray(body.candidates) ? body.candidates.filter(isCandidate) : [];
  if (candidates.length === 0) return NextResponse.json({ error: "No selected candidates to save." }, { status: 400 });

  const supabase = supabaseForRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "You must be logged in to import Leirdue results." }, { status: 401 });

  const results: SaveResult[] = [];

  for (const candidate of candidates) {
    const ownScore = Number(candidate.ownScore);
    const totalTargets = Number(candidate.totalTargets);
    const winningScore = Number(candidate.winningScore);
    const url = candidate.leirdueUrl?.trim() || null;

    if (!candidate.name.trim() || !candidate.date || totalTargets <= 0 || ownScore < 0 || winningScore <= 0) {
      results.push({ candidate, status: "error", message: "Missing required result fields." });
      continue;
    }

    if (url) {
      const { data: duplicateByUrl, error: duplicateUrlError } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("leirdue_result_url", url)
        .maybeSingle<{ id: string }>();
      if (duplicateUrlError) {
        results.push({ candidate, status: "error", message: duplicateUrlError.message });
        continue;
      }
      if (duplicateByUrl) {
        results.push({ candidate: { ...candidate, alreadyImported: true }, status: "duplicate", id: duplicateByUrl.id, message: "Already imported" });
        continue;
      }
    }

    const { data: duplicateByFields, error: duplicateFieldsError } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("competition_date", candidate.date)
      .eq("name", candidate.name.trim())
      .eq("own_score", ownScore)
      .maybeSingle<{ id: string }>();

    if (duplicateFieldsError) {
      results.push({ candidate, status: "error", message: duplicateFieldsError.message });
      continue;
    }
    if (duplicateByFields) {
      results.push({ candidate: { ...candidate, alreadyImported: true }, status: "duplicate", id: duplicateByFields.id, message: "Already imported" });
      continue;
    }

    const notes = sourceNotes(candidate);
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
      results.push({ candidate, status: "error", message: insertError.message });
    } else {
      results.push({ candidate, status: "saved", id: inserted.id });
    }
  }

  return NextResponse.json({ results });
}
