export type ShooterProfile = {
  id?: string;
  user_id: string;
  shooter_name: string | null;
  country: string | null;
  my_disciplines: string[] | null;
  created_at?: string;
  updated_at?: string;
};

export function normalizeDisciplines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function prioritizedDisciplineOptions(options: string[], preferredDisciplines: string[]) {
  const preferred = preferredDisciplines.filter((discipline) => options.includes(discipline));
  const others = options.filter((discipline) => !preferred.includes(discipline));
  return [...preferred, ...others];
}
