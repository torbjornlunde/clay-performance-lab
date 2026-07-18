import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

writeFileSync('.coach-report-ai-test-tsconfig.json', JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', jsx: 'react-jsx', lib: ['ES2022','DOM'], outDir: '.coach-report-ai-test-build', skipLibCheck: true, rootDir: '.', baseUrl: '.', ignoreDeprecations: '6.0', paths: { '@/*': ['./*'] } }, include: ['lib/ai/coachReportPrompt.ts', 'lib/entitlements/**/*.ts', 'app/api/coach-report/generate/route.ts'] }));
execSync('rm -rf .coach-report-ai-test-build && npx tsc -p .coach-report-ai-test-tsconfig.json && mkdir -p .coach-report-ai-test-build/node_modules/@/lib && cp -R .coach-report-ai-test-build/lib/ai .coach-report-ai-test-build/node_modules/@/lib/ai && cp -R .coach-report-ai-test-build/lib/entitlements .coach-report-ai-test-build/node_modules/@/lib/entitlements', { stdio: 'inherit' });
const { buildCoachReportPrompt, COACH_REPORT_AI_SECTIONS } = await import('../.coach-report-ai-test-build/lib/ai/coachReportPrompt.js');
const { handleCoachReportGenerate, __test } = await import('../.coach-report-ai-test-build/app/api/coach-report/generate/route.js');

const prompt = buildCoachReportPrompt({ notesThemes: ['fatigue'], privacy: { rawPrivateNotesIncluded: false } });
for (const heading of ['Coach summary','Performance context','Main findings','Discipline-specific notes','What to train next','Data quality']) assert(prompt.includes(heading), `${heading} is required`);
for (const guardrail of ['The data suggests','This should be tested, not assumed','Compared with the field level','Do not compare only against the winning score']) assert(prompt.includes(guardrail), `${guardrail} guardrail exists`);
assert.equal(COACH_REPORT_AI_SECTIONS.length, 6, 'AI route exposes required sections');

function deps({ user = { id: 'u1' }, openAiText = 'Coach summary\n- Good', capture = {}, profile = { user_id: 'u1', access_status: 'approved', system_role: 'user' }, profileError = null, entitlement = null, entitlementError = null, billingMode = 'beta_hidden' } = {}) {
  return {
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', OPENAI_API_KEY: 'openai', BILLING_MODE: billingMode },
    createSupabaseClient: (_url, _key, options) => {
      capture.supabaseOptions = options;
      return {
        auth: { getUser: async () => ({ data: { user } }) },
        from: (table) => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => table === 'user_access_profiles' ? { data: profile, error: profileError } : { data: entitlement, error: entitlementError } }) }),
          insert: async () => ({ error: null }),
        }),
      };
    },
    openAiFetch: async (_url, init) => { capture.openAiBody = JSON.parse(init.body); return new Response(JSON.stringify({ output_text: openAiText }), { status: 200 }); },
  };
}
function req(packet, headers = {}) { return new Request('https://app.test/api/coach-report/generate', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ evidencePacket: packet }) }); }

let response = await handleCoachReportGenerate(req({ selectedSessions: [] }), deps({ user: null }));
assert.equal(response.status, 401, 'unauthenticated API request returns 401');

const capture = {};
response = await handleCoachReportGenerate(req({ selectedSessions: [], notesThemes: ['fatigue'] }, { authorization: 'Bearer token' }), deps({ capture }));
assert.equal(response.status, 200, 'approved beta user can generate report in beta_hidden');
assert.equal((await response.json()).reportText, 'Coach summary\n- Good', 'authenticated request returns generated report');
assert.equal(capture.supabaseOptions.global.headers.Authorization, 'Bearer token', 'request auth header is forwarded to Supabase auth');
assert(!JSON.stringify(capture.openAiBody).includes('RAW PRIVATE NOTE'), 'raw private note body is not forwarded to OpenAI');
assert(JSON.stringify(capture.openAiBody).includes('notesThemes'), 'safe summarized note context reaches OpenAI packet');

response = await handleCoachReportGenerate(req({ selectedSessions: [] }), deps({ profile: null }));
assert.equal(response.status, 403, 'authenticated user without approved beta access cannot generate AI in beta_hidden');

response = await handleCoachReportGenerate(req({ selectedSessions: [] }), deps({ profile: null, profileError: { message: 'database unavailable' } }));
assert.equal(response.status, 403, 'failed access profile lookup does not grant AI access');

response = await handleCoachReportGenerate(req({ selectedSessions: [] }), deps({ billingMode: 'enabled', profile: null, entitlement: { plan: 'pro', status: 'active', valid_until: null } }));
assert.equal(response.status, 200, 'Pro user can generate report when billing is enabled');

response = await handleCoachReportGenerate(req({ selectedSessions: [] }), deps({ billingMode: 'enabled', profile: null, entitlement: null }));
assert.equal(response.status, 402, 'free user cannot generate AI report when billing is enabled');

response = await handleCoachReportGenerate(req({ selectedSessions: [] }), deps({ billingMode: 'enabled', profile: null, entitlementError: { message: 'database unavailable' } }));
assert.equal(response.status, 402, 'failed entitlement lookup does not grant Pro AI access');

response = await handleCoachReportGenerate(new Request('https://app.test/api/coach-report/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(__test.MAX_EVIDENCE_PACKET_BYTES + 1) }, body: '{}' }), deps());
assert.equal(response.status, 413, 'oversized evidence packet is rejected');

response = await handleCoachReportGenerate(req({ privateNoteBodies: ['RAW PRIVATE NOTE fatigue'], notesThemes: ['fatigue'] }), deps());
assert.equal(response.status, 400, 'raw private note body-like fields are rejected');
for (const key of ['body', 'text', 'content', 'rawPrivateNotes']) {
  assert.throws(() => __test.sanitizeEvidencePacket({ selectedSessions: [{ [key]: 'RAW PRIVATE NOTE fatigue' }] }), /Raw private note-like field/, `${key} raw note field is rejected`);
}
assert.doesNotThrow(() => __test.sanitizeEvidencePacket({ notesThemes: ['fatigue'], hasNotesContext: true, privacy: { rawPrivateNotesIncluded: false, reportBodyIncludedInAnalytics: false } }), 'summarized note themes and safe privacy metadata are accepted');
const sanitized = __test.sanitizeEvidencePacket({ notesThemes: ['fatigue'], privacy: { rawPrivateNotesIncluded: false } });
assert(!JSON.stringify(sanitized).includes('RAW PRIVATE NOTE'), 'sanitized AI packet has no raw private note body');

const page = readFileSync('app/coach-report/page.tsx', 'utf8');
assert.match(page, /Generate AI coach report/, 'generate button exists');
assert.match(page, /supabase\.auth\.getSession\(\)/, 'client reads current Supabase session');
assert.match(page, /Authorization: `Bearer \$\{accessToken\}`/, 'client sends access token to AI route');
assert.match(page, /coach_report_ai_generate_clicked/, 'generate click analytics exists');
assert.match(page, /coach_report_ai_generated/, 'success analytics exists');
assert.match(page, /coach_report_ai_failed/, 'failure analytics exists');
assert.match(page, /setAiError/, 'AI failure shows an error');
assert.match(page, /setSelectedIds/, 'selected sessions remain managed locally when AI fails');
assert.doesNotMatch(page, /metadata: [^{]*reportText/, 'report body is not sent to analytics metadata');
console.log('coach report AI focused tests passed');
