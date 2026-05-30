"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { isOrdinaryLeirduesti } from "@/lib/disciplines";
import { normalizeLeirduestiLabel, shortMissedTarget } from "@/lib/misses/labels";
import { supabase } from "@/lib/supabase/client";

type Session = { id: string; name: string; discipline: string };
type Miss = {
  id: string;
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_label: string | null;
  target_type: string | null;
  missed_target: string | null;
  where_miss: string | null;
  main_reason: string | null;
  target_read: string | null;
  comment: string | null;
  first_where_miss: string | null;
  first_main_reason: string | null;
  first_target_read: string | null;
  first_comment: string | null;
  second_where_miss: string | null;
  second_main_reason: string | null;
  second_target_read: string | null;
  second_comment: string | null;
  created_at: string;
};

function value(text: string | number | null | undefined) {
  return text === null || text === undefined || text === "" ? "-" : text;
}

function labelFor(session: Session, miss: Miss) {
  const targetType = normalizeLeirduestiLabel(miss.target_type) || "Unknown";
  if (session.discipline === "Sporttrap") return `Series ${value(miss.course_number)} · Stand ${value(miss.plate)} · ${targetType} · ${value(miss.target_label)}`;
  if (isOrdinaryLeirduesti(session.discipline)) return `Post ${value(miss.course_number)} · ${targetType} · Pair / sequence ${value(miss.target_number)}`;
  return `Course ${value(miss.course_number)} · Plate ${value(miss.plate)} · ${value(miss.target_label)}`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="missReviewRow"><span>{label}</span><strong>{children}</strong></div>;
}

export default function MissesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { router.push("/login"); return; }
    const { data: sessionData } = await supabase.from("sessions").select("id,name,discipline").eq("id", params.id).maybeSingle<Session>();
    const { data: missData } = await supabase.from("misses").select("*").eq("session_id", params.id).order("created_at", { ascending: false }).returns<Miss[]>();
    setSession(sessionData || null);
    setMisses(missData || []);
    setLoading(false);
  }

  async function deleteMiss(id: string) {
    if (!window.confirm("Delete this registered miss?")) return;
    setMsg("");
    setDeletingId(id);
    const { error } = await supabase.from("misses").delete().eq("id", id).eq("session_id", params.id);
    setDeletingId(null);
    if (error) { setMsg(error.message); return; }
    await load();
  }

  if (loading) return <main><div className="card">Loading misses...</div></main>;
  if (!session) return <main><div className="card"><h2>Session not found</h2><Link className="button secondary" href="/dashboard">Dashboard</Link></div></main>;

  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);

  return (
    <main>
      <div className="card">
        <h2>Review misses</h2>
        <p className="small muted">{session.name}</p>
        <span className="pill">{session.discipline}</span>
        <span className="pill">All misses <strong>{misses.length}</strong></span>
        <div className="btns">
          <Link className="button" href={`/sessions/${session.id}/log`}>Log miss</Link>
          <Link className="button secondary" href={`/sessions/${session.id}`}>Session</Link>
        </div>
        {msg && <div className="error">{msg}</div>}
      </div>
      <div className="missReviewList">
        {misses.length === 0 ? <div className="card">No misses registered yet.</div> : misses.map((miss) => (
          <div className="card missReviewCard" key={miss.id}>
            <div className="missReviewHeader">
              <div>
                <strong>{labelFor(session, miss)}</strong>
                <div className="small muted">{new Date(miss.created_at).toLocaleString()}</div>
              </div>
              <div className="btns compactActions">
                <Link className="button secondary smallButton" href={`/sessions/${session.id}/misses/${miss.id}/edit`}>Edit</Link>
                <button className="danger smallButton" onClick={() => deleteMiss(miss.id)} disabled={deletingId === miss.id}>{deletingId === miss.id ? "Deleting..." : "Delete"}</button>
              </div>
            </div>
            <div className="missReviewGrid">
              {isSporttrap ? <><DetailRow label="Series">{value(miss.course_number)}</DetailRow><DetailRow label="Stand">{value(miss.plate)}</DetailRow><DetailRow label="Sequence / presentation">{value(normalizeLeirduestiLabel(miss.target_type))}</DetailRow><DetailRow label="Target label">{value(miss.target_label)}</DetailRow></> : isLeirduesti ? <><DetailRow label="Post">{value(miss.course_number)}</DetailRow><DetailRow label="Situation">{value(normalizeLeirduestiLabel(miss.target_type))}</DetailRow><DetailRow label="Pair / sequence">{value(miss.target_number)}</DetailRow></> : <><DetailRow label="Course">{value(miss.course_number)}</DetailRow><DetailRow label="Plate">{value(miss.plate)}</DetailRow><DetailRow label="Target/machine label">{value(miss.target_label)}</DetailRow><DetailRow label="Presentation/target type">{value(normalizeLeirduestiLabel(miss.target_type))}</DetailRow></>}
              <DetailRow label="Missed target">{shortMissedTarget(miss.missed_target)}</DetailRow>
              <DetailRow label="Where miss">{value(miss.where_miss || miss.first_where_miss || miss.second_where_miss)}</DetailRow>
              <DetailRow label="Main reason">{value(miss.main_reason || miss.first_main_reason || miss.second_main_reason)}</DetailRow>
              {miss.comment && <DetailRow label="Comment">{miss.comment}</DetailRow>}
              {miss.missed_target === "Both targets in pair" && <><DetailRow label="First target detail">{`${value(miss.first_where_miss)} · ${value(miss.first_main_reason)} · ${value(miss.first_target_read)}`}</DetailRow><DetailRow label="Second target detail">{`${value(miss.second_where_miss)} · ${value(miss.second_main_reason)} · ${value(miss.second_target_read)}`}</DetailRow></>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
