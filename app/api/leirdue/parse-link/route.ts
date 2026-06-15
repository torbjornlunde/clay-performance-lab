import { NextResponse } from "next/server";
import { parseLeirdueManualResultLink } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

type ParseLinkBody = {
  url?: unknown;
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
    const isLeirdue = url.hostname === "www.leirdue.net" || url.hostname === "leirdue.net";
    const hasResultIdentifier = Boolean(url.searchParams.get("stevne") || url.searchParams.get("liste_id"));
    return isLeirdue && hasResultIdentifier;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: ParseLinkBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid import link request." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const year = validYear(body.year);
  const selectedDisciplines = Array.isArray(body.selectedDisciplines)
    ? body.selectedDisciplines.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if (!url || !validLeirdueUrl(url)) {
    return NextResponse.json({ error: "Please paste a valid Leirdue.net result or event link." }, { status: 400 });
  }

  const result = await parseLeirdueManualResultLink({ url, year, selectedDisciplines });
  const status = result.ok || result.listChoices.length > 0 ? 200 : 502;
  return NextResponse.json(result, { status });
}
