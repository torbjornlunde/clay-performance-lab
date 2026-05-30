import { NextResponse } from "next/server";
import { FETCH_ERROR_MESSAGE, searchLeirdueCandidates } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

type SearchBody = {
  shooterName?: unknown;
  year?: unknown;
  disciplines?: unknown;
};

function validYear(value: unknown) {
  const year = Number(value);
  const currentYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1990 || year > currentYear) return null;
  return year;
}

export async function POST(request: Request) {
  let body: SearchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }

  const shooterName = typeof body.shooterName === "string" ? body.shooterName.trim() : "";
  const year = validYear(body.year);
  const disciplines = Array.isArray(body.disciplines) ? body.disciplines.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];

  if (!shooterName || !year || disciplines.length === 0) {
    return NextResponse.json({ error: "Shooter name, year and at least one discipline are required." }, { status: 400 });
  }

  try {
    const candidates = await searchLeirdueCandidates({ shooterName, year, disciplines });
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ error: FETCH_ERROR_MESSAGE }, { status: 502 });
  }
}
