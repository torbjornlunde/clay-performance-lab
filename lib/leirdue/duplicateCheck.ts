import type { LeirdueCandidate, LeirdueDuplicateMatch, LeirdueDuplicateStatus } from "@/lib/leirdue/types";

export type LeirdueDuplicateApiResult = { clientCandidateId: string; candidate: LeirdueCandidate; status: LeirdueDuplicateStatus; matches: LeirdueDuplicateMatch[] };
export type DuplicateCheckOutcome = { ok: true; results: LeirdueDuplicateApiResult[] } | { ok: false; error: string };
type FetchResponse = { ok: boolean; json(): Promise<unknown> };
type Fetcher = (url: string, init: RequestInit) => Promise<FetchResponse>;

const FAILURE_MESSAGE = "Duplicate checking could not be completed. No result was imported. Retry is safe.";
const DUPLICATE_CHECK_TIMEOUT_MS = 15_000;

function validResult(value: unknown): value is LeirdueDuplicateApiResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<LeirdueDuplicateApiResult>;
  return typeof result.clientCandidateId === "string" && result.clientCandidateId.length > 0
    && (result.status === "new" || result.status === "possible" || result.status === "exact")
    && Array.isArray(result.matches) && Boolean(result.candidate && typeof result.candidate === "object");
}

export async function requestLeirdueDuplicateCheck(candidates: LeirdueCandidate[], token: string, fetcher: Fetcher = fetch): Promise<DuplicateCheckOutcome> {
  const submittedIds = candidates.map((candidate) => candidate.clientCandidateId).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (submittedIds.length !== candidates.length || new Set(submittedIds).size !== submittedIds.length) return { ok: false, error: FAILURE_MESSAGE };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DUPLICATE_CHECK_TIMEOUT_MS);
  try {
    const response = await fetcher("/api/leirdue/duplicates", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ candidates }), signal: controller.signal });
    if (!response.ok) return { ok: false, error: FAILURE_MESSAGE };
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { results?: unknown }).results)) return { ok: false, error: FAILURE_MESSAGE };
    const results = (payload as { results: unknown[] }).results;
    if (!results.every(validResult) || results.length !== submittedIds.length) return { ok: false, error: FAILURE_MESSAGE };
    const returnedIds = results.map((result) => result.clientCandidateId);
    if (new Set(returnedIds).size !== returnedIds.length || submittedIds.some((id) => !returnedIds.includes(id))) return { ok: false, error: FAILURE_MESSAGE };
    return { ok: true, results };
  } catch {
    return { ok: false, error: FAILURE_MESSAGE };
  } finally {
    clearTimeout(timeout);
  }
}
