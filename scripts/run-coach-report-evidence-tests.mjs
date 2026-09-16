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
const privateNotesBySession = {
  c1: [{ id: 'n1', updated_at: '2026-07-10T10:00:00Z', note_scope: 'session', body: 'RAW PRIVATE NOTE tired wind focus gun pressure', context_tags: ['tired', 'rabbit'] }],
  c2: [{ id: 'n2', updated_at: '2026-07-12T10:00:00Z', note_scope: 'session', body: 'different secret', context_tags: ['tired'] }],
  t1: [{ id: 'n3', updated_at: '2026-07-01T10:00:00Z', note_scope: 'session', body: 'training secret', context_tags: ['tired', 'good_focus'] }],
};
const acceptedEvidenceBySession = {
  c1: [
    { category: 'physical_state', normalized_value: 'fatigue', label: 'fatigue late in the round', evidence_basis: 'self_report', confidence: 'high', source_note_id: 'n1', source_note_updated_at: '2026-07-10T10:00:00Z', review_status: 'accepted' },
    { category: 'possible_issue', normalized_value: 'timing', label: 'timing may need testing', evidence_basis: 'ai_inference', confidence: 'medium', source_note_id: 'n1', source_note_updated_at: '2026-07-10T10:00:00Z', review_status: 'accepted' },
    { category: 'mental_state', normalized_value: 'focus', label: 'focus', evidence_basis: 'self_report', confidence: 'high', source_note_id: 'n1', source_note_updated_at: 'stale', review_status: 'accepted' },
    { category: 'conditions', normalized_value: 'wind', label: 'wind', evidence_basis: 'self_report', confidence: 'high', source_note_id: 'n1', source_note_updated_at: '2026-07-10T10:00:00Z', review_status: 'pending' },
  ],
  c2: [
    { category: 'physical_state', normalized_value: ' FATIGUE ', label: 'fatigue late in the round', evidence_basis: 'self_report', confidence: 'high', source_note_id: 'n2', source_note_updated_at: '2026-07-12T10:00:00Z', review_status: 'accepted' },
    { category: 'physical_state', normalized_value: 'fatigue', label: 'duplicate fatigue', evidence_basis: 'self_report', confidence: 'high', source_note_id: 'n2', source_note_updated_at: '2026-07-12T10:00:00Z', review_status: 'accepted' },
    { category: 'possible_issue', normalized_value: 'timing', label: 'timing may need testing', evidence_basis: 'ai_inference', confidence: 'medium', source_note_id: 'n2', source_note_updated_at: '2026-07-12T10:00:00Z', review_status: 'accepted' },
  ],
  t1: [{ category: 'physical_state', normalized_value: 'fatigue', label: 'fatigue late in the round', evidence_basis: 'ai_inference', confidence: 'medium', source_note_id: 'n3', source_note_updated_at: '2026-07-01T10:00:00Z', review_status: 'rejected' }],
};
const scorecardImportsBySession = { c1: { reviewed_total_targets: 50, reviewed_hits: 38, reviewed_misses: 12 } };
let evidence = buildCoachReportEvidence({ sessions, missesBySession, scorecardImportsBySession, privateNotesBySession, acceptedEvidenceBySession, includeNotesContext: true });
assert.equal(evidence.trainingSessions.length, 2, 'sessions are grouped into training');
assert.equal(evidence.competitionSessions.length, 2, 'sessions are grouped into competition');
assert.equal(evidence.sessionsWithScorecardImportEvidence.length, 1, 'scorecard import evidence is counted');
assert.equal(evidence.sessionsWithOnlyResultScore.length, 1, 'only final score sessions are separated');
assert(evidence.sessionsWithDetailedMissRows.length >= 3, 'detailed miss sessions are counted');
assert.equal(evidence.startMiddleEndMissDistribution.early, 3, 'early misses are counted');
assert.equal(evidence.startMiddleEndMissDistribution.late, 5, 'late misses are counted');
assert.match(evidence.startMiddleEndMissDistribution.interpretation, /assigning a cause|assuming a cause|no clear/i, 'start/finish interpretation is cautious');
assert.equal(evidence.preparationBeforeCompetition.competitionsWithTrainingCount, 2, '14-day lookback finds prior training');
assert.equal(evidence.trainingVsCompetition.gapPercentagePoints?.toFixed(1), '-8.0', 'training vs competition gap is calculated');
const broad = evidence.repeatedMissCategories.find((item) => item.label === 'Technical');
assert.match(`${broad?.likelyMeaning} ${broad?.testNext}`, /too broad.*line, lead, hold point, movement timing, visual pickup/i, 'broad categories produce too-broad guidance');
const detailed = evidence.repeatedMissCategories.find((item) => item.label === 'Behind');
assert.match(`${detailed?.likelyMeaning} ${detailed?.testNext}`, /late pickup|too little lead|stopping the gun/i, 'detailed reasons produce specific test guidance');
assert.deepEqual(evidence.selfReportedContext.map((item) => [item.tag, item.sessionCount]), [['tired', 3], ['good_focus', 1], ['rabbit', 1]], 'explicit tags remain self-reported context with distinct-session counts');
const tiredContext = evidence.selfReportedContext.find((item) => item.tag === 'tired');
assert.deepEqual([tiredContext.trainingCount, tiredContext.competitionCount], [1, 2], 'mixed-source tags preserve training and competition counts');
assert.deepEqual(evidence.selfReportedContext.find((item) => item.tag === 'good_focus').sourceSessions.map((source) => [source.id, source.type]), [['t1', 'Training']], 'training-only tags preserve source-session provenance');
assert(!('notesThemes' in evidence), 'raw note bodies cannot create semantic themes');
assert.equal(evidence.reviewedReflectionEvidence.length, 5, 'only current accepted evidence is used');
assert(!evidence.reviewedReflectionEvidence.some((item) => item.normalized_value === 'focus' || item.normalized_value === 'wind'), 'pending and stale evidence are excluded');
const recurringSelfReport = evidence.recurringReviewedEvidence.find((item) => item.evidence_basis === 'self_report');
assert.equal(recurringSelfReport.sessionCount, 2, 'duplicate rows count as one session occurrence');
assert.match(recurringSelfReport.summary, /You reported.*2 of 4 selected sessions.*2 competitions, 0 training/, 'recurring self-report is qualified and preserves provenance');
const recurringHypothesis = evidence.recurringReviewedEvidence.find((item) => item.evidence_basis === 'ai_inference');
assert.match(recurringHypothesis.summary, /reviewed AI hypothesis.*2 of 4.*not a proven cause/, 'recurring AI evidence stays hypothetical');
assert.notEqual(recurringSelfReport.evidence_basis, recurringHypothesis.evidence_basis, 'self-report and AI inference stay separate');
assert(evidence.confidence.reasons.some((reason) => /sessions.*score data|target positions/.test(reason)), 'confidence exposes deterministic reasons');
assert(evidence.suggestedCoachQuestions.length >= 1 && evidence.suggestedCoachQuestions.length <= 3, 'coach questions are limited to 1–3');
assert(!evidence.suggestedCoachQuestions.some((question) => /caused|because|proves/i.test(question)), 'coach questions are non-causal');
const report = buildPeriodCoachReport({ fromDate: '2026-06-01', toDate: '2026-07-13', sessions, missesBySession, scorecardImportsBySession, privateNotesBySession, acceptedEvidenceBySession, includeNotesContext: true });
for (const title of ['Coach takeaway', 'Likely performance problem', 'Evidence from your data', 'Training vs competition', 'Start / finish pattern', 'Preparation before competition', 'What to test next', 'Training plan for next 1–2 weeks', 'Data quality and what to log next']) assert(report.sections.some((section) => section.title === title), `report includes ${title}`);
assert.match(report.plainText, /You marked Rabbit in 1 selected session \(0 training, 1 competition\).*self-reported context, not a proven cause/, 'saved tags are reported with qualified source provenance');
assert.match(report.plainText, /You marked Tired in 3 selected sessions \(1 training, 2 competition\)/, 'mixed-source tag wording names both session types');
assert(!report.plainText.includes('RAW PRIVATE NOTE'), 'raw private notes are never shown');
assert(!JSON.stringify(report.aiEvidencePacket).includes('RAW PRIVATE NOTE'), 'AI packet excludes private note text');
assert.deepEqual(report.aiEvidencePacket.evidenceLevels.currentAcceptedReflectionEvidence.map((item) => item.basis).sort(), ['ai_inference','ai_inference','self_report','self_report','self_report'], 'AI packet preserves evidence basis');
assert.equal(report.aiEvidencePacket.preparationBeforeCompetition.competitionsWithTrainingCount, 2, 'AI packet preserves the sanitized preparation signal');
assert(!('details' in report.aiEvidencePacket.preparationBeforeCompetition), 'AI preparation packet excludes internal nested session objects');
const recurringPacket = JSON.stringify(report.aiEvidencePacket.recurringReviewedEvidence);
assert(!recurringPacket.includes('source_note_id') && !recurringPacket.includes('source_note_updated_at'), 'recurring AI evidence excludes internal note provenance');
assert(report.aiEvidencePacket.recurringReviewedEvidence.every((item) => item.sourceSessions.every((source) => source.id && source.type)), 'recurring AI evidence retains source-session provenance');
assert(report.sections.some((section) => section.title === 'Confidence and uncertainty'), 'confidence is visible');
assert(report.sections.some((section) => section.title === 'Questions for your coach'), 'coach questions are visible');
assert.match(report.plainText, /Evidence-based coach report/, 'report does not call itself AI');
evidence = buildCoachReportEvidence({ sessions: [sessions[3]], missesBySession: {}, scorecardImportsBySession: {}, privateNotesBySession: {}, includeNotesContext: false });
assert.match(evidence.startMiddleEndMissDistribution.interpretation, /cannot be trusted yet/i, 'insufficient detail produces limitation warning');
assert.equal(evidence.confidence.level, 'Limited', 'confidence degrades for one final-score-only session');
const reasonOnlySessions = sessions.slice(0, 2).map((session, index) => ({ ...session, id: `reason-${index}` }));
const reasonOnlyEvidence = buildCoachReportEvidence({ sessions: reasonOnlySessions, missesBySession: { 'reason-0': [{ main_reason: 'Behind' }], 'reason-1': [{ where_miss: 'Low' }] }, privateNotesBySession: { 'reason-0': [{ id: 'r0', updated_at: '2026-07-01', context_tags: ['tired'] }], 'reason-1': [{ id: 'r1', updated_at: '2026-07-10', context_tags: ['tired'] }] }, includeNotesContext: true });
assert.equal(reasonOnlyEvidence.sessionsWithDetailedMissRows.length, 2, 'specific reasons remain detailed miss evidence');
assert.equal(reasonOnlyEvidence.sessionsWithUsableTargetPositions.length, 0, 'reason-only misses are not counted as mapped positions');
assert.equal(reasonOnlyEvidence.confidence.level, 'Medium', 'recurring self-report and detailed reasons without positions cannot produce Higher confidence');
assert(!reasonOnlyEvidence.confidence.reasons.some((reason) => /mapped target/.test(reason)), 'confidence does not describe reason-only misses as mapped positions');
console.log('coach report evidence focused tests passed');
