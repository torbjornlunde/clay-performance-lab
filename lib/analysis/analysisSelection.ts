export function localAnalysisDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function analysisMonthsRange(months: 3 | 6 | 12, today = new Date()) {
  const from = new Date(today);
  const day = from.getDate();
  from.setDate(1);
  from.setMonth(from.getMonth() - months);
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  from.setDate(Math.min(day, lastDay));
  return { fromDate: localAnalysisDate(from), toDate: localAnalysisDate(today) };
}

export function validAnalysisDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localAnalysisDate(date) === value;
}

export function analysisSelectionFromQuery(query: string, fallback: { fromDate: string; toDate: string }) {
  const params = new URLSearchParams(query);
  const from = params.get("from"), to = params.get("to");
  return { ...fallback, ...(validAnalysisDate(from) && validAnalysisDate(to) && from <= to ? { fromDate: from, toDate: to } : {}), discipline: (params.get("discipline") || "").trim().slice(0, 100) };
}
