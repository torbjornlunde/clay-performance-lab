import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DISCIPLINES = ["Sporting", "Compak Sporting", "FITASC Sporting", "Skeet", "Trap", "Other"] as const;
type Discipline = (typeof DISCIPLINES)[number];

type BetaInterestPayload = {
  name?: unknown;
  email?: unknown;
  country?: unknown;
  mainDiscipline?: unknown;
  levelComment?: unknown;
  instagramHandle?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanOptionalText(value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service configuration.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  let payload: BetaInterestPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Submit the beta interest form again." }, { status: 400 });
  }

  const name = cleanText(payload.name, 120);
  const email = cleanText(payload.email, 254).toLowerCase();
  const country = cleanText(payload.country, 120);
  const mainDiscipline = cleanText(payload.mainDiscipline, 40) as Discipline;
  const levelComment = cleanOptionalText(payload.levelComment, 1000);
  const instagramHandle = cleanOptionalText(payload.instagramHandle, 80);

  if (!name || !email || !country || !DISCIPLINES.includes(mainDiscipline)) {
    return NextResponse.json({ error: "Name, email, country, and main discipline are required." }, { status: 400 });
  }

  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const supabase = serviceClient();
    const { error } = await supabase.from("beta_interest_submissions").upsert(
      {
        name,
        email,
        country,
        main_discipline: mainDiscipline,
        level_comment: levelComment,
        instagram_handle: instagramHandle,
      },
      { onConflict: "normalized_email" },
    );

    if (error) {
      return NextResponse.json({ error: "We could not save your interest right now. Please try again." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Beta interest storage is not configured yet." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
