export type ShooterProfile = {
  id?: string;
  user_id: string;
  shooter_name: string | null;
  country: string | null;
  my_disciplines: string[] | null;
  created_at?: string;
  updated_at?: string;
};

export type ShooterProfileBasics = Pick<ShooterProfile, "shooter_name" | "country" | "my_disciplines"> | null | undefined;

export type ShooterProfileFormState = {
  shooterName: string;
  country: string;
  myDisciplines: string[];
};

export const COUNTRIES = [
  "Norway",
  "Sweden",
  "Denmark",
  "Finland",
  "Iceland",
  "United Kingdom",
  "Ireland",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Poland",
  "Czechia",
  "Austria",
  "Switzerland",
  "United States",
  "Canada",
  "Australia",
  "New Zealand",
];

export function emptyShooterProfileForm(): ShooterProfileFormState {
  return { shooterName: "", country: "", myDisciplines: [] };
}

export function normalizeDisciplines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function shooterProfileToForm(profile: ShooterProfileBasics): ShooterProfileFormState {
  return {
    shooterName: profile?.shooter_name || "",
    country: profile?.country || "",
    myDisciplines: normalizeDisciplines(profile?.my_disciplines),
  };
}

export function isShooterProfileComplete(profile: ShooterProfileBasics) {
  return Boolean(
    profile?.shooter_name?.trim() &&
      profile?.country?.trim() &&
      normalizeDisciplines(profile?.my_disciplines).length > 0,
  );
}

export function prioritizedDisciplineOptions(options: string[], preferredDisciplines: string[]) {
  const preferred = preferredDisciplines.filter((discipline) => options.includes(discipline));
  const others = options.filter((discipline) => !preferred.includes(discipline));
  return [...preferred, ...others];
}
