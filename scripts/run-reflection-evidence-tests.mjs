import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadTs(path, modules = {}) {
  const source = readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in modules) return modules[name];
    throw new Error(`Unexpected import in ${path}: ${name}`);
  };
  new Function("module", "exports", "require", js)(module, module.exports, localRequire);
  return module.exports;
}

const evidence = loadTs("lib/ai/reflectionEvidence.ts");
const valid = { items: [
  { category: "physical_state", normalized_value: "fatigue_late", label: "feeling tired late in the competition", evidence_basis: "self_report", confidence: "high", reference: null },
  { category: "possible_issue", normalized_value: "timing", label: "timing may be worth checking", evidence_basis: "ai_inference", confidence: "low", reference: null },
] };
const parsed = evidence.validateReflectionEvidenceOutput(valid);
assert.equal(parsed.length, 2);
assert.match(evidence.acceptedEvidenceSentence(parsed[0]), /^You reported/);
assert.match(evidence.acceptedEvidenceSentence(parsed[1]), /^One reviewed AI hypothesis/);
assert.throws(() => evidence.validateReflectionEvidenceOutput({ items: [{ ...valid.items[0], category: "score" }] }));
assert.throws(() => evidence.validateReflectionEvidenceOutput({ items: Array(9).fill(valid.items[0]) }));
assert.throws(() => evidence.validateReflectionEvidenceOutput({ items: [{ ...valid.items[0], label: "x".repeat(161) }] }));
assert.throws(() => evidence.validateReflectionEvidenceOutput({ items: [{ ...valid.items[0], reference: "the third station by the trees" }] }));
assert.equal(evidence.reflectionSupportsReference("Wind picked up at Post 3.", "Post 3"), true);
assert.equal(evidence.reflectionSupportsReference("Wind picked up late.", "Post 3"), false);

class AccessError extends Error { constructor(message, status) { super(message); this.status = status; } }
let recordedUsage = 0;
const route = loadTs("app/api/reflections/interpret/route.ts", {
  "next/server": { NextResponse: { json: (body, init = {}) => Response.json(body, init) } },
  "@supabase/supabase-js": { createClient: () => { throw new Error("injected client required"); } },
  "@/lib/entitlements/check": { getBillingMode: () => "preview_only" },
  "@/lib/entitlements/userContext": { createEntitlementUserContext: (input) => input },
  "@/lib/entitlements/server": {
    FeatureAccessError: AccessError,
    recordFeatureUsage: async () => { recordedUsage += 1; },
    requirePaidCostAccess: (_feature, context) => {
      if ((context.trialUsage?.["ai.reflection_interpretation"] || 0) >= 3) throw new AccessError("Preview limit reached.", 402);
    },
  },
  "@/lib/ai/reflectionEvidence": evidence,
});

function supabaseScenario(options = {}) {
  const calls = [];
  const note = options.note === null ? null : {
    id: "note-1", user_id: options.noteOwner || "user-1", session_id: "session-1", note_scope: "session",
    body: options.noteBody === undefined ? "I felt tired late at Post 3." : options.noteBody,
    context_tags: ["wind", "competition_pressure"], updated_at: "2026-09-15T12:00:00Z",
    sessions: { user_id: options.sessionOwner || "user-1", session_type: "Competition" },
  };
  const insertedRows = [];
  function result(table, operation, payload) {
    if (table === "private_session_notes") return { data: note, error: options.noteError || null };
    if (table === "user_access_profiles") return { data: { user_id: "user-1", access_status: "approved", system_role: "user" }, error: null };
    if (table === "user_entitlements") return { data: null, error: null };
    if (table === "feature_usage_events") return { data: null, error: options.usageError || null, count: options.usage ?? 0 };
    if (table === "private_reflection_evidence" && operation === "insert") {
      insertedRows.push(...payload);
      return { data: payload.map((row, index) => ({ id: `evidence-${index}`, ...row })), error: options.insertError || null };
    }
    if (table === "private_reflection_evidence") return { data: options.existing || [], error: options.existingError || null };
    throw new Error(`Unhandled table ${table}`);
  }
  function query(table) {
    let operation = "select"; let payload;
    const chain = {
      select() { if (operation !== "insert") operation = "select"; return chain; },
      insert(rows) { operation = "insert"; payload = rows; calls.push({ table, operation, payload }); return chain; },
      eq() { return chain; }, order() { return chain; }, maybeSingle() { return Promise.resolve(result(table, operation, payload)); },
      then(resolve, reject) { return Promise.resolve(result(table, operation, payload)).then(resolve, reject); },
    };
    return chain;
  }
  return {
    client: { auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : { id: "user-1" } } }) }, from: (table) => query(table) },
    calls, insertedRows,
  };
}

function request(noteId = "note-1") {
  return new Request("https://example.test/api/reflections/interpret", {
    method: "POST", headers: { authorization: "Bearer private-token", "content-type": "application/json" }, body: JSON.stringify({ noteId }),
  });
}
async function invoke(options = {}, ai = {}) {
  const scenario = supabaseScenario(options);
  let aiCalls = 0; let outbound;
  const openAiFetch = async (_url, init) => {
    aiCalls += 1; outbound = JSON.parse(init.body);
    if (ai.throw) throw new Error("network failure");
    return { ok: ai.ok !== false, json: async () => ai.json || { output_text: JSON.stringify(valid) } };
  };
  const response = await route.handleReflectionInterpret(request(), {
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", OPENAI_API_KEY: "secret" },
    createSupabaseClient: () => scenario.client, openAiFetch,
  });
  return { status: response.status, body: await response.json(), aiCalls, outbound, ...scenario };
}

assert.equal((await invoke({ authenticated: false })).status, 401, "unauthenticated requests are rejected");
assert.equal((await invoke({ noteOwner: "other-user" })).status, 404, "non-owner reflections are hidden");
let outcome = await invoke({ noteBody: "   " });
assert.equal(outcome.status, 400); assert.equal(outcome.aiCalls, 0, "empty reflections never call AI"); assert.equal(outcome.insertedRows.length, 0);

recordedUsage = 0;
outcome = await invoke();
assert.equal(outcome.status, 200); assert.equal(outcome.insertedRows.length, 2);
assert.ok(outcome.insertedRows.every((row) => row.review_status === "pending"), "valid output persists pending proposals only");
assert.equal(recordedUsage, 1, "successful generation records one usage event");
const userPayload = JSON.parse(outcome.outbound.input[1].content[0].text);
assert.deepEqual(userPayload, { reflection: "I felt tired late at Post 3.", existing_context_tags: ["wind", "competition_pressure"] });
assert.doesNotMatch(JSON.stringify(userPayload), /note-1|session-1|private-token|user-1|secret/, "outbound payload contains only current body and safe tags");

for (const ai of [{ json: { output_text: "not-json" } }, { json: { output_text: JSON.stringify({ items: [{ ...valid.items[0], category: "score" }] }) } }, { ok: false }, { throw: true }]) {
  outcome = await invoke({}, ai);
  assert.ok(outcome.status >= 500); assert.equal(outcome.insertedRows.length, 0, "invalid or failed AI output cannot mutate evidence");
}
outcome = await invoke({ existing: [{ id: "existing-1", review_status: "accepted" }] });
assert.equal(outcome.status, 200); assert.equal(outcome.body.reused, true); assert.equal(outcome.aiCalls, 0); assert.equal(outcome.insertedRows.length, 0, "same revision reuses accepted history");
outcome = await invoke({ usage: 3 });
assert.equal(outcome.status, 402); assert.equal(outcome.aiCalls, 0); assert.equal(outcome.insertedRows.length, 0, "preview limit is enforced before AI");

const selection = loadTs("lib/ai/currentReflectionEvidence.ts");
const note = { id: "note-1", updated_at: "current" };
const rows = [
  { ...valid.items[0], source_note_id: "note-1", source_note_updated_at: "current", review_status: "accepted" },
  { ...valid.items[1], source_note_id: "note-1", source_note_updated_at: "current", review_status: "accepted" },
  { ...valid.items[0], source_note_id: "note-1", source_note_updated_at: "current", review_status: "pending" },
  { ...valid.items[0], source_note_id: "note-1", source_note_updated_at: "current", review_status: "rejected" },
  { ...valid.items[0], source_note_id: "note-1", source_note_updated_at: "older", review_status: "accepted" },
];
const current = selection.currentAcceptedReflectionEvidence(rows, [note]);
assert.equal(current.length, 2, "pending, rejected, and stale accepted evidence are excluded downstream");
assert.match(evidence.acceptedEvidenceSentence(current[0]), /^You reported/);
assert.match(evidence.acceptedEvidenceSentence(current[1]), /^One reviewed AI hypothesis/, "basis remains qualified downstream");

const component = readFileSync("app/components/ReflectionEvidenceReview.tsx", "utf8");
assert.match(component, /Evidence could not be loaded/); assert.match(component, /!canInterpret/);
const analysisPage = readFileSync("app/sessions/[id]/analysis/page.tsx", "utf8");
assert.match(analysisPage, /Reviewed reflection evidence/); assert.match(analysisPage, /currentAcceptedReflectionEvidence/);
const sessionPage = readFileSync("app/sessions/[id]/page.tsx", "utf8");
assert.match(sessionPage, /\(noteDrafts\.session \|\| ""\) === \(noteFor\("session"\)\?\.body \|\| ""\)/);
const migration = readFileSync("supabase/migrations/20260915120000_private_reflection_evidence.sql", "utf8");
assert.match(migration, /enable row level security/); assert.match(migration, /Reflection evidence is stale/);
const sqlTest = readFileSync("supabase/tests/private_reflection_evidence.sql", "utf8");
assert.match(sqlTest, /set_config\('request\.jwt\.claims'/); assert.match(sqlTest, /non-owner could read reflection evidence/); assert.match(sqlTest, /stale evidence was accepted/);

console.log("reflection evidence executable route, downstream, UI, and SQL regression tests passed");
