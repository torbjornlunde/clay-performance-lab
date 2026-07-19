const DEFAULT_SERVICE_DATE_LOCALE = "en-GB";

export function todayDateInputValue(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function dateFromParts(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isRealCalendarDate(value: string) {
  const parts = dateParts(value);
  if (!parts || parts.year < 1) return false;
  const date = dateFromParts(parts.year, parts.month, parts.day);
  return date.getFullYear() === parts.year && date.getMonth() === parts.month - 1 && date.getDate() === parts.day;
}

export function normalizeLastServicedDate(value: string, today = todayDateInputValue()) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, value: null };
  if (!isRealCalendarDate(trimmed)) return { ok: false as const, message: "Last serviced must be a valid date." };
  if (trimmed > today) return { ok: false as const, message: "Last serviced cannot be a future date." };
  return { ok: true as const, value: trimmed };
}

export function formatLastServicedDate(value: string | null | undefined, locale: string | string[] = DEFAULT_SERVICE_DATE_LOCALE) {
  if (!value || !isRealCalendarDate(value)) return "Not recorded";
  const { year, month, day } = dateParts(value)!;
  const date = dateFromParts(year, month, day);
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
