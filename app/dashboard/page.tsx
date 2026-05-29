"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("sessions")
      .select("id,name,discipline,session_type,shooting_format,course_count,created_at")
      .order("created_at", { ascending: false });
    setSessions(data || []);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main>
      <div className="card">
        <h2>Dashboard</h2>
        <p>Create a session, log missed targets, then review analysis.</p>
        <div className="btns">
          <Link href="/sessions/new" className="button">New session</Link>
          <Link href="/stats" className="button secondary">Stats</Link>
          <button className="secondary" onClick={load}>Refresh</button>
          <button className="danger" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="card">
        <h2>Sessions</h2>
        {loading ? (
          <p>Loading...</p>
        ) : sessions.length === 0 ? (
          <p>No sessions yet.</p>
        ) : (
          sessions.map((session) => (
            <div className="sessionItem" key={session.id}>
              <div>
                <strong>{session.name}</strong>
                <div className="small muted">
                  {session.discipline} · {session.session_type}
                  {session.shooting_format ? ` · ${session.shooting_format}` : ""}
                  {session.course_count ? ` · ${session.course_count} courses` : ""}
                </div>
              </div>
              <Link href={`/sessions/${session.id}`} className="button secondary">Open</Link>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
