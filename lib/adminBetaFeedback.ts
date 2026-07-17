import type { BetaFeedback, BetaFeedbackAttachment } from "@/lib/access";
import { supabase } from "@/lib/supabase/client";

export const FEEDBACK_COLUMNS = "id,user_id,email,feedback_type,severity,message,page_path,user_agent,app_context,admin_status,admin_note,created_at,updated_at";
export const FEEDBACK_ATTACHMENT_COLUMNS = "id,feedback_id,user_id,storage_bucket,storage_path,original_filename,content_type,size_bytes,created_at";

export function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function formatFeedbackFileSize(bytes: number | null | undefined) {
  if (!bytes) return "Size unknown";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export async function loadBetaFeedbackWithSignedAttachments() {
  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("beta_feedback")
    .select(FEEDBACK_COLUMNS)
    .order("created_at", { ascending: false });

  if (feedbackError) return { feedback: [] as BetaFeedback[], attachments: {} as Record<string, BetaFeedbackAttachment[]>, error: feedbackError };

  const feedback = sortByCreatedAtDesc((feedbackRows ?? []) as BetaFeedback[]);
  const feedbackIds = feedback.map((item) => item.id);
  if (feedbackIds.length === 0) return { feedback, attachments: {} as Record<string, BetaFeedbackAttachment[]>, error: null };

  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("beta_feedback_attachments")
    .select(FEEDBACK_ATTACHMENT_COLUMNS)
    .in("feedback_id", feedbackIds)
    .order("created_at", { ascending: true });

  if (attachmentError) return { feedback, attachments: {} as Record<string, BetaFeedbackAttachment[]>, error: attachmentError };

  const rowsWithUrls = await Promise.all(
    ((attachmentRows ?? []) as BetaFeedbackAttachment[]).map(async (attachment) => {
      const { data } = await supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, 60 * 10);
      return { ...attachment, signed_url: data?.signedUrl };
    }),
  );

  const attachments = rowsWithUrls.reduce<Record<string, BetaFeedbackAttachment[]>>((groups, attachment) => {
    groups[attachment.feedback_id] = [...(groups[attachment.feedback_id] ?? []), attachment];
    return groups;
  }, {});

  return { feedback, attachments, error: null };
}
