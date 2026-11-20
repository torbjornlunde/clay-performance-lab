import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync('app/results/new/page.tsx', 'utf8');
const apply = source.slice(source.indexOf('  async function applySelectedTemplate('), source.indexOf('\n  useEffect(', source.indexOf('  async function applySelectedTemplate(')));
const save = source.slice(source.indexOf('  async function save('), source.indexOf('\n  return (', source.indexOf('  async function save(')));
const js = ts.transpileModule(apply + '\n' + save, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
async function run(failure) {
  const state = { saving: false, applying: false, err: '', routes: [], inserts: 0 };
  const supabase = {
    auth: { async getUser() { if (failure === 'auth') throw Error('network'); return { data: { user: failure === 'signedout' ? null : { id: 'u' } } }; } },
    from() { return { insert() { state.inserts++; return { select() { return { async single() { if (failure === 'insert') throw Error('network'); return { data: { id: 'saved-result' }, error: null }; } }; } }; } }; },
    async rpc() { if (failure === 'template') throw Error('network'); return { error: failure === 'template-error' ? { message: 'failed' } : null }; }
  };
  const ctx = {
    name: 'Competition', competitionDate: '2026-11-20', discipline: 'Compak Sporting', shootingGround: '', totalTargets: '50', ownScore: '41', winningScore: '48', leirdueResultUrl: '', notes: '', saving: false,
    selectedTemplateCandidate: { id: 'template', discipline: 'Compak Sporting' }, navigator: { onLine: true }, equipmentSelection: {}, equipmentSnapshot: null,
    supabase, recordAnalyticsEvent: async () => {}, userFacingSaveError: (_err, fallback) => fallback,
    parseOptionalInt: value => value === '' ? null : Number(value),
    setErr: value => { state.err = value; }, setSaving: value => { state.saving = value; }, setApplyingTemplate: value => { state.applying = value; }, setApplyMessage: () => {},
    router: { push: value => state.routes.push(value) },
  };
  const handler = new Function(...Object.keys(ctx), js + '\nreturn save;')(...Object.values(ctx));
  await handler({ preventDefault() {} });
  assert.equal(state.saving, false, `${failure}: form always leaves Saving`);
  assert.equal(state.applying, false, `${failure}: optional setup always leaves its saving state`);
  return state;
}
for (const failure of ['auth', 'insert']) {
 const state = await run(failure); assert.match(state.err, /Check your connection/); assert.equal(state.routes.length, 0);
}
assert.deepEqual((await run('signedout')).routes, ['/login']);
for (const failure of ['template', 'template-error']) {
 const state = await run(failure); assert.equal(state.inserts, 1); assert.equal(state.err, '');
 assert.match(state.routes[0], /sessions\/saved-result\?templateApplyFailed=result/);
}
assert.match((await run('none')).routes[0], /sessions\/saved-result\?resultSaved=1/);
console.log('Result save failures, signed-out recovery and post-save template failures passed');
