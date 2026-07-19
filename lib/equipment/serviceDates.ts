export function todayDateInputValue(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeLastServicedDate(value: string, today = todayDateInputValue()) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false as const, message: "Last serviced must be a valid date." };
  if (trimmed > today) return { ok: false as const, message: "Last serviced cannot be a future date." };
  return { ok: true as const, value: trimmed };
}

export function formatLastServicedDate(value: string | null | undefined, locale?: string | string[]) {
  if (!value) return "Not recorded";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Not recorded";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
