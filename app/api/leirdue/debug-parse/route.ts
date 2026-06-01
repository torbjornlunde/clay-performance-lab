import { NextResponse } from "next/server";
import { debugParseLeirdueResultUrl } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

type DebugParseBody = {
  url?: unknown;
  shooterName?: unknown;
  year?: unknown;
  selectedDisciplines?: unknown;
};

function validYear(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const year = Number(value);
  const currentYear = new Date().getFullYear() + 1;
  return Number.isInteger(year) && year >= 1990 && year <= currentYear ? year : null;
}

function validLeirdueUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "www.leirdue.net" || url.hostname === "leirdue.net";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: DebugParseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid debug parse request." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const shooterName = typeof body.shooterName === "string" ? body.shooterName.trim() : "";
  const year = validYear(body.year);
  const selectedDisciplines = Array.isArray(body.selectedDisciplines)
    ? body.selectedDisciplines.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if (!url || !validLeirdueUrl(url)) return NextResponse.json({ error: "A valid Leirdue URL is required." }, { status: 400 });
  if (!shooterName) return NextResponse.json({ error: "Shooter name is required." }, { status: 400 });

  const result = await debugParseLeirdueResultUrl({ url, shooterName, year, selectedDisciplines });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
