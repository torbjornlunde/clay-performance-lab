"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type TargetDetails = {
  label?: string | null;
  targetType?: string | null;
  direction?: string | null;
  angle?: string | null;
  speed?: string | null;
  distance?: string | null;
  difficulty?: string | null;
  notes?: string | null;
};

type TemplatePreview = {
  id: string;
  name: string;
  competition_date: string;
  shooting_ground: string | null;
  discipline: string;
  creator_label: string;
  post_count: number;
  target_count: number;
  is_complete: boolean;
  template_version: number;
  template_payload: any;
  updated_at: string;
};

function detailSummary(details: TargetDetails = {}) {
  return [details.targetType, details.direction, details.angle, details.speed, details.distance, details.difficulty].filter(Boolean).join(" · ") || "No extra details";
}

function TargetDetailsDisclosure({ details }: { details: TargetDetails }) {
  return (
    <details>
      <summary>More target details · {detailSummary(details)}</summary>
      {details.notes && <p className="small">Notes: {details.notes}</p>}
    </details>
  );
}

function SetupPreview({ setup }: { setup: any }) {
  const posts = Array.isArray(setup.posts) ? setup.posts : [];
  const physicalTargets = Array.isArray(setup.physicalTargets) ? setup.physicalTargets : [];
  return (
    <div className="card">
      <h2>Target setup preview</h2>
      {posts.map((post: any) => (
        <details className="detailAccordion" key={post.postNumber}>
          <summary>Post/stand {post.postNumber} · {post.presentations?.length || 0} presentations</summary>
          {post.instructions && <p className="small"><strong>Instructions:</strong> {post.instructions}</p>}
          {(post.presentations || []).map((presentation: any) => (
            <div className="subcard" key={presentation.presentationNumber}>
              <h3>Presentation {presentation.presentationNumber} · {presentation.presentationType}</h3>
              {(presentation.targets || []).map((target: any) => (
                <div className="subcard" key={target.targetPosition}>
                  <strong>Target {target.targetPosition} · {target.details?.label || "Unlabelled"} · {target.details?.targetType || "Unknown"}</strong>
                  <TargetDetailsDisclosure details={target.details || {}} />
                </div>
              ))}
            </div>
          ))}
        </details>
      ))}
      {physicalTargets.map((target: any) => (
        <details className="detailAccordion" key={`${target.courseNumber}-${target.machine}`}>
          <summary>Course {target.courseNumber} · Machine {target.machine} · {target.details?.targetType || "Unknown"}</summary>
          <TargetDetailsDisclosure details={target.details || {}} />
        </details>
      ))}
      {posts.length === 0 && physicalTargets.length === 0 && <p className="small muted">No target details are available in this template.</p>}
    </div>
  );
}

export default function TemplatePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [template, setTemplate] = useState<TemplatePreview | null>(null);
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    const { data, error } = await supabase.rpc("get_competition_template_preview", { p_template_id: id });
    if (error || !data?.[0]) {
      setMessage("Template is not available.");
      return;
    }
    setTemplate(data[0] as TemplatePreview);
  }

  async function useTemplate() {
    if (!template) return;
    if (!navigator.onLine) {
      setMessage("Copying requires a network connection.");
      return;
    }
    if (!window.confirm("Create a new competition from this template? The copy will get new local rows and will not depend on the original template.")) return;
    setCopying(true);
    setMessage("");
    const { data, error } = await supabase.rpc("copy_competition_template_to_new_session", {
      p_template_id: id,
      p_name: template.name,
      p_competition_date: template.competition_date,
      p_shooting_ground: template.shooting_ground,
    });
    setCopying(false);
    if (error) {
      setMessage("Could not copy this template. It may have been withdrawn or you may be offline.");
      return;
    }
    router.push(`/sessions/${data}`);
  }

  if (!template) {
    return <main><div className="card"><Link href="/competition-templates">← Templates</Link><p>{message || "Loading…"}</p></div></main>;
  }

  const setup = template.template_payload?.setup || {};
  return (
    <main>
      <div className="card">
        <Link href="/competition-templates">← Templates</Link>
        <h1>{template.name}</h1>
        <p>{template.competition_date} · {template.shooting_ground || "No ground"} · {template.discipline}</p>
        <p className="small">{template.creator_label} · Version {template.template_version} · Updated {new Date(template.updated_at).toLocaleString()} · {template.is_complete ? "Complete" : "Incomplete setup"}</p>
        {!template.is_complete && <div className="error">Incomplete setup</div>}
        <div className="btns"><button onClick={useTemplate} disabled={copying}>{copying ? "Copying…" : "Use as starting point"}</button></div>
        {message && <div className="error">{message}</div>}
      </div>
      <SetupPreview setup={setup} />
      {searchParams.get("use") && (
        <div className="card">
          <h2>Ready to copy?</h2>
          <p className="small">This creates a new competition with new local IDs. Scores, misses and personal data are not copied.</p>
          <button onClick={useTemplate}>Use as starting point</button>
        </div>
      )}
    </main>
  );
}
