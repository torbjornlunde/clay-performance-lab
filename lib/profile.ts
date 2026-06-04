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

export type CountryOption = {
  code: string;
  label: string;
  aliases?: string[];
};

export const COUNTRIES: CountryOption[] = [
  { code: "NO", label: "Norway", aliases: ["Norge", "Nor", "Norwegian"] },
  { code: "SE", label: "Sweden", aliases: ["Sverige", "Swedish"] },
  { code: "DK", label: "Denmark", aliases: ["Danmark", "Danish"] },
  { code: "FI", label: "Finland", aliases: ["Suomi", "Finnish"] },
  { code: "IS", label: "Iceland", aliases: ["Ísland"] },
  { code: "DE", label: "Germany", aliases: ["Deutschland", "German"] },
  { code: "GB", label: "United Kingdom", aliases: ["UK", "Great Britain", "Britain", "England"] },
  { code: "IE", label: "Ireland" },
  { code: "NL", label: "Netherlands", aliases: ["Holland"] },
  { code: "BE", label: "Belgium" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain", aliases: ["España"] },
  { code: "IT", label: "Italy", aliases: ["Italia"] },
  { code: "PT", label: "Portugal" },
  { code: "PL", label: "Poland" },
  { code: "CZ", label: "Czechia", aliases: ["Czech Republic"] },
  { code: "AT", label: "Austria" },
  { code: "CH", label: "Switzerland" },
  { code: "US", label: "United States", aliases: ["USA", "United States of America", "America"] },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
];

function normalizeCountryLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

export function normalizeCountryCode(value: string | null | undefined) {
  if (!value?.trim()) return "";

  const normalizedValue = normalizeCountryLookupValue(value);
  const country = COUNTRIES.find((option) => {
    const aliases = [option.code, option.label, ...(option.aliases ?? [])];
    return aliases.some((alias) => normalizeCountryLookupValue(alias) === normalizedValue);
  });

  return country?.code ?? "";
}

export function isValidCountryCode(value: string | null | undefined) {
  return Boolean(normalizeCountryCode(value));
}

export function getCountryLabel(value: string | null | undefined) {
  const code = normalizeCountryCode(value);
  return COUNTRIES.find((country) => country.code === code)?.label ?? "";
}

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
    country: normalizeCountryCode(profile?.country),
    myDisciplines: normalizeDisciplines(profile?.my_disciplines),
  };
}

export function isShooterProfileComplete(profile: ShooterProfileBasics) {
  return Boolean(
    profile?.shooter_name?.trim() &&
      isValidCountryCode(profile?.country) &&
      normalizeDisciplines(profile?.my_disciplines).length > 0,
  );
}

export function prioritizedDisciplineOptions(options: string[], preferredDisciplines: string[]) {
  const preferred = preferredDisciplines.filter((discipline) => options.includes(discipline));
  const others = options.filter((discipline) => !preferred.includes(discipline));
  return [...preferred, ...others];
}
