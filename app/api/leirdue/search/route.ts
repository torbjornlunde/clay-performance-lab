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
    const result = await searchLeirdueCandidates({ shooterName, year, disciplines });
    if (result.debug.fetchedUrls.length > 0 && result.debug.fetchedUrls.every((item) => !item.ok)) {
      return NextResponse.json({ ...result, error: FETCH_ERROR_MESSAGE }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: FETCH_ERROR_MESSAGE, debug: { fetchedUrls: [], eventLinksFound: 0, resultLinksFound: 0, eventPagesFetched: 0, eventInfoPagesFetched: 0, eventResultMenuPagesFetched: 0, listeIdLinksExtracted: 0, listeIdLinksFromResultMenus: 0, listeIdPagesFetched: 0, listeIdShooterPagesFound: 0, firstListeIdUrlsInspected: [], firstShooterMatchUrls: [], listInspectionLimitReached: false, resultMenuDiagnostics: [], validationUrlsInspected: 0, validationShooterMatches: 0, candidateCategoryCounts: { recommended: 0, review: 0, control: 0 }, candidatesWithOwnScore: 0, candidatesWithWinningScore: 0, candidatesWithTotalTargets: 0, candidatesWithShootingGround: 0, pagesInspected: 0, shooterPagesFound: 0, candidateRowsCreated: 0, rejectedReasons: [FETCH_ERROR_MESSAGE], candidateReasons: [FETCH_ERROR_MESSAGE], firstUsefulSnippet: null } }, { status: 502 });
  }
}
