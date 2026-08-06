import { useId } from "react";
import { COMPAK_PROGRAMME_TYPES, getCompakConflict, getCompakProgrammeLabel, selectCompakProgramme, selectCompakScheme, transitionCompakDetailMode, type CompakConflictResolution, type CompakDetailMode, type CompakProgrammeType } from "@/lib/fitasc/compakProgramme";
import { getExpectedPresentationRows } from "@/lib/fitasc/compakSchemes";

export type CompakProgrammeCourse = {
  scheme: number | null;
  detailMode: CompakDetailMode;
  rememberedProgramme: CompakProgrammeType | null;
  conflictResolution: CompakConflictResolution | null;
};

export function CompakCourseProgrammeFields({ course, schemes, onChange }: {
  course: CompakProgrammeCourse;
  schemes: readonly { scheme: number; label: string }[];
  onChange: (update: Partial<CompakProgrammeCourse>) => void;
}) {
  const radioGroup = useId();
  const mode = course.detailMode;
  const conflict = course.scheme && course.rememberedProgramme
    ? getCompakConflict(getExpectedPresentationRows(course.scheme), course.rememberedProgramme)
    : { state: "not_applicable" as const, exactProgramme: null };
  const chooseMode = (next: CompakDetailMode) => {
    let transition = transitionCompakDetailMode(course, next);
    if (transition.requiresConfirmation) {
      const confirmed = window.confirm("Remove the exact FITASC scheme from this course? Unrelated scores, notes and session data will stay unchanged.");
      if (!confirmed) return;
      transition = transitionCompakDetailMode(course, next, true);
    }
    onChange(transition.course);
  };
  return <div className="compakProgrammeFields">
    <fieldset className="compakCompletenessChoice">
      <legend>Programme detail</legend>
      {([['exact','Exact scheme'], ['programme','Programme type'], ['unknown','Unknown']] as const).map(([value, label]) =>
        <label key={value}><input type="radio" name={radioGroup} checked={mode === value} onChange={() => chooseMode(value)} />{label}</label>
      )}
    </fieldset>
    {mode === "exact" && <><label>FITASC scheme</label><select value={course.scheme ?? ""} onChange={(event) => onChange(selectCompakScheme(course, event.target.value))}><option value="">Choose FITASC scheme</option>{schemes.map((option) => <option key={option.scheme} value={option.scheme}>{option.label}</option>)}</select></>}
    {mode === "programme" && <><label>Programme type</label><select value={course.rememberedProgramme ?? ""} onChange={(event) => onChange(selectCompakProgramme(course, event.target.value))}><option value="">Choose programme type</option>{COMPAK_PROGRAMME_TYPES.map((programme) => <option key={programme.code} value={programme.code}>{programme.label}</option>)}</select><p className="small muted">Specific targets can be added later.</p></>}
    {mode === "unknown" && <p className="small muted">Programme detail can be added later.</p>}
    {conflict.state === "unclassifiable" && <div className="error">This exact scheme programme cannot be classified. Review the scheme before saving.</div>}
    {conflict.state === "conflict" && <div className="warning compakConflict"><strong>Programme discrepancy</strong><p className="small">Scheme {course.scheme} is {getCompakProgrammeLabel(conflict.exactProgramme)}, but you remembered {getCompakProgrammeLabel(course.rememberedProgramme)}. Choose before saving.</p><label><input type="radio" checked={course.conflictResolution === "exact_authoritative"} onChange={() => onChange({ conflictResolution: "exact_authoritative" })} />Use exact scheme as authoritative</label><label><input type="radio" checked={course.conflictResolution === "remembered_discrepancy"} onChange={() => onChange({ conflictResolution: "remembered_discrepancy" })} />Keep remembered programme as a discrepancy</label></div>}
  </div>;
}
