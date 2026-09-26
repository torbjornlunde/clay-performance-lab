import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
function load(path, dependencies = {}) {
  const source = readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const { readAllSharedRows } = load('lib/leirdue/paging.ts');
const { runBoundedLeirdueBatches } = load('lib/leirdue/recentBackfill.ts');
let clock = 0;
const bounded = await runBoundedLeirdueBatches(async () => { clock += 31_000; return clock; }, { now: () => clock });
assert.deepEqual(bounded, [31_000, 62_000, 93_000], 'daily backfill stops starting new batches at its time budget');
assert.equal((await runBoundedLeirdueBatches(async () => 1)).length, 4, 'a healthy daily run advances multiple bounded batches');
assert.equal((await runBoundedLeirdueBatches(async () => ({ hadPendingWork: false }), { shouldContinue: (batch) => batch.hadPendingWork })).length, 1, 'a settled year is refreshed only once');
const records = Array.from({ length: 875 }, (_, id) => id);
const pages = [];
const lookup = await readAllSharedRows(async (start, end) => {
  pages.push([start, end]);
  return { data: records.slice(start, end + 1), error: null };
});
assert.equal(lookup.rows.length, 875, 'a high-volume historical year is not truncated at 500');
assert.deepEqual(pages, [[0, 499], [500, 999]]);
assert.equal((await readAllSharedRows(async () => ({ data: null, error: { message: 'network' } }))).error.message, 'network', 'a failed page cannot masquerade as a complete year');
assert.match((await readAllSharedRows(async () => ({ data: [1, 2], error: null }), 2, 4)).error.message, /safe page limit/, 'a capped query fails rather than silently dropping rows');

function setup(failInsert = false, largeBatch = false) {
  let reads = 0;
  const inserts = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    from(table) {
      assert.equal(table, 'sessions');
      return {
        select() { return { eq() { return { order() { return { range: async () => { reads++; return { data: [], error: null }; } }; } }; } }; },
        async insert(rows) { inserts.push(rows); return { error: failInsert ? { message: 'write rejected' } : null }; },
      };
    },
  };
  const route = load('app/api/leirdue/save/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@supabase/supabase-js': { createClient: () => supabase },
    crypto: { randomUUID },
    '@/lib/leirdue/normalize': { extractLeirdueSourceIdentifiers: () => ({ stevneId: '1', listeId: '2' }) },
    '@/lib/leirdue/duplicates': { compareLeirdueDuplicate: (candidate, row) => candidate.leirdueUrl === row.leirdue_result_url && candidate.ownScore === row.own_score ? { id: row.id, exact: true, reason: 'same source and score' } : null },
    '@/lib/leirdue/saveValidation': { isLeirdueSaveCandidate: () => true, leirdueWinningScoreForInsert: (score) => score },
    '@/lib/leirdue/review': { correctedFieldNames: () => [], parsedValues: () => ({}) },
    '@/lib/leirdue/paging': { readAllSharedRows },
  });
  const candidate = (id, score, eventId = score) => ({ clientCandidateId: id, name: 'Event', date: '2022-08-01', discipline: 'Leirduesti', shooterName: 'Test Shooter', leirdueUrl: `https://www.leirdue.net/?stevne=${eventId}&liste_id=2`, ownScore: score, totalTargets: 100, winningScore: null, notes: '' });
  const candidates = largeBatch ? Array.from({ length: 120 }, (_, index) => candidate(`row-${index}`, 90, 1000 + index)) : [candidate('first', 90), candidate('same', 90), candidate('second', 91)];
  const post = () => route.POST(new Request('https://example.test/api/leirdue/save', { method: 'POST', body: JSON.stringify({ candidates }) }));
  return { post, get reads() { return reads; }, inserts };
}

const success = setup();
const saved = await (await success.post()).json();
assert.deepEqual(saved.results.map((row) => row.status), ['saved', 'duplicate', 'saved']);
assert.equal(success.reads, 1, 'saved sessions are read once for the whole year');
assert.equal(success.inserts.length, 1, 'many selected results use one atomic insert');
assert.equal(success.inserts[0].length, 2);
assert.equal(saved.results[0].id, success.inserts[0][0].id, 'response IDs are stable without relying on database row order');
assert.equal(saved.results[2].id, success.inserts[0][1].id);

const fullYear = setup(false, true);
const fullYearSaved = await (await fullYear.post()).json();
assert.equal(fullYearSaved.results.filter((row) => row.status === 'saved').length, 120);
assert.equal(fullYear.reads, 1);
assert.equal(fullYear.inserts.length, 1);
assert.equal(fullYear.inserts[0].length, 120, 'a full year does not issue one insert request per result');

const failure = setup(true);
const rejected = await (await failure.post()).json();
assert.deepEqual(rejected.results.map((row) => row.status), ['error', 'error', 'error'], 'a failed batch never reports an unsaved result as imported or duplicate');
assert.ok(rejected.results.every((row) => !row.id));

const cache = readFileSync('lib/leirdue/cache.ts', 'utf8');
assert.match(cache, /readAllSharedRows<SharedResultRow>/, 'year lookup uses the paged reader');
const refresh = readFileSync('app/api/leirdue/refresh-recent/route.ts', 'utf8');
assert.match(refresh, /ignoreDuplicates: true/g, 'daily discovery preserves completed ingestion states');
assert.match(refresh, /eq\("ingestion_status", "pending"\)/, 'unprocessed work is selected before refreshing completed lists');
assert.match(refresh, /runBoundedLeirdueBatches\(\(\) => refreshRecent\(service\), \{ shouldContinue: \(batch\) => batch\.hadPendingWork \}\)/, 'scheduled refresh drains pending work and stops on a settled year');
const adminIngest = readFileSync('app/api/leirdue/ingest/route.ts', 'utf8');
assert.equal((adminIngest.match(/ignoreDuplicates: true/g) || []).length, 2, 'admin rediscovery does not return completed events and lists to pending');

console.log('Leirdue full-year loading and bulk save tests passed');
