import type { AnalysisMiss, PrivateSessionAnalysisNote } from "./deterministicSessionAnalysis";
import { scoreFromMisses, totalMisses } from "../misses/scoring";

export type CoachReportPeriodSession = {
  id: string;
  name?: string | null;
  discipline?: string | null;
  session_type?: string | null;
  own_score?: number | null;
  total_targets?: number | null;
  created_at?: string | null;
  competition_date?: string | null;
  location?: string | null;
  shooting_ground?: string | null;
};

export type CoachReportPeriodInput = {
  fromDate: string;
  toDate: string;
  sessions: CoachReportPeriodSession[];
  missesBySession?: Record<string, AnalysisMiss[]>;
  privateNotesBySession?: Record<string, PrivateSessionAnalysisNote[]>;
  includeNotesContext?: boolean;
};

function clean(value: unknown) { return String(value ?? "").trim(); }
function typeOf(session: CoachReportPeriodSession) { return String(session.session_type || "").toLowerCase() === "competition" ? "Competition" : "Training"; }
function dateOf(session: CoachReportPeriodSession) { return String(session.competition_date || session.created_at || "").slice(0, 10); }
function scoreFor(session: CoachReportPeriodSession, misses: AnalysisMiss[]) {
  const total = typeof session.total_targets === "number" ? session.total_targets : null;
  const score = typeof session.own_score === "number" ? session.own_score : total !== null ? scoreFromMisses(total, totalMisses(misses)) : null;
  return { score, total, pct: typeof score === "number" && total ? (score / total) * 100 : null };
}
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function fmtPct(value: number) { return `${value.toFixed(1).replace(/\.0$/, "")}%`; }
function periodDays(fromDate: string, toDate: string) { const from = Date.parse(`${fromDate}T00:00:00`); const to = Date.parse(`${toDate}T00:00:00`); return Number.isFinite(from) && Number.isFinite(to) ? Math.max(1, Math.round((to - from) / 86400000) + 1) : 0; }
function summarizeNotes(notes: PrivateSessionAnalysisNote[]) {
  const text = notes.map((note) => clean(note.body).toLowerCase()).join(" ");
  const themes = [
    [/tired|fatigue|energy|exhaust/i, "Energy or fatigue was mentioned in private notes."],
    [/rush|rushed|fast|hurry/i, "Rushing or tempo control was mentioned in private notes."],
    [/focus|concentrat|mental/i, "Focus or concentration was mentioned in private notes."],
    [/wind|weather|rain|light/i, "Weather or visibility was mentioned in private notes."],
    [/hold|gun|mount|feet|stance/i, "Setup, hold point, stance, or gun movement was mentioned in private notes."],
  ].filter(([pattern]) => (pattern as RegExp).test(text)).map(([, label]) => String(label));
  return themes.length ? themes : notes.length ? ["Private notes were present, but no repeated theme was strong enough to name." ] : [];
}

export function buildPeriodCoachReport(input: CoachReportPeriodInput) {
  const sessions = [...input.sessions].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const missesBySession = input.missesBySession || {};
  const privateNotesBySession = input.privateNotesBySession || {};
  const training = sessions.filter((session) => typeOf(session) === "Training");
  const competition = sessions.filter((session) => typeOf(session) === "Competition");
  const scored = sessions.map((session) => ({ session, ...scoreFor(session, missesBySession[session.id] || []) })).filter((item): item is ReturnType<typeof scoreFor> & { session: CoachReportPeriodSession; score: number; total: number; pct: number } => typeof item.score === "number" && typeof item.total === "number" && typeof item.pct === "number");
  const avgPct = average(scored.map((item) => item.pct));
  const avgScore = average(scored.map((item) => item.score));
  const best = scored.length ? [...scored].sort((a, b) => b.pct - a.pct)[0] : null;
  const weakest = scored.length ? [...scored].sort((a, b) => a.pct - b.pct)[0] : null;
  const allMisses = sessions.flatMap((session) => missesBySession[session.id] || []);
  const missReasons = new Map<string, number>();
  for (const miss of allMisses) {
    const reason = clean(miss.main_reason || miss.where_miss || miss.missed_target);
    if (reason && !/^unknown$/i.test(reason)) missReasons.set(reason, (missReasons.get(reason) || 0) + 1);
  }
  const repeated = [...missReasons.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const notes = sessions.flatMap((session) => privateNotesBySession[session.id] || []).filter((note) => clean(note.body));
  const noteThemes = input.includeNotesContext ? summarizeNotes(notes) : [];
  const sections = [
    { title: "Report period", items: [`${input.fromDate} to ${input.toDate}`, `${periodDays(input.fromDate, input.toDate)} day period.`] },
    { title: "Included sessions count", items: [`${sessions.length} selected sessions: ${training.length} training and ${competition.length} competition.`] },
    { title: "Training summary", items: training.length ? training.map((s) => `${dateOf(s)} — ${clean(s.name) || "Untitled training"} (${clean(s.discipline) || "Discipline not recorded"})${scoreFor(s, missesBySession[s.id] || []).score !== null ? `, score ${scoreFor(s, missesBySession[s.id] || []).score}/${scoreFor(s, missesBySession[s.id] || []).total ?? "?"}` : ""}.`) : ["No training sessions selected for this period."] },
    { title: "Competition summary", items: competition.length ? competition.map((s) => `${dateOf(s)} — ${clean(s.name) || "Untitled competition"} (${clean(s.discipline) || "Discipline not recorded"})${scoreFor(s, missesBySession[s.id] || []).score !== null ? `, score ${scoreFor(s, missesBySession[s.id] || []).score}/${scoreFor(s, missesBySession[s.id] || []).total ?? "?"}` : ""}.`) : ["No competition sessions selected for this period."] },
    { title: "Score trend / average score", items: scored.length ? [`Average score: ${avgScore?.toFixed(1).replace(/\.0$/, "")}.`, avgPct !== null ? `Average hit rate: ${fmtPct(avgPct)}.` : "Average hit rate could not be calculated.", scored.length > 1 ? `Newest selected scored session is ${fmtPct(scored[0].pct)}; oldest selected scored session is ${fmtPct(scored[scored.length - 1].pct)}.` : "Only one scored session is selected, so trend is limited."] : ["Score trend is unavailable because selected sessions do not have enough score and total target data."] },
    { title: "Best score / weakest score", items: best && weakest ? [`Best: ${clean(best.session.name) || best.session.id} at ${best.score}/${best.total} (${fmtPct(best.pct)}).`, `Weakest: ${clean(weakest.session.name) || weakest.session.id} at ${weakest.score}/${weakest.total} (${fmtPct(weakest.pct)}).`] : ["Best and weakest scores need scored selected sessions."] },
    { title: "Repeated miss patterns", items: repeated.length ? repeated.map(([label, count]) => `${label}: ${count} repeated misses.`) : ["No repeated miss pattern was strong enough from the selected sessions."] },
    ...(input.includeNotesContext && notes.length ? [{ title: "Notes-based context summary", items: [...noteThemes, "Only summarized note themes are included. Raw private notes are not shown."] }] : []),
    { title: "Training priorities", items: repeated.length ? repeated.map(([label]) => `Use the next training block to isolate ${label.toLowerCase()} misses with deliberate targets and a short written checkpoint after each stand.`) : ["Keep collecting score, miss reason, and target detail data so priorities can become more specific."] },
    { title: "Missing data / confidence notes", items: [scored.length === sessions.length ? "All selected sessions have score and total target data." : `${sessions.length - scored.length} selected sessions are missing score or total target data.`, allMisses.length ? `${allMisses.length} miss rows were available across selected sessions.` : "No detailed miss rows were available across selected sessions.", input.includeNotesContext ? "Notes context was included only as summarized themes." : "Notes context was not included."] },
    { title: "Disclaimer", items: ["This is a training-support summary, not a replacement for a coach watching you shoot."] },
  ];
  const plainText = sections.map((section) => `${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`).join("\n\n");
  return { sections, plainText, hasNotesContext: input.includeNotesContext === true && notes.length > 0, trainingCount: training.length, competitionCount: competition.length, selectedSessionCount: sessions.length, periodDays: periodDays(input.fromDate, input.toDate) };
}
