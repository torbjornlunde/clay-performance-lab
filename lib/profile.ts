export type ShooterProfile = {
  id?: string;
  user_id: string;
  shooter_name: string | null;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  my_disciplines: string[] | null;
  created_at?: string;
  updated_at?: string;
};

export type ShooterProfileBasics = Pick<ShooterProfile, "shooter_name" | "first_name" | "last_name" | "country" | "my_disciplines"> | null | undefined;

export type ShooterProfileFormState = {
  firstName: string;
  lastName: string;
  legacyShooterName: string;
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

export function normalizeProfileWhitespace(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

export function composeCanonicalShooterName(firstName: string | null | undefined, lastName: string | null | undefined) {
  return [normalizeProfileWhitespace(firstName), normalizeProfileWhitespace(lastName)].filter(Boolean).join(" ");
}

export function completeCanonicalShooterName(firstName: string | null | undefined, lastName: string | null | undefined) {
  const normalizedFirstName = normalizeProfileWhitespace(firstName);
  const normalizedLastName = normalizeProfileWhitespace(lastName);
  return normalizedFirstName && normalizedLastName ? composeCanonicalShooterName(normalizedFirstName, normalizedLastName) : "";
}

export function shooterProfileDisplayName(profile: Pick<ShooterProfile, "first_name" | "last_name" | "shooter_name"> | null | undefined) {
  return completeCanonicalShooterName(profile?.first_name, profile?.last_name) || normalizeProfileWhitespace(profile?.shooter_name);
}

export function emptyShooterProfileForm(): ShooterProfileFormState {
  return { firstName: "", lastName: "", legacyShooterName: "", country: "", myDisciplines: [] };
}

export function normalizeDisciplines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function shooterProfileToForm(profile: ShooterProfileBasics): ShooterProfileFormState {
  const firstName = normalizeProfileWhitespace(profile?.first_name);
  const lastName = normalizeProfileWhitespace(profile?.last_name);
  return {
    firstName,
    lastName,
    legacyShooterName: firstName && lastName ? "" : normalizeProfileWhitespace(profile?.shooter_name),
    country: normalizeCountryCode(profile?.country),
    myDisciplines: normalizeDisciplines(profile?.my_disciplines),
  };
}

export function isShooterProfileComplete(profile: ShooterProfileBasics) {
  return Boolean(
    normalizeProfileWhitespace(profile?.first_name) &&
      normalizeProfileWhitespace(profile?.last_name) &&
      isValidCountryCode(profile?.country) &&
      normalizeDisciplines(profile?.my_disciplines).length > 0,
  );
}

const INTERNATIONAL_DISCIPLINE_ORDER = [
  "Compak Sporting",
  "FITASC Sporting",
  "Sporting",
  "English Sporting",
  "Skeet",
  "Trap",
  "Sporttrap",
  "Leirduesti",
  "Kompakt leirduesti",
  "Jegertrap / Nordisk trap",
  "Other",
];

function orderDisciplinesForCountry(options: string[], country?: string | null) {
  const countryCode = normalizeCountryCode(country);
  if (!countryCode || countryCode === "NO") return options;

  const order = new Map(INTERNATIONAL_DISCIPLINE_ORDER.map((discipline, index) => [discipline, index]));
  return [...options].sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    const aOrder = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return options.indexOf(a) - options.indexOf(b);
  });
}

export function prioritizedDisciplineOptions(options: string[], preferredDisciplines: string[], country?: string | null) {
  const countryOrderedOptions = orderDisciplinesForCountry(options, country);
  const preferred = preferredDisciplines.filter((discipline) => discipline !== "Other" && countryOrderedOptions.includes(discipline));
  const others = countryOrderedOptions.filter((discipline) => !preferred.includes(discipline) && discipline !== "Other");
  return countryOrderedOptions.includes("Other") ? [...preferred, ...others, "Other"] : [...preferred, ...others];
}
