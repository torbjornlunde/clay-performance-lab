import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Execute the real POST handler and parser diagnostics; replace only external
// cache/crawl I/O. Full project typechecking is a separate check.
const build = '.leirdue-search-route-test-build';
try {
  execFileSync('npx', ['tsc', 'app/api/leirdue/search/route.ts', 'lib/disciplines.ts', 'lib/leirdue/normalize.ts', 'lib/leirdue/parser.ts', 'lib/leirdue/scoringRules.ts', '--ignoreConfig', '--noCheck', '--module', 'commonjs', '--target', 'ES2022', '--rootDir', '.', '--outDir', build], { stdio: 'inherit' });
  function load(path, dependencies = {}) {
    const module = { exports: {} };
    const require = (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name} in ${path}`);
      return dependencies[name];
    };
    new Function('require', 'module', 'exports', readFileSync(resolve(build, path), 'utf8'))(require, module, module.exports);
    return module.exports;
  }
  const disciplines = load('lib/disciplines.js');
  const normalize = load('lib/leirdue/normalize.js', { '../disciplines': disciplines });
  const parser = load('lib/leirdue/parser.js', {
    '@/lib/disciplines': disciplines,
    '@/lib/leirdue/normalize': normalize,
    '@/lib/leirdue/scoringRules': load('lib/leirdue/scoringRules.js'),
  });
  const candidate = (discipline, id) => ({ discipline, leirdueUrl: `https://www.leirdue.net/?stevne=${id}&liste_id=1`, stevneId: String(id), listeId: '1', date: '2026-06-01', shooterName: 'Kari Nordmann', ownScore: 23, totalTargets: 25, category: 'recommended' });
  const trap = candidate('Trap', 1);
  const skeet = candidate('Skeet', 2);
  const sharedResult = (candidates, indexingComplete = true) => ({ candidates, stats: { ok: true, error: null, totalRows: candidates.length, reviewableCount: candidates.length, validCount: candidates.length, needsReviewCount: 0, invalidCount: 0, failedCount: 0, indexingComplete, queryDurationMs: 0, acceptedNameMatchReasons: [], semanticEventGroupDiagnostics: [] } });
  const cachedResult = { candidates: [], stats: { cachedImportableCandidatesFound: 0, cacheUsed: false, cacheReadOk: true, cacheReadErrors: [], invalidListKeys: [], cachedCandidatesFound: 0 } };

  function setup({ shared = sharedResult([trap, skeet]), live = [skeet] } = {}) {
    const calls = [];
    const record = (name, result) => async (...args) => { calls.push({ name, args }); return typeof result === 'function' ? result() : result; };
    const writeStats = { serviceRoleCacheWriteEnabled: true, cacheWriteOk: true, cacheWriteErrors: [], invalidListsStored: 0, liveCandidatesStored: live.length };
    const cache = {
      getSharedLeirdueShooterResults: record('shared', shared),
      getCachedLeirdueCandidates: record('cache', cachedResult),
      getLeirdueCrawlProgress: record('progress', { progress: null }),
      repairLeirdueInvalidCompleteState: record('repair', { ok: true }),
      storeLeirdueCandidatesInCache: record('storeCandidates', writeStats),
      storeLeirdueCrawlIndexesInCache: record('storeIndexes', writeStats),
      storeLeirdueInvalidListDecisionsInCache: record('storeInvalid', writeStats),
      storeLeirdueCrawlProgress: record('storeProgress', { ok: true, status: 'incomplete', processedWorkCount: 1, remainingWork: 1 }),
    };
    const route = load('app/api/leirdue/search/route.js', {
      'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
      '@/lib/disciplines': disciplines,
      '@/lib/leirdue/cache': cache,
      '@/lib/leirdue/parser': { ...parser, searchLeirdueCandidates: record('live', () => ({ candidates: [...live], debug: parser.emptyLeirdueSearchDebug(), continuationToken: null })) },
    });
    const post = (body) => route.POST(new Request('https://example.test/api/leirdue/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shooterName: 'Kari Nordmann', year: 2026, ...body }) }));
    return { post, calls };
  }

  for (const preferences of [[], undefined, ['Skeet']]) {
    const { post, calls } = setup();
    const response = await post({ disciplines: preferences });
    assert.equal(response.status, 200, 'empty, omitted and nonempty preferences are accepted');
    const data = await response.json();
    assert.deepEqual(data.candidates.map(row => row.discipline), ['Trap', 'Skeet'], 'preferences do not exclude other disciplines');
    assert.equal(data.continuationToken, null, 'a complete shared index needs no continuation');
    assert.deepEqual(calls.find(call => call.name === 'shared').args[0].disciplines, preferences || []);
  }

  for (const preferences of [[], ['Skeet']]) {
    const { post, calls } = setup({ shared: sharedResult([]) });
    const response = await post({ disciplines: preferences });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).candidates[0].discipline, 'Skeet');
    for (const name of ['cache', 'progress', 'live', 'storeProgress']) {
      assert.deepEqual(calls.find(call => call.name === name).args[0].disciplines, disciplines.DISCIPLINE_OPTIONS, `${name} uses the full search scope regardless of preferences`);
    }
  }

  const incomplete = setup({ shared: sharedResult([trap], false) });
  const initial = await (await incomplete.post({ disciplines: ['Skeet'] })).json();
  assert.equal(initial.candidates[0].discipline, 'Trap', 'existing rows are shown immediately');
  assert.ok(initial.continuationToken, 'an unrelated cached hit cannot end an incomplete search');
  assert.equal(initial.debug.continuationAvailable, true);
  assert.ok(initial.debug.pendingListeIdQueueRemaining > 0, 'the UI can enable Continue search');
  const continued = await incomplete.post({ disciplines: ['Skeet'], continuationToken: initial.continuationToken, requestMode: 'continue', explicitContinue: true });
  assert.equal(continued.status, 200);
  assert.equal((await continued.json()).candidates[0].discipline, 'Skeet', 'continuation finds the missing preferred result');
  assert.deepEqual(incomplete.calls.find(call => call.name === 'live').args[0].disciplines, disciplines.DISCIPLINE_OPTIONS);
  assert.equal(incomplete.calls.find(call => call.name === 'live').args[0].continuationToken, null, 'the restart marker never reaches the parser as a serialized crawl token');

  const manual = setup();
  assert.equal((await manual.post({ disciplines: [], sourceUrl: trap.leirdueUrl })).status, 200, 'direct links also allow no preferences');
  assert.ok(!manual.calls.some(call => call.name === 'shared'), 'direct links bypass the shared index');
  assert.equal(manual.calls.find(call => call.name === 'live').args[0].sourceUrl, trap.leirdueUrl);

  const unavailable = setup({ shared: { ...sharedResult([]), stats: { ...sharedResult([]).stats, ok: false, error: 'Unavailable' } } });
  assert.equal((await unavailable.post({ disciplines: [] })).status, 200, 'cache failures retain the live fallback');
  assert.ok(unavailable.calls.some(call => call.name === 'live'));

  for (const body of [{ shooterName: '' }, { year: 1800 }, { year: 'invalid' }]) {
    const invalid = setup();
    assert.equal((await invalid.post(body)).status, 400, 'name/year validation is preserved');
    assert.equal(invalid.calls.length, 0);
  }
  assert.deepEqual(normalize.sharedLeirdueCandidateIdentity(normalize.leirdueNameMatchReason('Kari Anne Nordmann', 'Kari Marie Nordmann'), true), { shooterMatchStatus: 'possible_match', shooterMatchReason: 'partial/initial match', category: 'review', importRecommended: false }, 'ambiguous identities remain review-only');
  console.log('Leirdue search route behavioral tests passed (optional preferences, full search scopes, shared index continuation, direct link, fallback and validation).');
} finally {
  rmSync(build, { recursive: true, force: true });
}
