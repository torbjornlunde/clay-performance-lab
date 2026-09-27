import { handleCoachReportGenerate } from "@/app/api/coach-report/generate/route";

export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleCoachReportGenerate(request, {}, "shooter"); }
