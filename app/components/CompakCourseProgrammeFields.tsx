import { useId } from "react";
import { COMPAK_PROGRAMME_TYPES, getCompakConflict, getCompakProgrammeLabel, type CompakConflictResolution, type CompakProgrammeType } from "@/lib/fitasc/compakProgramme";
import { getExpectedPresentationRows } from "@/lib/fitasc/compakSchemes";

export type CompakProgrammeCourse = {
  scheme: number | null;
  rememberedProgramme: CompakProgrammeType | null;
  conflictResolution: CompakConflictResolution | null;
};

export function CompakCourseProgrammeFields({ course, schemes, onChange, allowUnknownFromExact = false }: {
  course: CompakProgrammeCourse;
  schemes: readonly { scheme: number; label: string }[];
  onChange: (update: Partial<CompakProgrammeCourse>) => void;
  allowUnknownFromExact?: boolean;
}) {
  const radioGroup = useId();
  const mode = course.scheme != null ? "exact" : course.rememberedProgramme ? "programme" : "unknown";
  const conflict = course.scheme && course.rememberedProgramme
    ? getCompakConflict(getExpectedPresentationRows(course.scheme), course.rememberedProgramme)
    : { conflicts: false, exactProgramme: null };
  const chooseMode = (next: string) => {
    if (next === "exact") onChange({ scheme: course.scheme ?? 1, conflictResolution: null });
    else if (next === "programme") onChange({ scheme: null, rememberedProgramme: course.rememberedProgramme ?? "five_singles", conflictResolution: null });
    else if (mode !== "exact" || allowUnknownFromExact || window.confirm("Remove the exact scheme from this course? Existing scores and notes will stay unchanged.")) {
      onChange({ scheme: null, rememberedProgramme: null, conflictResolution: null });
    }
  };
  return <div className="compakProgrammeFields">
    <fieldset className="compakCompletenessChoice">
      <legend>Programme detail</legend>
      {[['exact','Exact scheme'], ['programme','Programme type'], ['unknown','Unknown']].map(([value, label]) =>
        <label key={value}><input type="radio" name={radioGroup} checked={mode === value} onChange={() => chooseMode(value)} />{label}</label>
      )}
    </fieldset>
    {mode === "exact" && <><label>FITASC scheme</label><select value={course.scheme ?? ""} onChange={(event) => onChange({ scheme: Number(event.target.value), conflictResolution: null })}>{schemes.map((option) => <option key={option.scheme} value={option.scheme}>{option.label}</option>)}</select></>}
    {mode === "programme" && <><label>Programme type</label><select value={course.rememberedProgramme ?? ""} onChange={(event) => onChange({ rememberedProgramme: event.target.value as CompakProgrammeType, conflictResolution: null })}>{COMPAK_PROGRAMME_TYPES.map((programme) => <option key={programme.code} value={programme.code}>{programme.label}</option>)}</select><p className="small muted">Specific targets can be added later.</p></>}
    {mode === "unknown" && <p className="small muted">Programme detail can be added later.</p>}
    {conflict.conflicts && <div className="warning compakConflict"><strong>Programme discrepancy</strong><p className="small">Scheme {course.scheme} is {getCompakProgrammeLabel(conflict.exactProgramme)}, but you remembered {getCompakProgrammeLabel(course.rememberedProgramme)}. Choose before saving.</p><label><input type="radio" checked={course.conflictResolution === "exact_authoritative"} onChange={() => onChange({ conflictResolution: "exact_authoritative" })} />Use exact scheme as authoritative</label><label><input type="radio" checked={course.conflictResolution === "remembered_discrepancy"} onChange={() => onChange({ conflictResolution: "remembered_discrepancy" })} />Keep remembered programme as a discrepancy</label></div>}
  </div>;
}
