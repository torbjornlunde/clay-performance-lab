import { getCountryLabel, shooterProfileDisplayName, type ShooterProfile } from "../profile";

export const SHOOTER_DIRECTORY_MIN_QUERY = 2;
export const SHOOTER_DIRECTORY_DEFAULT_LIMIT = 8;
export const SHOOTER_DIRECTORY_MAX_LIMIT = 10;

export type ShooterDirectorySuggestion = {
  userId: string;
  displayName: string;
  country: string;
  isOwnProfile?: boolean;
};

export type IdentityShooterDraft = { name: string; linkedUserId: string | null };

export function normalizeShooterDirectoryQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function canSearchShooterDirectory(value: string) {
  return normalizeShooterDirectoryQuery(value).length >= SHOOTER_DIRECTORY_MIN_QUERY;
}

export function capShooterDirectoryLimit(value: number) {
  return Math.min(Math.max(Math.trunc(Number(value) || SHOOTER_DIRECTORY_DEFAULT_LIMIT), 1), SHOOTER_DIRECTORY_MAX_LIMIT);
}

export function normalizeLinkedUserId(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function applyShooterIdentity<T extends IdentityShooterDraft>(shooter: T, suggestion: ShooterDirectorySuggestion): T {
  return { ...shooter, name: suggestion.displayName, linkedUserId: suggestion.userId };
}

export function unlinkShooterIdentity<T extends IdentityShooterDraft>(shooter: T): T {
  return { ...shooter, linkedUserId: null };
}

export function identityAlreadyLinked(userId: string, shooters: Array<{ linkedUserId?: string | null }>, exceptLocalId?: string) {
  return shooters.some((shooter) => shooter.linkedUserId === userId && ("localId" in shooter ? shooter.localId !== exceptLocalId : true));
}

export function ownProfileSuggestion(profile: ShooterProfile | null | undefined): ShooterDirectorySuggestion | null {
  const displayName = shooterProfileDisplayName(profile);
  const country = getCountryLabel(profile?.country);
  if (!profile?.user_id || !displayName || !country) return null;
  return { userId: profile.user_id, displayName, country, isOwnProfile: true };
}

export function mergeOwnProfileSuggestion(query: string, own: ShooterDirectorySuggestion | null, remote: ShooterDirectorySuggestion[]) {
  const normalized = normalizeShooterDirectoryQuery(query).toLocaleLowerCase();
  const matchesOwn = own && own.displayName.toLocaleLowerCase().includes(normalized);
  return [...(matchesOwn ? [own] : []), ...remote.filter((item) => item.userId !== own?.userId)];
}
