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

export type BetaInterestAdminStatus =
  | "new"
  | "pre_approved"
  | "approved_existing_user"
  | "contacted"
  | "rejected";

export type BetaInterestSubmission = {
  id: string;
  name: string;
  email: string;
  country: string;
  main_discipline: string;
  level_comment: string | null;
  instagram_handle: string | null;
  admin_status: BetaInterestAdminStatus;
  handled_at: string | null;
  handled_by: string | null;
  access_list_entry_id: string | null;
  admin_note: string | null;
  approval_email_sent_at: string | null;
  approval_email_error: string | null;
  created_at: string;
  updated_at: string;
};

export type BetaFeedbackAdminStatus = "new" | "reviewed" | "resolved";

export type BetaFeedbackAttachment = {
  id: string;
  feedback_id: string;
  user_id: string | null;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  signed_url?: string;
};

export type BetaFeedback = {
  id: string;
  user_id: string | null;
  email: string | null;
  feedback_type: string;
  severity: string;
  message: string;
  page_path: string | null;
  user_agent: string | null;
  app_context: Record<string, unknown>;
  admin_status: BetaFeedbackAdminStatus;
  admin_note: string | null;
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

export function canManageBetaAccess(
  profile:
    | Pick<UserAccessProfile, "access_status" | "system_role">
    | null
    | undefined,
) {
  return (
    profile?.access_status === "approved" &&
    (profile.system_role === "owner" || profile.system_role === "admin")
  );
}

export function normalizeAccessEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || "";
}

export function isProtectedOwnerEmail(email: string | null | undefined) {
  const normalizedEmail = normalizeAccessEmail(email);
  return OWNER_EMAILS.some((ownerEmail) => ownerEmail === normalizedEmail);
}
