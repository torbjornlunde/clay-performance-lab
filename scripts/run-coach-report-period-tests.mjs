import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execSync('rm -rf .coach-report-period-test-build && npx tsc lib/analysis/coachReportPeriod.ts lib/analysis/deterministicSessionAnalysis.ts lib/leirdue/normalize.ts lib/disciplines.ts lib/misses/scoring.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .coach-report-period-test-build --skipLibCheck', { stdio: 'inherit' });
const { buildPeriodCoachReport } = await import('../.coach-report-period-test-build/analysis/coachReportPeriod.js');

const sessions = [
  { id: 't1', name: 'Training one', discipline: 'Sporting', session_type: 'Training', own_score: 20, total_targets: 25, competition_date: '2026-06-20', shooting_ground: 'Home club' },
  { id: 'c1', name: 'County final', discipline: 'Sporting', session_type: 'Competition', own_score: 42, total_targets: 50, competition_date: '2026-07-05', shooting_ground: 'North ground' },
  { id: 'old', name: 'Old session', discipline: 'Trap', session_type: 'Training', own_score: 10, total_targets: 25, competition_date: '2026-01-01' },
];
const selected = sessions.slice(0, 2);
const missesBySession = {
  t1: [{ session_id: 't1', course_number: 1, target_number: 1, main_reason: 'Behind' }, { session_id: 't1', course_number: 2, target_number: 2, main_reason: 'Behind' }],
  c1: [{ session_id: 'c1', course_number: 1, target_number: 1, main_reason: 'Low' }],
};
const privateNotesBySession = { t1: [{ note_scope: 'session', body: 'RAW SECRET NOTE I felt tired and rushed the second half.' }] };
let report = buildPeriodCoachReport({ fromDate: '2026-06-13', toDate: '2026-07-13', sessions: selected, missesBySession, privateNotesBySession, includeNotesContext: true });
assert(report.plainText.includes('Evidence-based coach report'), 'report labels evidence-based report');
assert(report.plainText.includes('Coach takeaway'), 'report includes coach takeaway');
assert(report.plainText.includes('Evidence from your data'), 'report includes data interpretation section');
assert(report.plainText.includes('What to test next'), 'report includes focus areas');
assert(report.plainText.includes('Training plan for next 1–2 weeks'), 'report includes training recommendations');
assert(report.plainText.includes('Data quality and what to log next'), 'report includes data quality section');
assert(report.plainText.includes('2 selected sessions from 2026-06-13 to 2026-07-13: 1 training and 1 competition'), 'report includes selected session count and period');
assert(report.plainText.includes('Training one') && report.plainText.includes('County final'), 'included sessions are summarized compactly');
assert(report.plainText.includes('average hit rate'), 'score/trend summary is included where possible');
assert(report.plainText.includes('Home club'), 'venue/ground display works using shooting_ground');
assert(report.plainText.includes('Best selected result'), 'best score summary is included');
assert(report.plainText.includes('Weakest selected result'), 'weakest score summary is included');
assert.match(report.plainText, /Behind: 2 misses.*late pickup|Behind.*2 misses/s, 'repeated miss patterns include count and useful explanation');
assert(report.sections.some((section) => section.title === 'Data quality and what to log next'), 'notes-based context is summarized in data quality section');
assert(!report.plainText.includes('RAW SECRET NOTE'), 'raw private note text is not included');
assert(!/[<>][a-z]/i.test(report.plainText), 'copied report is plain text, not HTML');
report = buildPeriodCoachReport({ fromDate: '2026-06-13', toDate: '2026-07-13', sessions: selected, missesBySession, privateNotesBySession, includeNotesContext: false });
assert(report.plainText.includes('Notes context is available only when the toggle is on'), 'notes-based context can be turned off');
assert(!report.plainText.includes('tired'), 'notes context is omitted when toggle is off');
assert(!report.plainText.includes('Old session'), 'report only includes selected sessions');

const page = readFileSync('app/coach-report/page.tsx', 'utf8');
for (const text of ['Coach report', 'From date', 'To date', 'Include notes-based context', 'Raw private notes are not shown', 'Update evidence preview', 'Evidence preview needs update', 'Generate AI coach report', 'Copy visible report', 'Copied', 'Copy only what is visible here.']) assert(page.includes(text), `/coach-report page includes ${text}`);
assert.doesNotMatch(page.match(/<section className="card coachReportHero">[\s\S]*?<\/section>/)?.[0] || '', /Copy visible report|Copy report/, 'copy button is not in top settings card');
assert.match(page.match(/<article className="card coachReportPreview"[\s\S]*?<\/article>/)?.[0] || '', /Copy visible report/, 'copy button is in report preview section');
assert.match(page, /previewNeedsUpdate/, 'date or session changes can mark preview stale');
assert.match(page, /from\("sessions"\)[\s\S]*\.eq\("user_id", authData\.user\.id\)/, 'sessions are queried for signed-in user');
assert.doesNotMatch(page, /select\("[^"]*location/, 'coach report period page does not select location from sessions');
assert.match(page, /shooting_ground/, 'coach report period page uses shooting_ground for venue/ground display');
assert.match(page, /date\.setMonth\(date\.getMonth\(\) - 1\)/, 'default date range is last 1 month');
assert.match(page, /inRange\(session, fromDate, toDate\)/, 'sessions inside range are shown and outside range filtered');
assert.match(page, /setSelectedIds\(new Set\(visible\)\)/, 'sessions are selected by default');
assert.match(page, /event\.target\.checked[\s\S]*next\.add\(session\.id\)[\s\S]*next\.delete\(session\.id\)/, 'user can select/deselect sessions');
assert.match(page, /navigator\.clipboard\.writeText\(aiReport\?\.reportText/, 'copy visible report button writes plain text');
assert.doesNotMatch(page, /plainText[\s\S]{0,120}metadata|body[\s\S]{0,120}metadata|privateNotes[\s\S]{0,120}metadata/, 'analytics does not include report body or note text');
assert.match(page, /coach_report_period_preview_opened/, 'period preview analytics event exists');
assert.match(page, /coach_report_copied/, 'period copied analytics event exists');
const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8');
assert.match(dashboard, /href="\/coach-report"[\s\S]*Coach report/, 'dashboard entry point exists');
const analytics = readFileSync('lib/analytics.ts', 'utf8');
for (const token of ['coach_report_period_preview_opened', 'coach_report_copied', 'selectedSessionCount', 'trainingCount', 'competitionCount', 'hasNotesContext', 'periodDays']) assert(analytics.includes(token), `${token} is allowlisted`);
const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /coachReportSessionCard[\s\S]*grid-template-columns:\s*auto 1fr/, 'session selection cards are mobile-friendly');
const vagueReport = buildPeriodCoachReport({ fromDate: '2026-06-13', toDate: '2026-07-13', sessions: selected, missesBySession: { t1: [{ session_id: 't1', course_number: 1, target_number: 1, main_reason: 'Technical' }, { session_id: 't1', course_number: 1, target_number: 2, main_reason: 'Technical' }] }, privateNotesBySession: {}, includeNotesContext: false });
assert.match(vagueReport.plainText, /too broad to be a true diagnosis/, 'vague miss categories produce a limitation warning');
const priorities = report.sections.find((section) => section.title === 'Training plan for next 1–2 weeks')?.items || [];
assert.equal(new Set(priorities).size, priorities.length, 'training priorities are not duplicate lines');
const priorityNumbers = priorities.map((item) => Number(item.match(/^(\d+)\./)?.[1])).filter(Number.isFinite);
assert.equal(new Set(priorityNumbers).size, priorityNumbers.length, 'training priorities do not duplicate priority numbers');
assert.deepEqual(priorityNumbers, priorities.map((_, index) => index + 1), 'training priorities do not skip priority numbers');
assert(priorities.some((item) => item.includes('Log each miss')), 'data-quality advice is still included in recommended training');
assert.match(report.plainText, /Data quality is (good|limited|weak)/i, 'missing data section explains confidence impact');
console.log('coach report period focused tests passed');
