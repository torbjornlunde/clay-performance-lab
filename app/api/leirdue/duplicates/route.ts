import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { LeirdueCandidate, LeirdueDuplicateMatch, LeirdueDuplicateStatus } from "@/lib/leirdue/types";
import { compareLeirdueDuplicate, type LeirdueDuplicateSessionRow } from "@/lib/leirdue/duplicates";

export const dynamic = "force-dynamic";

type DuplicateBody = {
  candidates?: unknown;
};

type DuplicateResult = {
  candidate: LeirdueCandidate;
  status: LeirdueDuplicateStatus;
  matches: LeirdueDuplicateMatch[];
};

function supabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables.");
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(supabaseUrl, supabaseAnonKey, { global: { headers: authorization ? { Authorization: authorization } : {} } });
}

function isCandidate(value: unknown): value is LeirdueCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeirdueCandidate>;
  return typeof candidate.name === "string" && typeof candidate.discipline === "string" && typeof candidate.leirdueUrl === "string";
}

export async function POST(request: Request) {
  let body: DuplicateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid duplicate check request." }, { status: 400 });
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates.filter(isCandidate) : [];
  if (candidates.length === 0) return NextResponse.json({ results: [] });

  const supabase = supabaseForRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "You must be logged in to check Leirdue duplicates." }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("sessions")
    .select("id,name,discipline,competition_date,own_score,total_targets,winning_score,leirdue_result_url,notes")
    .eq("user_id", userData.user.id)
    .returns<LeirdueDuplicateSessionRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: DuplicateResult[] = candidates.map((candidate) => {
    const matches = (rows || [])
      .map((row) => compareLeirdueDuplicate(candidate, row))
      .filter((match): match is LeirdueDuplicateMatch => Boolean(match));
    const status: LeirdueDuplicateStatus = matches.some((match) => match.exact) ? "exact" : matches.length > 0 ? "possible" : "new";
    return { candidate, status, matches };
  });

  return NextResponse.json({ results });
}
