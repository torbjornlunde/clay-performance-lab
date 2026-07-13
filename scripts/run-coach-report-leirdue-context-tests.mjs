import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync('rm -rf .coach-report-leirdue-test-build && npx tsc lib/analysis/coachReportEvidence.ts lib/analysis/coachReportLeirdueContext.ts lib/analysis/deterministicSessionAnalysis.ts lib/leirdue/normalize.ts lib/disciplines.ts lib/misses/scoring.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .coach-report-leirdue-test-build --skipLibCheck', { stdio: 'inherit' });
const { buildCoachReportEvidence, buildLeirdueFieldContext, classifyCompetitionLevel, normalizeDisciplineGroup } = await import('../.coach-report-leirdue-test-build/analysis/coachReportEvidence.js');
const { fetchCoachReportLeirdueContext, mapParsedCacheLeirdueRow } = await import('../.coach-report-leirdue-test-build/analysis/coachReportLeirdueContext.js');
assert.equal(classifyCompetitionLevel({ title: 'NM Leirduesti' }).level, 'National');
assert.equal(classifyCompetitionLevel({ title: 'Norges Cup Sporting' }).level, 'National');
assert.equal(classifyCompetitionLevel({ title: 'Regionmesterskap Vest' }).level, 'Regional');
assert.equal(classifyCompetitionLevel({ title: 'RM Kismul' }).level, 'Regional');
assert.equal(classifyCompetitionLevel({ title: 'Local club cup', fieldSize: 12 }).level, 'Local');
assert.equal(classifyCompetitionLevel({ title: '' }).level, 'Unknown');
assert.deepEqual(mapParsedCacheLeirdueRow({ shooter_name_normalized: 'ola-nordmann', shooter_name_display: 'Ola Nordmann', own_score: 90 }), { event_id: null, liste_id: null, normalized_name: 'ola-nordmann', original_name: 'Ola Nordmann', club: null, placement: null, own_score: 90, total_targets: null, winning_score: null, discipline: null, event_date: null, event_title: null, organizer: null, source_url: null }, 'production parsed-cache shooter columns are mapped');

const session = { id: 'c1', name: 'NM Leirduesti', discipline: 'Leirduesti', session_type: 'Competition', own_score: 82, total_targets: 100, competition_date: '2026-07-01', shooting_ground: 'Oslo', leirdue_result_url: 'https://leirdue.net/event/1' };
const rows = [95,90,88,82,82,70,60,55,50,45].map((score, index) => ({ event_id: 'e1', liste_id: 'l1', original_name: `Shooter ${index}`, normalized_name: index < 3 ? `known-${index}` : `shooter-${index}`, placement: index + 1, score, winning_score: 95, total_targets: 100, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'NM Leirduesti', organizer: 'Oslo', source_url: 'https://leirdue.net/event/1' }));
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
assert(!context.recurringShooters.some((shooter) => shooter.eventCount > 2), 'recurring comparisons remain discipline-specific');
assert.match(context.resultStrength, /field level|field position|winning-score percentage/, 'field strength wording does not rely only on winner percentage');
const evidence = buildCoachReportEvidence({ sessions: [session, { id: 'c2', name: 'Compak club', discipline: 'Compak Sporting', session_type: 'Competition', own_score: 45, total_targets: 50, competition_date: '2026-07-02' }], leirdueRows: rows });
assert.deepEqual(evidence.disciplineGroups.map((group) => group.discipline).sort(), ['Compak Sporting','Leirduesti'], 'report evidence groups sessions by discipline');
assert.equal(normalizeDisciplineGroup('Kompakt leirduesti'), 'Compak Sporting', 'Compak normalization works');

function supabaseFixture(tables, fail = false) { return { from(table) { const state = { table, filters: {}, from: 0, to: 999 }; const query = { select() { return query; }, eq(key, value) { state.filters[key] = value; return query; }, range(from, to) { state.from = from; state.to = to; return query; }, then(resolve) { if (fail) return resolve({ data: null, error: new Error('boom') }); const filtered = (tables[table] || []).filter((row) => Object.entries(state.filters).every(([key, value]) => row[key] === value)); return resolve({ data: filtered.slice(state.from, state.to + 1), error: null }); } }; return query; } }; }
const manyRows = Array.from({ length: 1001 }, (_, index) => ({ event_id: 'paged', liste_id: 'main', normalized_name: `p${index}`, original_name: `Paged ${index}`, placement: index + 1, score: 100 - (index % 80), discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Paged Cup', organizer: 'Oslo', source_url: 'paged-url' }));
const unrelated = { event_id: 'unrelated', liste_id: 'main', normalized_name: 'noise', original_name: 'Noise', placement: 1, score: 999, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Wrong Title', organizer: 'Elsewhere', source_url: 'noise-url' };
let fetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: [...manyRows, unrelated], leirdue_parsed_result_cache: [] }), [{ id: 's1', name: 'Paged Cup', discipline: 'Leirduesti', competition_date: '2026-07-01', shooting_ground: 'Oslo' }]);
assert.equal(fetched.status, 'available', 'matched Leirdue context is available');
assert.equal(fetched.rows.length, 1001, 'pagination retrieves the complete matched event field');
assert(!fetched.rows.some((row) => row.event_id === 'unrelated'), 'unrelated events do not affect field statistics');
fetched = await fetchCoachReportLeirdueContext(supabaseFixture({ leirdue_shared_shooter_results: [], leirdue_parsed_result_cache: [] }, true), [session]);
assert.equal(fetched.status, 'unavailable', 'query failures return controlled unavailable state');
assert(fetched.errors.length > 0, 'query failure includes controlled error text');
const separateEvents = buildLeirdueFieldContext({ ...session, name: 'Event', own_score: 90 }, [{ event_id: null, liste_id: null, normalized_name: 'same', placement: 1, score: 90, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Event A', source_url: 'event-a' }, { event_id: null, liste_id: null, normalized_name: 'same', placement: 1, score: 90, discipline: 'Leirduesti', event_date: '2026-07-01', event_title: 'Event B', source_url: 'event-b' }]);
assert.equal(separateEvents.fieldSize, 2, 'separate events are not collapsed by deduplication fallback');
console.log('coach report Leirdue context focused tests passed');
