import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/stats/page.tsx', 'utf8');

assert.match(source, /statsCompetitionActivityCard compactCompetitionActivityCard/, 'Competition activity is restored on Performance in compact form');
assert.match(source, /buildCompetitionActivitySummary/, 'Performance reuses the canonical Competition activity helper');
assert.equal(source.includes('calculateCompetitionActivity'), false, 'Performance does not keep a duplicate weaker Competition activity implementation');
assert.equal(source.includes('Recent training logs'), false, 'Training history list is not rendered on Performance');
assert.equal(source.includes('Scored results'), false, 'Full Scored results list is not rendered on Performance');
assert.equal(source.includes('Latest filtered results'), false, 'Recent filtered results are not rendered as full session cards');
assert.match(source, /Based on \{performanceSummary\.count\} result/, 'Results count is supporting text');
assert.equal(source.includes('<span>Results counted</span>'), false, 'Results count is not a full summary metric');
assert.match(source, /className="winnerContextLine"/, 'Winner context uses a compact line');
assert.equal(source.includes('Average gap to winner'), false, 'Winner context does not use nested metric cards');
assert.match(source, /selectedType !== "training" && byShootingGround\.length >= 2/, 'Shooting ground section is omitted for training and insufficient ground data');
assert.equal(source.includes('Not enough filtered competition shooting ground data yet'), false, 'Insufficient ground data does not render a large empty card');
assert.match(source, /selectedType === "training" \|\| selectedType === "all"/, 'Training volume is shown for Training and as a separate All section');
assert.match(source, /selectedDiscipline \? volumeLogs\.filter\(\(log\) => log\.discipline === selectedDiscipline\) : volumeLogs/, 'Training volume respects selected discipline');
assert.equal(source.includes('Days since last training'), false, 'Simplified training volume omits days-since metric cards');
assert.match(source, /href="\/results" className="subtleLink">View all results →/, 'View all results links to /results');
assert.match(source, /Competition and Training are kept separate/, 'All view explains incompatible metrics');
assert.match(source, /recentFormSplit/, 'Recent form is split into compact semantic groups');
assert.match(source, /selectedType === "all" && competitionOnlyResults\.length > 0 && trainingOnlyResults\.length > 0/, 'All recent form separates Competition and Training');
assert.match(source, /calculateDisciplineBreakdown\(filteredPerformanceResults\)/, 'Discipline breakdown derives from currently filtered Performance data');
assert.match(source, /<summary>By discipline<\/summary>/, 'Discipline breakdown is collapsed by default');
assert.match(source, /<summary>Data coverage<\/summary>/, 'Data coverage deep dive is collapsed by default');
assert.equal(source.includes('rowsForSummary = known.length >= 2 || known.length >= unknown.length ? known : scored'), false, 'Unknown shooting grounds cannot contaminate named-ground summaries');
assert.match(source, /volumeScoreSheetsResult\.data \|\| \[\]\)\.map\(scoreSheetToVolumeLog\)/, 'Training Score Sheet target volume contributes to Training volume');
assert.match(source, /trainingResultsWithHits: selectedType === "competition" \? null/, 'Data coverage hides Training-specific coverage in Competition-only view');
assert.match(source, /scoredCompetitionResults: selectedType === "training" \? null/, 'Data coverage hides Competition-specific coverage in Training-only view');
assert.equal(source.includes('groundSessionList">\n            {selectedGround.sessions.map'), false, 'Ground drilldown does not restore unlimited inline history');

console.log('stats page presentation tests passed');
