import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCoachReportPrompt, COACH_REPORT_AI_SECTIONS } from "@/lib/ai/coachReportPrompt";

export const dynamic = "force-dynamic";

const MAX_EVIDENCE_PACKET_BYTES = 80_000;
const BLOCKED_NOTE_KEY_PATTERN = /(^|_)(body|text|content|note|notes|privateNotes|rawNote|rawNotes|private_note|private_notes)($|_)/i;
const ALLOWED_CONTEXT_KEYS = new Set(["notesThemes", "hasNotesContext"]);

function supabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: authorization ? { Authorization: authorization } : {} } });
}

async function requireUser(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return { ok: false as const, status: 500, error: "Missing Supabase auth context." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false as const, status: 401, error: "You must be signed in." };
  return { ok: true as const, userId };
}

function byteSize(value: string) { return new TextEncoder().encode(value).length; }
function isPlainObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function sanitizeEvidencePacket(value: unknown, path = "evidencePacket"): unknown {
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item, index) => sanitizeEvidencePacket(item, `${path}[${index}]`));
  if (!isPlainObject(value)) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (BLOCKED_NOTE_KEY_PATTERN.test(key) && !ALLOWED_CONTEXT_KEYS.has(key)) throw new Error(`Raw private note-like field is not allowed: ${childPath}`);
    sanitized[key] = sanitizeEvidencePacket(child, childPath);
  }
  return sanitized;
}

async function evidencePacketFromRequest(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_EVIDENCE_PACKET_BYTES) return { ok: false as const, status: 413, error: "Coach report evidence packet is too large." };
  const rawBody = await request.text();
  if (byteSize(rawBody) > MAX_EVIDENCE_PACKET_BYTES) return { ok: false as const, status: 413, error: "Coach report evidence packet is too large." };
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return { ok: false as const, status: 400, error: "Invalid coach report request." }; }
  const evidencePacket = isPlainObject(parsed) ? parsed.evidencePacket : undefined;
  if (!isPlainObject(evidencePacket)) return { ok: false as const, status: 400, error: "Missing coach report evidence packet." };
  try {
    const sanitized = sanitizeEvidencePacket(evidencePacket);
    const sanitizedText = JSON.stringify(sanitized);
    if (byteSize(sanitizedText) > MAX_EVIDENCE_PACKET_BYTES) return { ok: false as const, status: 413, error: "Coach report evidence packet is too large." };
    return { ok: true as const, evidencePacket: sanitized };
  } catch (error: any) {
    return { ok: false as const, status: 400, error: error?.message || "Coach report evidence packet contains unsupported private fields." };
  }
}

function textFromResponse(json: any) {
  if (typeof json?.output_text === "string") return json.output_text;
  const parts = Array.isArray(json?.output) ? json.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []) : [];
  return parts.map((part: any) => part?.text || "").join("\n").trim();
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const packet = await evidencePacketFromRequest(request);
  if (!packet.ok) return NextResponse.json({ error: packet.error }, { status: packet.status });
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI coach report is not configured." }, { status: 503 });
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_COACH_REPORT_MODEL || "gpt-4.1-mini", input: [{ role: "user", content: [{ type: "input_text", text: buildCoachReportPrompt(packet.evidencePacket) }] }], temperature: 0.3 }) });
    if (!response.ok) return NextResponse.json({ error: "AI coach report failed. The deterministic evidence preview is still available." }, { status: 502 });
    const reportText = textFromResponse(await response.json());
    if (!reportText) return NextResponse.json({ error: "AI coach report returned an empty response." }, { status: 502 });
    return NextResponse.json({ reportText, sections: COACH_REPORT_AI_SECTIONS });
  } catch {
    return NextResponse.json({ error: "AI coach report failed. The deterministic evidence preview is still available." }, { status: 500 });
  }
}

export const __test = { MAX_EVIDENCE_PACKET_BYTES, evidencePacketFromRequest, requireUser, sanitizeEvidencePacket };
