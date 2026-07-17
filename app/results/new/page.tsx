"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EquipmentUsedSelector } from "@/app/components/EquipmentUsedSelector";
import { type EquipmentSelection } from "@/lib/equipment/logSnapshots";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { normalizeDisciplines, prioritizedDisciplineOptions, type ShooterProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { userFacingSaveError } from "@/lib/userFacingErrors";
import { CompetitionTemplateSuggestions, type CompetitionTemplateCandidate } from "@/app/components/CompetitionTemplateSuggestions";
import { useCompetitionTemplateCandidates } from "@/lib/competitionTemplates/useCompetitionTemplateCandidates";
import { ContextualHelpCard } from "@/app/components/OnboardingHelp";


export default function NewResultPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [competitionDate, setCompetitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [shootingGround, setShootingGround] = useState("");
  const [totalTargets, setTotalTargets] = useState("");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTemplateCandidate, setSelectedTemplateCandidate] = useState<CompetitionTemplateCandidate | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [myDisciplines, setMyDisciplines] = useState<string[]>([]);
  const [shooterCountry, setShooterCountry] = useState("");
  const [equipmentSelection, setEquipmentSelection] = useState<EquipmentSelection>({ weaponId: "", ammunitionId: "", includeChokes: true });
  const [equipmentSnapshot, setEquipmentSnapshot] = useState<any>(null);
  const disciplineOptions = useMemo(() => prioritizedDisciplineOptions(DISCIPLINE_OPTIONS, myDisciplines, shooterCountry), [myDisciplines, shooterCountry]);
  const suggestionTargetCount = totalTargets.trim() ? Number(totalTargets) || null : null;
  const suggestions = useCompetitionTemplateCandidates({ name, competitionDate, shootingGround, discipline, targetCount: suggestionTargetCount });

  useEffect(() => { setSelectedTemplateCandidate(null); }, [discipline, competitionDate, name, shootingGround, suggestionTargetCount]);

  async function applySelectedTemplate(sessionId: string) {
    if (!selectedTemplateCandidate) return true;
    if (selectedTemplateCandidate.discipline !== discipline) {
      setApplyMessage("The selected setup no longer matches this discipline. The result was saved without it.");
      return false;
    }
    if (!navigator.onLine) {
      setApplyMessage("Using a shared setup requires a network connection. You can continue without it.");
      return false;
    }
    setApplyingTemplate(true);
    const { error } = await supabase.rpc("apply_competition_template_to_empty_session", { p_template_id: selectedTemplateCandidate.id, p_session_id: sessionId });
    setApplyingTemplate(false);
    if (error) {
      setApplyMessage(error.message?.includes("empty competition") ? "This setup can only be applied to a new, empty competition." : "The result was saved, but the shared setup could not be applied. You can continue without it.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    let active = true;
    async function loadPreferredDisciplines() {
      const { data: userData } = await supabase.auth.getUser();
      if (!active || !userData.user) return;
      const { data } = await supabase.from("shooter_profiles").select("country,my_disciplines").eq("user_id", userData.user.id).maybeSingle<Pick<ShooterProfile, "country" | "my_disciplines">>();
      if (active) {
        setMyDisciplines(normalizeDisciplines(data?.my_disciplines));
        setShooterCountry(data?.country || "");
      }
    }
    loadPreferredDisciplines();
    return () => { active = false; };
  }, []);

  function parseOptionalInt(value: string, label: string, min = 0) {
    if (value.trim() === "") return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < min) throw new Error(`${label} must be ${min > 0 ? "at least 1" : "a non-negative whole number"}.`);
    return number;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");
    if (saving) return;
    if (!name.trim() || !competitionDate || !discipline) {
      setErr("Competition name, date and discipline are required.");
      return;
    }

    let totalTargetsValue: number | null = null;
    let ownScoreValue: number | null = null;
    let winningScoreValue: number | null = null;
    try {
      totalTargetsValue = parseOptionalInt(totalTargets, "Total targets", 1);
      ownScoreValue = parseOptionalInt(ownScore, "Own score");
      winningScoreValue = parseOptionalInt(winningScore, "Winning score");
    } catch (error) {
      setErr((error as Error).message);
      return;
    }
    const hasTotalTargets = totalTargetsValue !== null;
    const hasOwnScore = ownScoreValue !== null;
    if (hasTotalTargets !== hasOwnScore) {
      setErr("Total targets and own score must be filled out together when you add a result.");
      return;
    }
    if (winningScoreValue !== null && (!hasTotalTargets || !hasOwnScore)) {
      setErr("Add total targets and own score before adding a winning score.");
      return;
    }
    if (totalTargetsValue !== null) {
      if (ownScoreValue !== null && ownScoreValue > totalTargetsValue) { setErr("Own score cannot exceed total targets."); return; }
      if (winningScoreValue !== null && winningScoreValue > totalTargetsValue) { setErr("Winning score cannot exceed total targets."); return; }
    }

    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { router.push("/login"); return; }
    const { data: inserted, error } = await supabase.from("sessions").insert({
      user_id: u.user.id,
      name: name.trim(),
      discipline,
      session_type: "Competition",
      shooting_format: null,
      course_count: null,
      total_targets: totalTargetsValue,
      competition_date: competitionDate,
      shooting_ground: shootingGround.trim() || null,
      own_score: ownScoreValue,
      winning_score: winningScoreValue,
      leirdue_result_url: leirdueResultUrl.trim() || null,
      equipment_weapon_id: equipmentSelection.weaponId || null,
      equipment_ammunition_profile_id: equipmentSelection.ammunitionId || null,
      equipment_snapshot: equipmentSnapshot,
      notes: notes.trim() || null,
    }).select("id").single();
    if (error || !inserted) {
      setErr(userFacingSaveError(error, "Could not save this result right now. Try again when online."));
      setSaving(false);
      return;
    }
    await recordAnalyticsEvent(supabase, "result_created_manual", { route: "/results/new", feature: "manual_result", discipline, sessionId: inserted.id, metadata: { targetCount: totalTargets } });
    const applied = await applySelectedTemplate(inserted.id);
    setSaving(false);
    const params = new URLSearchParams();
    if (!applied) params.set("templateApplyFailed", "result");
    if (ownScoreValue !== null) params.set("resultSaved", "1");
    const query = params.toString();
    router.push(`/sessions/${inserted.id}${query ? `?${query}` : ""}`);
  }

  return (
    <main>
      <form className="card" onSubmit={save}>
        <p className="eyebrow">Competition</p>
        <h2>Register competition</h2>
        <p>Start with the basics. You can add posts, targets, misses, equipment and analysis afterward.</p>
        <ContextualHelpCard storageKey="manual-result">Use this when you only want to save a result quickly without detailed target logging.</ContextualHelpCard>
        <label>Competition name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competition name" required />
        <div className="row">
          <div><label>Date</label><input value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" required /></div>
          <div><label>Discipline</label><select value={discipline} onChange={(e) => setDiscipline(e.target.value)} required>{disciplineOptions.map((option) => (<option key={option}>{option}</option>))}</select></div>
        </div>
        <label>Shooting ground</label>
        <input value={shootingGround} onChange={(e) => setShootingGround(e.target.value)} placeholder="Optional" />
        <label>Leirdue.net result link</label>
        <input value={leirdueResultUrl} onChange={(e) => setLeirdueResultUrl(e.target.value)} placeholder="Paste optional Leirdue.net result URL" type="url" />
        <details className="detailAccordion">
          <summary><span>Add result now</span></summary>
          <div className="detailAccordionBody">
            <p className="small muted">Optional. Leave blank if the final result is not known yet.</p>
            <div className="row">
              <div><label>Total targets</label><input value={totalTargets} onChange={(e) => setTotalTargets(e.target.value)} type="number" min="1" inputMode="numeric" /></div>
              <div><label>Own score</label><input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} type="number" min="0" inputMode="numeric" /></div>
            </div>
            <label>Winning score</label>
            <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} type="number" min="0" inputMode="numeric" />
          </div>
        </details>
        <details className="detailAccordion">
          <summary><span>Advanced details</span></summary>
          <div className="detailAccordionBody">
            <EquipmentUsedSelector value={equipmentSelection} onChange={(selection, snapshot) => { setEquipmentSelection(selection); setEquipmentSnapshot(snapshot); }} />
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </details>
        <CompetitionTemplateSuggestions
          metadata={{ name, competitionDate, shootingGround, discipline, targetCount: suggestionTargetCount }}
          candidates={suggestions.candidates}
          loading={suggestions.loading}
          error={suggestions.error}
          onFind={suggestions.findCandidates}
          canFind={suggestions.canFind}
            searchKey={suggestions.searchKey}
          onUse={(candidate) => setSelectedTemplateCandidate(candidate)}
          selectedCandidateId={selectedTemplateCandidate?.id}
          applyingCandidateId={applyingTemplate ? selectedTemplateCandidate?.id : undefined}
          isApplying={applyingTemplate}
        />
        {selectedTemplateCandidate && (
          <div className="subcard selectedTemplateNotice">
            <p><strong>Selected setup:</strong> {selectedTemplateCandidate.name}</p>
            <button type="button" className="secondary" onClick={() => setSelectedTemplateCandidate(null)} disabled={saving || applyingTemplate}>Remove selected setup</button>
          </div>
        )}
        {applyMessage && <div className="warning">{applyMessage}</div>}
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button disabled={saving || applyingTemplate}>{saving || applyingTemplate ? "Saving..." : "Save and continue"}</button>
          <Link className="button secondary" href="/log-competition">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
