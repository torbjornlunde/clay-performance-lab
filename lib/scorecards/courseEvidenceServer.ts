import { createClient } from "@supabase/supabase-js";
import { SCORECARD_EVIDENCE_BUCKET, SCORECARD_EVIDENCE_TYPES, type ScorecardEvidence } from "@/lib/scorecardEvidence";
import { fingerprintScorecardEvidenceBlob } from "./courseScorecardReview";

export const COURSE_ANALYSIS_MAX_BYTES = 4 * 1024 * 1024;
export function requestSupabase(request: Request) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key) throw new Error("Missing Supabase environment variables.");
  const authorization=request.headers.get("authorization")||undefined;
  return createClient(url,key,{global:{headers:authorization?{Authorization:authorization}:{}}});
}
export async function loadCanonicalCourseEvidence(supabase:any,userId:string,sessionId:string,evidenceId:string) {
  const {data:session}=await supabase.from("sessions").select("id,user_id,session_type,discipline,course_count").eq("id",sessionId).single();
  if(!session||session.user_id!==userId) throw new Error("forbidden");
  if(session.session_type!=="Competition"||session.discipline!=="Compak Sporting") throw new Error("unsupported_session");
  const {data:evidence}=await supabase.from("competition_scorecard_evidence").select("*").eq("id",evidenceId).single();
  if(!evidence||evidence.user_id!==userId||evidence.session_id!==sessionId) throw new Error("evidence_mismatch");
  if(!Number.isInteger(evidence.course_number)) throw new Error("course_required");
  const {data:course}=await supabase.from("session_courses").select("course_number").eq("session_id",sessionId).eq("course_number",evidence.course_number).maybeSingle();
  if(!course||evidence.course_number<1||evidence.course_number>Number(session.course_count||0)) throw new Error("course_not_found");
  const {data:blob,error}=await supabase.storage.from(SCORECARD_EVIDENCE_BUCKET).download(evidence.storage_path);
  if(error||!blob) throw new Error("source_unavailable");
  if(!(SCORECARD_EVIDENCE_TYPES as readonly string[]).includes(evidence.content_type)||blob.type && !(SCORECARD_EVIDENCE_TYPES as readonly string[]).includes(blob.type)) throw new Error("unsupported_image");
  return {session,evidence:evidence as ScorecardEvidence,blob,fingerprint:await fingerprintScorecardEvidenceBlob(blob)};
}
