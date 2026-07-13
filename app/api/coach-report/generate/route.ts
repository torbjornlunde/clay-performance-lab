import { NextResponse } from "next/server";
import { buildCoachReportPrompt, COACH_REPORT_AI_SECTIONS } from "@/lib/ai/coachReportPrompt";

function textFromResponse(json: any) {
  if (typeof json?.output_text === "string") return json.output_text;
  const parts = Array.isArray(json?.output) ? json.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []) : [];
  return parts.map((part: any) => part?.text || "").join("\n").trim();
}

export async function POST(request: Request) {
  try {
    const { evidencePacket } = await request.json();
    if (!evidencePacket || typeof evidencePacket !== "object") return NextResponse.json({ error: "Missing coach report evidence packet." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI coach report is not configured." }, { status: 503 });
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_COACH_REPORT_MODEL || "gpt-4.1-mini", input: [{ role: "user", content: [{ type: "input_text", text: buildCoachReportPrompt(evidencePacket) }] }], temperature: 0.3 }) });
    if (!response.ok) return NextResponse.json({ error: "AI coach report failed. The deterministic evidence preview is still available." }, { status: 502 });
    const reportText = textFromResponse(await response.json());
    if (!reportText) return NextResponse.json({ error: "AI coach report returned an empty response." }, { status: 502 });
    return NextResponse.json({ reportText, sections: COACH_REPORT_AI_SECTIONS });
  } catch {
    return NextResponse.json({ error: "AI coach report failed. The deterministic evidence preview is still available." }, { status: 500 });
  }
}
