import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync('rm -rf .coach-report-leirdue-test-build && npx tsc lib/analysis/coachReportEvidence.ts lib/analysis/coachReportLeirdueContext.ts lib/analysis/deterministicSessionAnalysis.ts lib/leirdue/normalize.ts lib/disciplines.ts lib/misses/scoring.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .coach-report-leirdue-test-build --skipLibCheck', { stdio: 'inherit' });
const { buildCoachReportEvidence, buildLeirdueFieldContext, classifyCompetitionLevel, normalizeDisciplineGroup } = await import('../.coach-report-leirdue-test-build/analysis/coachReportEvidence.js');
const { fetchCoachReportLeirdueContext, mapParsedCacheLeirdueRow, leirdueIdsFromUrl, normalizeLeirdueUrl } = await import('../.coach-report-leirdue-test-build/analysis/coachReportLeirdueContext.js');
assert.equal(classifyCompetitionLevel({ title: 'NM Leirduesti' }).level, 'National');
assert.equal(classifyCompetitionLevel({ title: 'Norges Cup Sporting' }).level, 'National');
assert.equal(classifyCompetitionLevel({ title: 'Regionmesterskap Vest' }).level, 'Regional');
assert.equal(classifyCompetitionLevel({ title: 'RM Kismul' }).level, 'Regional');
assert.equal(classifyCompetitionLevel({ title: 'Local club cup', fieldSize: 12 }).level, 'Local');
assert.equal(classifyCompetitionLevel({ title: '' }).level, 'Unknown');

assert.equal(normalizeLeirdueUrl('http://www.leirdue.net/results?liste_id=7&stevne=42'), normalizeLeirdueUrl('https://leirdue.net/results?stevne=42&liste_id=7'), 'Leirdue URL normalization handles protocol, www, and query order');
assert.deepEqual(leirdueIdsFromUrl('https://leirdue.net/resultater?stevne=42&liste_id=7'), { event_id: '42', liste_id: '7' }, 'event_id and liste_id are parsed from Leirdue URL');
assert.deepEqual(mapParsedCacheLeirdueRow({ shooter_name_normalized: 'ola-nordmann', shooter_name_display: 'Ola Nordmann', own_score: 90, is_importable: true }), { event_id: null, liste_id: null, normalized_name: 'ola-nordmann', original_name: 'Ola Nordmann', club: null, placement: null, own_score: 90, total_targets: null, winning_score: null, discipline: null, event_date: null, event_title: null, organizer: null, source_url: null, is_importable: true }, 'production parsed-cache shooter columns are mapped');

const session = { id: 'c1', name: 'NM Leirduesti', discipline: 'Leirduesti', session_type: 'Competition', own_score: 82, total_targets: 100, competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'https://leirdue.net/event/1' };
const rows = [95,90,88,82,82,70,60,55,50,45].map((score, index) => ({ event_id: 'e1', liste_id: 'l1', original_name: `Shooter ${index}`, normalized_name: index < 3 ? `known-${index}` : `shooter-${index}`, placement: index + 1, score, winning_score: 95, total_targets: 100, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'NM Leirduesti', organizer: 'Oslo', source_url: 'https://leirdue.net/event/1', validation_status: 'valid' }));
const duplicateRows = rows.flatMap((row) => [row, { ...row }]);
const context = buildLeirdueFieldContext(session, duplicateRows, [...duplicateRows, { ...rows[0], event_id: 'e2', event_title: 'Another Leirduesti' }, { ...rows[0], event_id: 'e2', event_title: 'Another Leirduesti' }, { ...rows[0], event_id: 'e3', discipline: 'Compak Sporting', event_title: 'Compak event' }]);
assert.equal(context.fieldSize, 10, 'duplicate rows do not inflate field size');
assert.equal(context.winningScore, 95, 'winning score is used');
assert.equal(context.medianScore, 76, 'duplicate rows do not inflate median context');
assert.equal(context.top25Score, 88, 'duplicate rows do not inflate top group context');
assert.equal(context.placement, 4, 'tied scores use approximate placement from score distribution');
assert.equal(context.placementRange, '4-5 approximate', 'tied scores label approximate placement range');
assert(context.percentile > 60, 'percentile is calculated');
const known0 = context.recurringShooters.find((shooter) => shooter.name === 'known-0');
assert(known0, 'recurring same-event shooters are detected');
assert.equal(known0.eventCount, 2, 'recurring shooters require two selected matched events and duplicate rows do not inflate counts');
assert.equal(known0.averageHitRate, 95, '45/50 and 180/200-style normalization uses hit-rate percentages instead of raw score averages');
assert(!('averageScore' in known0), 'raw scores with different total targets are not averaged');
assert.match(known0.comparisonNote, /Approximate/, 'uncertain identity does not produce confident head-to-head claims');
const normalizedContext = buildLeirdueFieldContext({ ...session, own_score: 45, total_targets: 50 }, [
  { event_id: 'n1', liste_id: 'l', normalized_name: 'repeat', original_name: 'Repeat', placement: 2, score: 45, total_targets: 50, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'NM Leirduesti', source_url: 'n1', validation_status: 'valid' },
  { event_id: 'n2', liste_id: 'l', normalized_name: 'repeat', original_name: 'Repeat', placement: 2, score: 180, total_targets: 200, discipline: 'Leirduesti', event_date: '2026-07-02', event_title: 'NM Leirduesti', source_url: 'n2', validation_status: 'valid' },
]);
assert.equal(normalizedContext.recurringShooters.find((shooter) => shooter.name === 'repeat').averageHitRate, 90, '45/50 and 180/200 are treated as equal 90% performances');
const userExcludedContext = buildLeirdueFieldContext({ ...session, user_normalized_name: 'repeat', own_score: 45, total_targets: 50 }, [
  { event_id: 'n1', liste_id: 'l', normalized_name: 'repeat', original_name: 'Repeat', placement: 2, score: 45, total_targets: 50, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'NM Leirduesti', source_url: 'n1', validation_status: 'valid' },
  { event_id: 'n2', liste_id: 'l', normalized_name: 'repeat', original_name: 'Repeat', placement: 2, score: 180, total_targets: 200, discipline: 'Leirduesti', event_date: '2026-07-02', event_title: 'NM Leirduesti', source_url: 'n2', validation_status: 'valid' },
]);
assert(!userExcludedContext.recurringShooters.some((shooter) => shooter.name === 'repeat'), 'current user is excluded when identity is known');


assert(!context.recurringShooters.some((shooter) => shooter.eventCount > 2), 'recurring comparisons remain discipline-specific');
assert.match(context.resultStrength, /field level|field position|winning-score percentage/, 'field strength wording does not rely only on winner percentage');
const evidence = buildCoachReportEvidence({ sessions: [session, { id: 'c2', name: 'Compak club', discipline: 'Compak Sporting', session_type: 'Competition', own_score: 45, total_targets: 50, competition_date: '2026-07-02' }], leirdueRows: rows });
assert.deepEqual(evidence.disciplineGroups.map((group) => group.discipline).sort(), ['Compak Sporting','Leirduesti'], 'report evidence groups sessions by discipline');
assert.equal(normalizeDisciplineGroup('Kompakt leirduesti'), 'Compak Sporting', 'Compak normalization works');

function supabaseFixture(tables, fail = false) { return { from(table) { const state = { table, filters: {}, from: 0, to: 999 }; const query = { select() { return query; }, eq(key, value) { state.filters[key] = value; return query; }, range(from, to) { state.from = from; state.to = to; return query; }, then(resolve) { if (fail) return resolve({ data: null, error: new Error('boom') }); const filtered = (tables[table] || []).filter((row) => Object.entries(state.filters).every(([key, value]) => row[key] === value)); return resolve({ data: filtered.slice(state.from, state.to + 1), error: null }); } }; return query; } }; }
const manyRows = Array.from({ length: 1001 }, (_, index) => ({ event_id: 'paged', liste_id: 'main', normalized_name: `p${index}`, original_name: `Paged ${index}`, placement: index + 1, score: 100 - (index % 80), discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Paged Cup', organizer: 'Oslo', source_url: 'paged-url', validation_status: 'valid' }));
const unrelated = { event_id: 'unrelated', liste_id: 'main', normalized_name: 'noise', original_name: 'Noise', placement: 1, score: 999, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Wrong Title', organizer: 'Elsewhere', source_url: 'noise-url', validation_status: 'valid' };

const urlRows = [{ event_id: '42', liste_id: '7', normalized_name: 'a', original_name: 'A', placement: 1, score: 25, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'URL Cup', organizer: 'Oslo', source_url: 'https://leirdue.net/results?liste_id=7&stevne=42', validation_status: 'valid' }];
let urlFetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: urlRows, leirdue_parsed_result_cache: [] }), [{ id: 'url1', name: 'URL Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'http://www.leirdue.net/results?stevne=42&liste_id=7' }]);
assert.equal(urlFetched.rows.length, 1, 'http session URL matches an https cached source with different query-parameter order');
urlFetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: urlRows, leirdue_parsed_result_cache: [] }), [{ id: 'url2', name: 'URL Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'https://leirdue.net/event?stevne=42' }]);
assert.equal(urlFetched.rows.length, 1, 'canonical event URL falls back to parsed event_id when list URL exact match is absent');
urlFetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: urlRows, leirdue_parsed_result_cache: [] }), [{ id: 'url3', name: 'URL Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'https://leirdue.net/empty?stevne=42&liste_id=7' }]);
assert.equal(urlFetched.rows.length, 1, 'exact URL with zero rows falls back to event/list ids');

const invalidMixRows = [
  { event_id: 'valid-mix', liste_id: 'main', normalized_name: 'valid', original_name: 'Valid', placement: 1, score: 25, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Valid Mix', organizer: 'Oslo', source_url: 'valid-mix', validation_status: 'valid' },
  { event_id: 'valid-mix', liste_id: 'main', normalized_name: 'invalid', original_name: 'Invalid', placement: 1, score: 999, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Valid Mix', organizer: 'Oslo', source_url: 'valid-mix', validation_status: 'invalid' },
];
const parsedMixRows = [
  { event_id: 'parsed-mix', liste_id: 'main', shooter_name_normalized: 'importable', shooter_name_display: 'Importable', placement: 1, own_score: 24, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Parsed Mix', organizer: 'Oslo', source_url: 'parsed-mix', is_importable: true },
  { event_id: 'parsed-mix', liste_id: 'main', shooter_name_normalized: 'blocked', shooter_name_display: 'Blocked', placement: 1, own_score: 999, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Parsed Mix', organizer: 'Oslo', source_url: 'parsed-mix', is_importable: false },
];
let filtered = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: invalidMixRows, leirdue_parsed_result_cache: parsedMixRows }), [{ id: 'valid-shared', name: 'Valid Mix', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'valid-mix' }, { id: 'valid-parsed', name: 'Parsed Mix', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'parsed-mix' }]);
assert.equal(filtered.rows.length, 2, 'invalid shared and non-importable parsed rows are filtered before field statistics');
assert(!filtered.rows.some((row) => (row.score ?? row.own_score) === 999), 'unreliable rows do not affect field statistics');

const pageOneWithInvalid = Array.from({ length: 1000 }, (_, index) => ({ event_id: 'paged-filter', liste_id: 'main', normalized_name: `pf${index}`, original_name: `Paged Filter ${index}`, placement: index + 1, score: 50, total_targets: 50, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Paged Filter Cup', organizer: 'Oslo', source_url: 'paged-filter', validation_status: index === 0 ? 'invalid' : 'valid' }));
const pageTwoValid = [{ event_id: 'paged-filter', liste_id: 'main', normalized_name: 'pf1000', original_name: 'Paged Filter 1000', placement: 1001, score: 49, total_targets: 50, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Paged Filter Cup', organizer: 'Oslo', source_url: 'paged-filter', validation_status: 'valid' }];
let pagedFiltered = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: [...pageOneWithInvalid, ...pageTwoValid], leirdue_parsed_result_cache: [] }), [{ id: 'paged-filter', name: 'Paged Filter Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo' }]);
assert.equal(pagedFiltered.rows.length, 1000, 'pagination continues after a full raw page even when one row is filtered out');
assert(pagedFiltered.rows.some((row) => row.normalized_name === 'pf1000'), 'valid rows on page 2 are still fetched after page 1 filtering');
let fetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: [...manyRows, unrelated], leirdue_parsed_result_cache: [] }), [{ id: 's1', name: 'Paged Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo' }]);
assert.equal(fetched.status, 'available', 'matched Leirdue context is available');
assert.equal(fetched.rows.length, 1001, 'pagination retrieves the complete matched event field');
assert(!fetched.rows.some((row) => row.event_id === 'unrelated'), 'unrelated events do not affect field statistics');

fetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: [
  { event_id: 'amb1', liste_id: 'a', normalized_name: 'a', original_name: 'A', placement: 1, score: 25, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Same Cup', organizer: 'Same Ground', source_url: 'amb1', validation_status: 'valid' },
  { event_id: 'amb2', liste_id: 'b', normalized_name: 'b', original_name: 'B', placement: 1, score: 25, total_targets: 25, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Same Cup', organizer: 'Same Ground', source_url: 'amb2', validation_status: 'valid' },
], leirdue_parsed_result_cache: [] }), [{ id: 'ambiguous', name: 'Same Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Same Ground' }]);
assert.equal(fetched.status, 'unavailable', 'ambiguous fallback returns controlled unavailable status');
assert.match(fetched.errors.join(' '), /Ambiguous Leirdue match/, 'ambiguous fallback explains that multiple event/list combinations matched');
fetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: [], leirdue_parsed_result_cache: [] }, true), [session]);
assert.equal(fetched.status, 'unavailable', 'query failures return controlled unavailable state');
assert(fetched.errors.length > 0, 'query failure includes controlled error text');
const separateEvents = buildLeirdueFieldContext({ ...session, name: 'Event', own_score: 90 }, [{ event_id: null, liste_id: null, normalized_name: 'same', placement: 1, score: 90, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Event A', source_url: 'event-a', validation_status: 'valid' }, { event_id: null, liste_id: null, normalized_name: 'same', placement: 1, score: 90, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Event B', source_url: 'event-b', validation_status: 'valid' }]);
assert.equal(separateEvents.fieldSize, 2, 'separate events are not collapsed by deduplication fallback');
console.log('coach report Leirdue context focused tests passed');
