"use client";

import type {
  ExportCourse,
  ExportMiss,
  ExportPostTarget,
  ExportSession,
  ExportTargetDefinition,
} from "@/lib/export/exportUserData";
import { supabase } from "@/lib/supabase/client";

export async function exportMyDataForCurrentUser() {
  const { data: u, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!u.user) return { authenticated: false as const };

  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false })
    .returns<ExportSession[]>();
  if (sessionError) throw sessionError;

  const exportSessions = sessionData || [];
  const sessionIds = exportSessions.map((session) => session.id);
  let exportCourses: ExportCourse[] = [];
  let exportMisses: ExportMiss[] = [];
  let exportTargetDefinitions: ExportTargetDefinition[] = [];
  let exportPostTargets: ExportPostTarget[] = [];

  if (sessionIds.length > 0) {
    const [coursesResult, missesResult, definitionsResult, postTargetsResult] =
      await Promise.all([
        supabase
          .from("session_courses")
          .select("session_id,course_number,fitasc_scheme,shooter_number,start_plate")
          .in("session_id", sessionIds)
          .order("course_number")
          .returns<ExportCourse[]>(),
        supabase
          .from("misses")
          .select("session_id,course_number,plate,target_number,target_label,target_type,base_presentation,actual_presentation,presented_pair_label,shooting_order_label,is_reversed_order,missed_target,where_miss,main_reason,target_read,comment,first_where_miss,first_main_reason,first_target_read,first_comment,second_where_miss,second_main_reason,second_target_read,second_comment,created_at")
          .in("session_id", sessionIds)
          .order("created_at")
          .returns<ExportMiss[]>(),
        supabase
          .from("session_target_definitions")
          .select("session_id,course_number,machine,target_type,direction,angle,speed,distance,difficulty,notes")
          .in("session_id", sessionIds)
          .order("course_number")
          .returns<ExportTargetDefinition[]>(),
        supabase
          .from("session_post_targets")
          .select("session_id,post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type,direction,angle,speed,distance,difficulty,notes")
          .in("session_id", sessionIds)
          .order("post_number")
          .order("target_position")
          .returns<ExportPostTarget[]>(),
      ]);

    if (coursesResult.error) throw coursesResult.error;
    if (missesResult.error) throw missesResult.error;
    if (definitionsResult.error) throw definitionsResult.error;
    if (postTargetsResult.error) throw postTargetsResult.error;

    exportCourses = coursesResult.data || [];
    exportMisses = missesResult.data || [];
    exportTargetDefinitions = definitionsResult.data || [];
    exportPostTargets = postTargetsResult.data || [];
  }

  const { exportFileName, exportUserDataToExcel } = await import("@/lib/export/exportUserData");
  exportUserDataToExcel(
    {
      sessions: exportSessions,
      courses: exportCourses,
      misses: exportMisses,
      targetDefinitions: exportTargetDefinitions,
      postTargets: exportPostTargets,
    },
    exportFileName(),
  );

  return { authenticated: true as const };
}
