import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync('rm -rf .coach-report-evidence-test-build && npx tsc lib/analysis/coachReportEvidence.ts lib/analysis/coachReportPeriod.ts lib/analysis/deterministicSessionAnalysis.ts lib/leirdue/normalize.ts lib/disciplines.ts lib/misses/scoring.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .coach-report-evidence-test-build --skipLibCheck', { stdio: 'inherit' });
const { buildCoachReportEvidence } = await import('../.coach-report-evidence-test-build/analysis/coachReportEvidence.js');
const { buildPeriodCoachReport } = await import('../.coach-report-evidence-test-build/analysis/coachReportPeriod.js');

const sessions = [
  { id: 't1', name: 'Prep training', session_type: 'Training', own_score: 23, total_targets: 25, competition_date: '2026-07-01', shooting_ground: 'Home' },
  { id: 'c1', name: 'Late fade cup', session_type: 'Competition', own_score: 38, total_targets: 50, competition_date: '2026-07-10', shooting_ground: 'Away' },
  { id: 'c2', name: 'Early wobble final', session_type: 'Competition', own_score: 40, total_targets: 50, competition_date: '2026-07-12' },
  { id: 't2', name: 'Score only', session_type: 'Training', own_score: 20, total_targets: 25, competition_date: '2026-06-01' },
];
const missesBySession = {
  t1: [{ course_number: 1, target_position: 21, target_number: 21, main_reason: 'Behind' }, { course_number: 1, target_position: 22, target_number: 22, main_reason: 'Technical' }],
  c1: [{ course_number: 1, target_position: 41, target_number: 41, main_reason: 'Behind' }, { course_number: 1, target_position: 45, target_number: 45, main_reason: 'Behind' }, { course_number: 1, target_position: 49, target_number: 49, main_reason: 'Technical' }],
  c2: [{ course_number: 1, target_position: 1, target_number: 1, main_reason: 'Low' }, { course_number: 1, target_position: 2, target_number: 2, main_reason: 'Low' }, { course_number: 1, target_position: 3, target_number: 3, main_reason: 'Low' }],
};
const privateNotesBySession = { c1: [{ note_scope: 'session', body: 'RAW PRIVATE NOTE wind and fatigue, rushed under pressure' }] };
const scorecardImportsBySession = { c1: { reviewed_total_targets: 50, reviewed_hits: 38, reviewed_misses: 12 } };
let evidence = buildCoachReportEvidence({ sessions, missesBySession, scorecardImportsBySession, privateNotesBySession, includeNotesContext: true });
assert.equal(evidence.trainingSessions.length, 2, 'sessions are grouped into training');
assert.equal(evidence.competitionSessions.length, 2, 'sessions are grouped into competition');
assert.equal(evidence.sessionsWithScorecardImportEvidence.length, 1, 'scorecard import evidence is counted');
assert.equal(evidence.sessionsWithOnlyResultScore.length, 1, 'only final score sessions are separated');
assert(evidence.sessionsWithDetailedMissRows.length >= 3, 'detailed miss sessions are counted');
assert.equal(evidence.startMiddleEndMissDistribution.early, 3, 'early misses are counted');
assert.equal(evidence.startMiddleEndMissDistribution.late, 5, 'late misses are counted');
assert.match(evidence.startMiddleEndMissDistribution.interpretation, /fatigue, reduced focus, or pressure|early misses before stabilizing|no clear/i, 'start/finish interpretation is cautious');
assert.equal(evidence.preparationBeforeCompetition.competitionsWithTrainingCount, 2, '14-day lookback finds prior training');
assert.equal(evidence.trainingVsCompetition.gapPercentagePoints?.toFixed(1), '-8.0', 'training vs competition gap is calculated');
const broad = evidence.repeatedMissCategories.find((item) => item.label === 'Technical');
assert.match(`${broad?.likelyMeaning} ${broad?.testNext}`, /too broad.*line, lead, hold point, movement timing, visual pickup/i, 'broad categories produce too-broad guidance');
const detailed = evidence.repeatedMissCategories.find((item) => item.label === 'Behind');
assert.match(`${detailed?.likelyMeaning} ${detailed?.testNext}`, /late pickup|too little lead|stopping the gun/i, 'detailed reasons produce specific test guidance');
assert(evidence.notesThemes.includes('wind') && evidence.notesThemes.includes('fatigue'), 'private notes are summarized into themes');
const report = buildPeriodCoachReport({ fromDate: '2026-06-01', toDate: '2026-07-13', sessions, missesBySession, scorecardImportsBySession, privateNotesBySession, includeNotesContext: true });
for (const title of ['Coach takeaway', 'Likely performance problem', 'Evidence from your data', 'Training vs competition', 'Start / finish pattern', 'Preparation before competition', 'What to test next', 'Training plan for next 1–2 weeks', 'Data quality and what to log next']) assert(report.sections.some((section) => section.title === title), `report includes ${title}`);
assert(!report.plainText.includes('RAW PRIVATE NOTE'), 'raw private notes are never shown');
assert.match(report.plainText, /Evidence-based coach report/, 'report does not call itself AI');
evidence = buildCoachReportEvidence({ sessions: [sessions[3]], missesBySession: {}, scorecardImportsBySession: {}, privateNotesBySession: {}, includeNotesContext: false });
assert.match(evidence.startMiddleEndMissDistribution.interpretation, /cannot be trusted yet/i, 'insufficient detail produces limitation warning');
console.log('coach report evidence focused tests passed');
