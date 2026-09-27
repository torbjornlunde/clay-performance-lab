"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Session = { id: string; name: string; discipline: string | null; session_type: string | null; competition_date: string | null; created_at: string };
type Note = { id: string; session_id: string; note_scope: "session" | "post"; post_number: number | null; body: string; updated_at: string; sessions: Session | Session[] | null };
const PAGE_SIZE = 100;

function sessionFor(note: Note): Session | null {
  return Array.isArray(note.sessions) ? note.sessions[0] || null : note.sessions;
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [discipline, setDiscipline] = useState("all");
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset: number) => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { router.replace("/login"); return; }
    const result = await supabase.from("private_session_notes")
      .select("id,session_id,note_scope,post_number,body,updated_at,sessions!inner(id,name,discipline,session_type,competition_date,created_at)")
      .eq("user_id", auth.user.id)
      .neq("body", "")
      .order("updated_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) { setError("Could not load your notes. Please try again."); return; }
    const incoming = (result.data || []) as unknown as Note[];
    setNotes((current) => offset === 0 ? incoming : [...current, ...incoming]);
    setHasMore(incoming.length === PAGE_SIZE);
    setError("");
  }, [router]);

  useEffect(() => {
    let active = true;
    void load(0).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const disciplines = useMemo(() => [...new Set(notes.map((note) => sessionFor(note)?.discipline).filter((value): value is string => Boolean(value)))].sort(), [notes]);
  const visible = useMemo(() => notes.filter((note) => {
    const session = sessionFor(note);
    return session && (discipline === "all" || session.discipline === discipline)
      && (!query.trim() || `${note.body} ${session.name} ${session.discipline || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }), [notes, discipline, query]);

  async function loadMore() {
    setLoadingMore(true);
    try { await load(notes.length); } finally { setLoadingMore(false); }
  }

  return <main>
    <section className="heroCard">
      <p className="eyebrow">Your shooting journal</p>
      <h1>Personal notes</h1>
      <p>Your private reflections from competitions and training, together in one place. Open an entry to edit it or review its context.</p>
    </section>
    <section className="card">
      <div className="sectionHeader"><h2>Notes</h2><span className="countPill">{notes.length}{hasMore ? "+" : ""}</span></div>
      <div className="personalNotesFilters">
        <label>Find in loaded notes<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes or events" /></label>
        <label>Discipline<select value={discipline} onChange={(event) => setDiscipline(event.target.value)}><option value="all">All disciplines</option>{disciplines.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      {error && <p role="alert" className="error">{error} <button type="button" className="secondary smallButton" onClick={() => void load(notes.length)}>Retry</button></p>}
      {loading ? <p>Loading your notes...</p> : visible.length === 0 && !error ? <p className="emptyState">{notes.length ? "No notes match these filters." : "No saved personal notes yet. Add one to a competition or training session."}</p> : null}
      <div className="personalNotesList">{visible.map((note) => {
        const session = sessionFor(note)!;
        const date = session.competition_date || session.created_at;
        return <article className="subcard personalNoteEntry" key={note.id}>
          <div className="personalNoteMeta"><span>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(date))}</span><span>{session.session_type || "Session"}{note.note_scope === "post" ? ` · Post ${note.post_number}` : ""}</span></div>
          <h3>{session.name}</h3>
          {session.discipline && <p className="small muted">{session.discipline}</p>}
          <p className="personalNoteBody">{note.body}</p>
          <Link className="button secondary smallButton" href={`/sessions/${session.id}#${session.session_type === "Competition" && note.note_scope === "session" ? "competition-context" : "private-notes"}`}>Open session</Link>
        </article>;
      })}</div>
      {hasMore && <button type="button" className="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading..." : "Load more notes"}</button>}
    </section>
  </main>;
}
