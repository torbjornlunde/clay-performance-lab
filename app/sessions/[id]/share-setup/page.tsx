"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { disciplineSupportNote, supportedTemplateDiscipline, TemplateVisibility } from "@/lib/competitionTemplates";
import { supabase } from "@/lib/supabase/client";
import { userFacingSaveError } from "@/lib/userFacingErrors";
import { shooterProfileDisplayName, type ShooterProfile } from "@/lib/profile";

type SessionRow = {
  id: string;
  name: string;
  competition_date: string | null;
  shooting_ground: string | null;
  discipline: string;
};

type PublishedTemplate = {
  id: string;
  name: string;
  visibility: TemplateVisibility;
  template_version: number;
  withdrawn_at: string | null;
  updated_at: string;
};

type PublishSummary = {
  post_count: number;
  target_count: number;
  is_complete: boolean;
};

type RpcPublishResult = {
  template_id: string;
  template_version: number;
  visibility: TemplateVisibility;
  is_complete?: boolean;
};

function safeMessage(error: unknown, fallback: string) {
  return userFacingSaveError(error, fallback);
}

function TemplateSummaryCard({ session, summary }: { session: SessionRow; summary: PublishSummary | null }) {
  return (
    <div className="subcard">
      <h2>Preview</h2>
      <p>
        <strong>{session.name}</strong> · {session.competition_date || "No date"} · {session.shooting_ground || "No ground"} · {session.discipline}
      </p>
      <p>{disciplineSupportNote(session.discipline)}</p>
      <p>
        <strong>{summary?.post_count || 0}</strong> posts/stands/series · <strong>{summary?.target_count || 0}</strong> targets · {summary?.is_complete ? "Complete setup" : "Incomplete setup"}
      </p>
    </div>
  );
}

function SharingExplainer() {
  return (
    <div className="subcard">
      <h2>What will be shared</h2>
      <ul>
        <li>Competition name, date, ground and discipline.</li>
        <li>Target setup, physical targets, presentations, pair structure, order and program metadata when supported.</li>
        <li>A versioned snapshot only. Later session edits need an explicit update.</li>
      </ul>
      <h2>What will not be shared</h2>
      <ul>
        <li>Scores, misses, miss reasons, equipment, personal notes, coaches, participants, emails, owner ID, private source session ID or local row IDs.</li>
      </ul>
    </div>
  );
}

export default function ShareCompetitionSetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [summary, setSummary] = useState<PublishSummary | null>(null);
  const [visibility, setVisibility] = useState<TemplateVisibility>("private");
  const [showName, setShowName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<PublishedTemplate[]>([]);

  const canShowProfileName = displayName.length > 0;
  const profileNameLabel = canShowProfileName ? `Show my profile name (${displayName})` : "Add a profile name before showing your name";

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const [sessionResult, sourcePreviewResult, profileResult, templatesResult] = await Promise.all([
      supabase.from("sessions").select("id,name,competition_date,shooting_ground,discipline").eq("id", id).single(),
      supabase.rpc("preview_competition_template_source", { p_source_session_id: id }),
      supabase.from("shooter_profiles").select("shooter_name,first_name,last_name").eq("user_id", userData.user.id).maybeSingle<Pick<ShooterProfile, "shooter_name" | "first_name" | "last_name">>(),
      supabase.from("competition_templates").select("id,name,visibility,template_version,withdrawn_at,updated_at").eq("source_session_id", id).order("updated_at", { ascending: false }),
    ]);

    if (sessionResult.error || !sessionResult.data) {
      setMessage("Could not load this competition setup.");
      return;
    }

    const loadedSession = sessionResult.data as SessionRow;
    setSession(loadedSession);
    setExisting((templatesResult.data || []) as PublishedTemplate[]);

    const name = shooterProfileDisplayName(profileResult.data);
    setDisplayName(name);
    setShowName(false);

    if (sourcePreviewResult.error || !sourcePreviewResult.data?.[0]) {
      setSummary(null);
      setMessage("This discipline or setup is not ready for sharing yet. FITASC Sporting setup sharing will come later.");
      return;
    }
    setSummary(sourcePreviewResult.data[0] as PublishSummary);
  }

  async function publishNewTemplate() {
    if (!session) return;
    if (!navigator.onLine) {
      setMessage("Publishing requires a network connection. Your session data is unchanged.");
      return;
    }
    if (!session.name.trim() || !session.competition_date || !supportedTemplateDiscipline(session.discipline)) {
      setMessage("Add a competition name, date and supported discipline before publishing.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase.rpc("publish_competition_template", {
      p_source_session_id: session.id,
      p_visibility: visibility,
      p_show_creator_name: showName && canShowProfileName,
    });
    setSaving(false);

    if (error) {
      setMessage(safeMessage(error, "Could not publish this setup right now. Try again when online."));
      return;
    }

    const result = (data?.[0] || data) as RpcPublishResult | undefined;
    router.push(`/competition-templates/${result?.template_id}`);
  }

  async function updateTemplate(templateId: string) {
    if (!navigator.onLine) {
      setMessage("Updating requires a network connection. Your session data is unchanged.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { data, error } = await supabase.rpc("update_competition_template_snapshot", {
      p_template_id: templateId,
      p_visibility: visibility,
      p_show_creator_name: showName && canShowProfileName,
    });
    setSaving(false);
    if (error) {
      setMessage(safeMessage(error, "Could not update this published setup."));
      return;
    }
    const result = (data?.[0] || data) as RpcPublishResult | undefined;
    router.push(`/competition-templates/${result?.template_id || templateId}`);
  }

  async function withdrawTemplate(templateId: string) {
    if (!window.confirm("Withdraw this template? New copies will be blocked, but existing copies are unchanged.")) return;
    const { error } = await supabase.rpc("withdraw_competition_template", { p_template_id: templateId });
    if (error) {
      setMessage(safeMessage(error, "Could not withdraw this template."));
      return;
    }
    await load();
  }

  if (!session) return <main><div className="card">Loading…</div></main>;

  return (
    <main>
      <div className="card">
        <Link href={`/sessions/${id}`}>← Back to competition</Link>
        <h1>Share competition setup</h1>
        <p className="small muted">Publish a server-built snapshot of this target setup. Later session edits do not update published templates unless you choose Update published setup.</p>
        {message && <div className="error">{message}</div>}
        <TemplateSummaryCard session={session} summary={summary} />
        <SharingExplainer />
        <div className="subcard">
          <h2>Privacy and visibility</h2>
          <label>Visibility</label>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as TemplateVisibility)}>
            <option value="private">Private</option>
            <option value="link">Link</option>
            <option value="searchable">Searchable</option>
          </select>
          <label>
            <input type="checkbox" checked={showName && canShowProfileName} disabled={!canShowProfileName} onChange={(event) => setShowName(event.target.checked)} /> {profileNameLabel}
          </label>
          <p className="small muted">If no profile name is available, templates are shown as Created by another user. Email addresses are never used as creator names.</p>
        </div>
        <div className="btns">
          <button disabled={saving || !summary} onClick={publishNewTemplate}>{saving ? "Publishing…" : "Publish"}</button>
          <Link className="button secondary" href={`/sessions/${id}`}>Cancel</Link>
        </div>
      </div>

      {existing.length > 0 && (
        <div className="card">
          <h2>Your published snapshots</h2>
          {existing.map((template) => (
            <div className="subcard" key={template.id}>
              <p><strong>Version {template.template_version}</strong> · {template.visibility} · {template.withdrawn_at ? "Withdrawn" : "Active"}</p>
              <div className="btns">
                <Link className="button secondary" href={`/competition-templates/${template.id}`}>Preview</Link>
                <button onClick={() => updateTemplate(template.id)}>Update published setup</button>
                <button className="secondary" onClick={() => withdrawTemplate(template.id)}>Withdraw</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
