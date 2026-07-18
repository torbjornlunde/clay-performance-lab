export type PerformanceDataType = "competition" | "training" | "all";
export type PerformancePeriod = "30d" | "90d" | "season" | "12m" | "all";

export type PerformanceResult = {
  id: string;
  date: string;
  discipline: string | null;
  dataType: Exclude<PerformanceDataType, "all">;
  score: number;
  maxScore?: number | null;
  winningScore?: number | null;
};

export type PeriodBounds = { start: string | null; end: string | null };
export type TrendLabel = "Improving" | "Stable" | "Dropping" | "Not enough data yet";
export type DataConfidenceLabel = "Very low" | "Low" | "Moderate" | "Good" | "Strong";

export function isoDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function addMonths(date: Date, months: number) { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; }

export function getPeriodBounds(period: PerformancePeriod, today = new Date()): PeriodBounds {
  const end = isoDateValue(today);
  if (period === "all") return { start: null, end };
  if (period === "season") return { start: `${today.getFullYear()}-01-01`, end };
  if (period === "30d") return { start: isoDateValue(addDays(today, -29)), end };
  if (period === "90d") return { start: isoDateValue(addDays(today, -89)), end };
  return { start: isoDateValue(addMonths(today, -12)), end };
}

export function getPreviousPeriodBounds(period: PerformancePeriod, today = new Date()): PeriodBounds | null {
  if (period === "all") return null;
  const current = getPeriodBounds(period, today);
  if (!current.start || !current.end) return null;
  const currentStart = new Date(`${current.start}T00:00:00`);
  if (period === "season") {
    const dayOfYear = Math.round((new Date(`${current.end}T00:00:00`).getTime() - currentStart.getTime()) / 86_400_000);
    const previousStart = new Date(currentStart); previousStart.setFullYear(previousStart.getFullYear() - 1);
    return { start: isoDateValue(previousStart), end: isoDateValue(addDays(previousStart, dayOfYear)) };
  }
  if (period === "12m") return { start: isoDateValue(addMonths(currentStart, -12)), end: isoDateValue(addDays(currentStart, -1)) };
  const days = period === "30d" ? 30 : 90;
  return { start: isoDateValue(addDays(currentStart, -days)), end: isoDateValue(addDays(currentStart, -1)) };
}

function dateOnly(value: string) { return value.slice(0, 10); }

export function filterPerformanceResults(results: PerformanceResult[], filters: { discipline?: string; period: PerformancePeriod; type: PerformanceDataType; today?: Date }) {
  const bounds = getPeriodBounds(filters.period, filters.today || new Date());
  return results.filter((result) => {
    const date = dateOnly(result.date);
    if (filters.type !== "all" && result.dataType !== filters.type) return false;
    if (filters.discipline && result.discipline !== filters.discipline) return false;
    if (bounds.start && date < bounds.start) return false;
    if (bounds.end && date > bounds.end) return false;
    return true;
  });
}

export function averageScorePercentage(results: PerformanceResult[]) {
  const percentages = results.map((result) => {
    if (result.dataType === "competition" && typeof result.winningScore === "number" && result.winningScore > 0) return (result.score / result.winningScore) * 100;
    if (typeof result.maxScore === "number" && result.maxScore > 0) return (result.score / result.maxScore) * 100;
    return null;
  }).filter((value): value is number => value !== null && Number.isFinite(value));
  return percentages.length === 0 ? null : percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
}

export function calculateTrend(currentAverage: number | null, previousAverage: number | null, threshold = 1.5) {
  if (currentAverage === null || previousAverage === null) return { label: "Not enough data yet" as TrendLabel, difference: null };
  const difference = currentAverage - previousAverage;
  if (difference >= threshold) return { label: "Improving" as TrendLabel, difference };
  if (difference <= -threshold) return { label: "Dropping" as TrendLabel, difference };
  return { label: "Stable" as TrendLabel, difference };
}

export function calculateDataConfidence(count: number): DataConfidenceLabel {
  if (count <= 2) return "Very low";
  if (count <= 4) return "Low";
  if (count <= 9) return "Moderate";
  if (count <= 19) return "Good";
  return "Strong";
}

export function calculatePerformanceSummary(allResults: PerformanceResult[], filteredResults: PerformanceResult[], filters: { discipline?: string; period: PerformancePeriod; type: PerformanceDataType; today?: Date }) {
  const count = filteredResults.length;
  const currentAverage = averageScorePercentage(filteredResults);
  const best = filteredResults.reduce<number | null>((bestValue, result) => {
    const value = averageScorePercentage([result]);
    return value === null ? bestValue : bestValue === null ? value : Math.max(bestValue, value);
  }, null);
  if (filters.period === "all") {
    const sorted = filteredResults.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length >= 4) {
      const half = Math.floor(sorted.length / 2);
      const previousAverage = averageScorePercentage(sorted.slice(0, half));
      const latestAverage = averageScorePercentage(sorted.slice(half));
      return { recentAverage: latestAverage, best, count, confidence: calculateDataConfidence(count), trend: calculateTrend(latestAverage, previousAverage) };
    }
  }
  const previous = getPreviousPeriodBounds(filters.period, filters.today || new Date());
  const previousAverage = previous
    ? averageScorePercentage(allResults.filter((result) => {
      const date = dateOnly(result.date);
      if (filters.type !== "all" && result.dataType !== filters.type) return false;
      if (filters.discipline && result.discipline !== filters.discipline) return false;
      return date >= previous.start! && date <= previous.end!;
    }))
    : null;
  return { recentAverage: currentAverage, best, count, confidence: calculateDataConfidence(count), trend: calculateTrend(currentAverage, previousAverage) };
}

export function calculateWinnerContext(results: PerformanceResult[]) {
  const gaps = results.filter((result) => result.dataType === "competition" && typeof result.winningScore === "number" && result.winningScore > 0).map((result) => ({ date: result.date, gap: Math.max(0, (result.winningScore || 0) - result.score) })).sort((a, b) => a.date.localeCompare(b.date));
  if (gaps.length < 2) return { count: gaps.length, averageGap: null, bestGap: null, latestGap: null };
  return { count: gaps.length, averageGap: gaps.reduce((sum, item) => sum + item.gap, 0) / gaps.length, bestGap: Math.min(...gaps.map((item) => item.gap)), latestGap: gaps[gaps.length - 1].gap };
}
