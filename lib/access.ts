export type AccessStatus = "pending" | "approved" | "rejected" | "revoked";
export type SystemRole = "owner" | "admin" | "user";
export type AccountType = "personal";

export type UserAccessProfile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  access_status: AccessStatus;
  system_role: SystemRole;
  account_type: AccountType;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
};

export type BetaInterestSubmission = {
  id: string;
  name: string;
  email: string;
  country: string;
  main_discipline: string;
  level_comment: string | null;
  instagram_handle: string | null;
  created_at: string;
  updated_at: string;
};

export type BetaAccessListEntry = {
  id: string;
  email: string | null;
  full_name: string | null;
  access_status_to_grant: "approved";
  system_role_to_grant: SystemRole;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

export const OWNER_EMAILS = [
  "noenlunde85@gmail.com",
  "torbjorn.lunde@icloud.com",
  "noenlunde@hotmail.com",
] as const;

export function canManageBetaAccess(profile: Pick<UserAccessProfile, "access_status" | "system_role"> | null | undefined) {
  return profile?.access_status === "approved" && (profile.system_role === "owner" || profile.system_role === "admin");
}

export function normalizeAccessEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || "";
}

export function isProtectedOwnerEmail(email: string | null | undefined) {
  const normalizedEmail = normalizeAccessEmail(email);
  return OWNER_EMAILS.some((ownerEmail) => ownerEmail === normalizedEmail);
}
