"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DISCIPLINE_OPTIONS, isCompactDiscipline, isOrdinaryLeirduesti } from "@/lib/disciplines";
import { normalizeDisciplines, prioritizedDisciplineOptions, type ShooterProfile } from "@/lib/profile";
import { defaultStartPlateForShooter, getSchemeOptions, plateRotation } from "@/lib/fitasc/schemes";
import { EquipmentUsedSelector } from "@/app/components/EquipmentUsedSelector";
import { supabase } from "@/lib/supabase/client";
import { type EquipmentSelection } from "@/lib/equipment/logSnapshots";
import { userFacingSaveError } from "@/lib/userFacingErrors";
import { CompetitionTemplateSuggestions, type CompetitionTemplateCandidate } from "@/app/components/CompetitionTemplateSuggestions";
import { useCompetitionTemplateCandidates } from "@/lib/competitionTemplates/useCompetitionTemplateCandidates";
import { postFormatOptions } from "@/lib/targets/postSetupState";

type CourseSetup = {
  courseNumber: number;
  scheme: number | null;
  shooterNumber: number;
  startPlate: number;
};

type SessionCourseInsert = {
  session_id: string;
  course_number: number;
  fitasc_scheme: number | null;
  shooter_number: number | null;
  start_plate: number | null;
};

function makeCourses(count: number, old: CourseSetup[]) {
  return Array.from({ length: count }, (_, i) =>
    old[i]
      ? { ...old[i], courseNumber: i + 1 }
      : { courseNumber: i + 1, scheme: null, shooterNumber: 1, startPlate: 1 },
  );
}


export default function NewSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSessionType = searchParams.get("type") === "competition" ? "Competition" : "Training";
  const schemes = useMemo(() => getSchemeOptions(), []);
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [sessionType, setSessionType] = useState(initialSessionType);
  const [format, setFormat] = useState("Inline");
  const [count, setCount] = useState(3);
  const [courses, setCourses] = useState<CourseSetup[]>(makeCourses(3, []));
  const [sporttrapStand, setSporttrapStand] = useState(1);
  const [sporttrapSeriesCount, setSporttrapSeriesCount] = useState(1);
  const [leirduestiPostCount, setLeirduestiPostCount] = useState(5);
  const [targetsPerPost, setTargetsPerPost] = useState("10");
  const [defaultPostFormat, setDefaultPostFormat] = useState("5 pairs");
  const [competitionDate, setCompetitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [shootingGround, setShootingGround] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTemplateCandidate, setSelectedTemplateCandidate] = useState<CompetitionTemplateCandidate | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [myDisciplines, setMyDisciplines] = useState<string[]>([]);
  const [equipmentSelection, setEquipmentSelection] = useState<EquipmentSelection>({ weaponId: "", ammunitionId: "", includeChokes: true });
  const [equipmentSnapshot, setEquipmentSnapshot] = useState<any>(null);
  const disciplineOptions = useMemo(
    () => prioritizedDisciplineOptions(DISCIPLINE_OPTIONS, myDisciplines),
    [myDisciplines],
  );
  const suggestionTargetCount = isCompactDiscipline(discipline)
    ? count * 25
    : discipline === "Sporttrap"
      ? sporttrapSeriesCount * 25
      : isOrdinaryLeirduesti(discipline)
        ? leirduestiPostCount * (Number(targetsPerPost) || 0)
        : null;
  const suggestions = useCompetitionTemplateCandidates({ name, competitionDate, shootingGround, discipline, targetCount: suggestionTargetCount });

  useEffect(() => { setSelectedTemplateCandidate(null); }, [discipline, competitionDate, name, shootingGround, suggestionTargetCount]);

  async function applySelectedTemplate(sessionId: string) {
    if (!selectedTemplateCandidate) return true;
    if (selectedTemplateCandidate.discipline !== discipline) {
      setApplyMessage("The selected setup no longer matches this discipline. The competition was saved without it.");
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
      setApplyMessage(error.message?.includes("empty competition") ? "This setup can only be applied to a new, empty competition." : "The competition was saved, but the shared setup could not be applied. You can continue without it.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    let active = true;

    async function loadPreferredDisciplines() {
      const { data: userData } = await supabase.auth.getUser();
      if (!active || !userData.user) return;

      const { data } = await supabase
        .from("shooter_profiles")
        .select("my_disciplines")
        .eq("user_id", userData.user.id)
        .maybeSingle<Pick<ShooterProfile, "my_disciplines">>();

      if (active) setMyDisciplines(normalizeDisciplines(data?.my_disciplines));
    }

    loadPreferredDisciplines();

    return () => {
      active = false;
    };
  }, []);

  function setCourseCount(n: number) {
    setCount(n);
    setCourses((c) => makeCourses(n, c));
  }

  function updateCourse(i: number, update: Partial<CourseSetup>) {
    setCourses((c) => c.map((x, idx) => (idx === i ? { ...x, ...update } : x)));
  }

  function setPostCount(n: number) {
    setLeirduestiPostCount(n);
    setCount(n);
    setCourses((c) => makeCourses(n, c));
  }

  async function save() {
    setErr("");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const isCompak = isCompactDiscipline(discipline);
    const isSporttrap = discipline === "Sporttrap";
    const isLeirduesti = isOrdinaryLeirduesti(discipline);
    const targetsPerPostNumber = Number(targetsPerPost) || 10;
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        user_id: u.user.id,
        name: name.trim() || "Unnamed session",
        discipline,
        session_type: sessionType,
        shooting_format: isCompak ? format : isSporttrap ? "Sporttrap" : isLeirduesti ? "Post-based" : null,
        course_count: isCompak ? count : isSporttrap ? 1 : isLeirduesti ? leirduestiPostCount : null,
        sporttrap_series_count: isSporttrap ? sporttrapSeriesCount : null,
        total_targets: isCompak ? count * 25 : isSporttrap ? sporttrapSeriesCount * 25 : isLeirduesti ? leirduestiPostCount * targetsPerPostNumber : null,
        post_count: isLeirduesti ? leirduestiPostCount : null,
        targets_per_post: isLeirduesti ? targetsPerPostNumber : null,
        default_post_format: isLeirduesti ? defaultPostFormat : null,
        competition_date: competitionDate || null,
        shooting_ground: shootingGround.trim() || null,
        own_score: ownScore === "" ? null : Number(ownScore),
        winning_score: winningScore === "" ? null : Number(winningScore),
        leirdue_result_url: leirdueResultUrl.trim() || null,
        equipment_weapon_id: equipmentSelection.weaponId || null,
        equipment_ammunition_profile_id: equipmentSelection.ammunitionId || null,
        equipment_snapshot: equipmentSnapshot,
      })
      .select("id")
      .single();

    if (error || !session) {
      setErr(userFacingSaveError(error, "Could not save this shooting log right now. Try again when online."));
      setSaving(false);
      return;
    }

    if (selectedTemplateCandidate) {
      const applied = await applySelectedTemplate(session.id);
      router.push(`/sessions/${session.id}${applied ? "" : "?templateApplyFailed=session"}`);
      return;
    }

    if (isCompak || isSporttrap || isLeirduesti) {
      const rows: SessionCourseInsert[] = isSporttrap
        ? [
            {
              session_id: session.id,
              course_number: 1,
              fitasc_scheme: null,
              shooter_number: sporttrapStand,
              start_plate: null,
            },
          ]
        : (isLeirduesti ? makeCourses(leirduestiPostCount, courses) : courses).map((course) => ({
            session_id: session.id,
            course_number: course.courseNumber,
            fitasc_scheme: isCompak ? course.scheme : null,
            shooter_number: isCompak && format === "Squad" ? course.shooterNumber : null,
            start_plate: isCompak && format === "Squad" ? course.startPlate : null,
          }));
      const { error: courseError } = await supabase.from("session_courses").insert(rows);
      if (courseError) {
        setErr(userFacingSaveError(courseError, "Could not save the course setup right now. Try again when online."));
        setSaving(false);
        return;
      }
    }

    router.push(`/sessions/${session.id}`);
  }

  return (
    <main>
      <div className="card">
        <h2>New shooting log</h2>
        <p className="small muted">Need a multi-shooter post score sheet instead? <Link href="/training-score-sheets/new">Open Training Score Sheet</Link>.</p>
        <label>Session name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
        <label>Date</label>
        <input className="compactDateInput" value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" />
        <label>Shooting ground</label>
        <input value={shootingGround} onChange={(e) => setShootingGround(e.target.value)} placeholder="Kismul, Karmøy, Stavanger..." />
        <label>Leirdue.net result URL</label>
        <input
          value={leirdueResultUrl}
          onChange={(e) => setLeirdueResultUrl(e.target.value)}
          placeholder="https://www.leirdue.net/..."
          type="url"
        />
        <div className="row">
          <div>
            <label>Discipline</label>
            <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
              {disciplineOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Session type</label>
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
              <option>Training</option>
              <option>Competition</option>
            </select>
          </div>
        </div>
        {(sessionType === "Competition" || ownScore || winningScore) && (
          <div className="subcard">
            <h3>Competition result</h3>
            <p className="small muted">Own score is optional if you log all misses. Winning score is needed for performance percentage.</p>
            <div className="row">
              <div>
                <label>Own score</label>
                <input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} type="number" min="0" inputMode="numeric" />
              </div>
              <div>
                <label>Winning score</label>
                <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} type="number" min="0" inputMode="numeric" />
              </div>
            </div>
          </div>
        )}


        <EquipmentUsedSelector
          value={equipmentSelection}
          onChange={(selection, snapshot) => { setEquipmentSelection(selection); setEquipmentSnapshot(snapshot); }}
        />
        {discipline === "Sporttrap" && (
          <div className="subcard">
            <h3>Sporttrap setup</h3>
            <p className="small muted">Each 25-target series uses the fixed Sporttrap program. Total targets: {sporttrapSeriesCount * 25}.</p>
            <label>Number of 25-target series</label>
            <select value={sporttrapSeriesCount} onChange={(e) => setSporttrapSeriesCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label>Shooter / stand number</label>
            <select value={sporttrapStand} onChange={(e) => setSporttrapStand(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {isOrdinaryLeirduesti(discipline) && (
          <div className="subcard">
            <h3>Leirduesti setup</h3>
            <p className="small muted">Standard leirduesti is often 5 pairs per post, normally 10 targets, but this can be adjusted. Total targets: {leirduestiPostCount * (Number(targetsPerPost) || 0)}.</p>
            <div className="row">
              <div>
                <label>Number of posts</label>
                <select value={leirduestiPostCount} onChange={(e) => setPostCount(Number(e.target.value))}>
                  {[4, 5, 6, 7, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Targets per post</label>
                <input value={targetsPerPost} onChange={(e) => setTargetsPerPost(e.target.value)} type="number" min="1" inputMode="numeric" />
              </div>
            </div>
            <label>Default post format</label>
            <select value={defaultPostFormat} onChange={(e) => setDefaultPostFormat(e.target.value)}>
              {postFormatOptions(defaultPostFormat).map((format) => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </div>
        )}
        {isCompactDiscipline(discipline) && (
          <>
            <div className="row">
              <div>
                <label>Number of courses/layouts</label>
                <select value={count} onChange={(e) => setCourseCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Shooting format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option>Inline</option>
                  <option>Squad</option>
                </select>
              </div>
            </div>
            <h3>Courses</h3>
            {courses.map((course, i) => (
              <div className="subcard" key={course.courseNumber}>
                <h3>Course {course.courseNumber}</h3>
                <label>FITASC scheme</label>
                <select
                  value={course.scheme ?? ""}
                  onChange={(e) => updateCourse(i, { scheme: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Unknown / set later</option>
                  {schemes.map((option) => (
                    <option key={option.scheme} value={option.scheme}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {format === "Squad" && (
                  <>
                    <div className="row">
                      <div>
                        <label>Shooter number</label>
                        <select
                          value={course.shooterNumber}
                          onChange={(e) => {
                            const shooterNumber = Number(e.target.value);
                            updateCourse(i, { shooterNumber, startPlate: defaultStartPlateForShooter(shooterNumber) });
                          }}
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Starting plate</label>
                        <select value={course.startPlate} onChange={(e) => updateCourse(i, { startPlate: Number(e.target.value) })}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="small muted">Rotation: {plateRotation(course.startPlate).join(" → ")}</p>
                  </>
                )}
              </div>
            ))}
          </>
        )}
        {sessionType === "Competition" && (
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
        )}
        {selectedTemplateCandidate && (
          <div className="subcard selectedTemplateNotice">
            <p><strong>Selected setup:</strong> {selectedTemplateCandidate.name}</p>
            <button type="button" className="secondary" onClick={() => setSelectedTemplateCandidate(null)} disabled={saving || applyingTemplate}>Remove selected setup</button>
          </div>
        )}
        {applyMessage && <div className="warning">{applyMessage}</div>}
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button onClick={save} disabled={saving || applyingTemplate}>
            {saving || applyingTemplate ? "Saving..." : "Save shooting log"}
          </button>
          <button className="secondary" onClick={() => router.push("/dashboard")}>
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
