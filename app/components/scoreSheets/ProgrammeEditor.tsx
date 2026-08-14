"use client";

import { editProgramme, presentationTargetCount, programmeAreaTargetCount, programmeLabel, programmeTargetCount, validateProgramme, type ProgrammePresentationType, type ScoreSheetProgramme } from "@/lib/scoreSheets/programmes";

const TYPES: Array<{ value: Exclude<ProgrammePresentationType, "unknown">; label: string }> = [{ value: "single", label: "Single" }, { value: "report_pair", label: "Report pair" }, { value: "simultaneous_pair", label: "Simultaneous pair" }];
const newPresentation = () => ({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`, type: "single" as const, firstMachine: null, secondMachine: null });

export default function ProgrammeEditor({ programme, disabled, onChange, onReset }: { programme: ScoreSheetProgramme; disabled: boolean; onChange: (value: ScoreSheetProgramme) => void; onReset: () => void }) {
  const validation = validateProgramme(programme);
  const update = (change: (draft: ScoreSheetProgramme) => void) => onChange(editProgramme(programme, change));
  return <details className="subcard scoreSheetProgramme">
    <summary><span><strong>{programmeLabel(programme)}</strong><br /><span className="small muted">{programme.areas.length} areas · {programmeTargetCount(programme)} physical targets</span></span><span>Edit programme</span></summary>
    <p className="small muted">This is the programme snapshot attached to this Score Sheet. Changes never alter its built-in template.</p>
    {!validation.valid && <div className="warning small" role="alert"><strong>Programme incomplete</strong><ul>{validation.errors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {programme.areas.map((area, areaIndex) => <section className="programmeArea" key={area.areaNumber}>
      <div className="sectionHeader compactSectionHeader"><strong>Area {area.areaNumber}</strong><span className="small muted">{programmeAreaTargetCount(area)} targets</span></div>
      {area.presentations.map((presentation, presentationIndex) => <div className="programmePresentation" key={presentation.id}>
        <label>Presentation<select value={presentation.type === "unknown" ? "single" : presentation.type} disabled={disabled} onChange={(event) => update((draft) => { const item = draft.areas[areaIndex].presentations[presentationIndex]; item.type = event.target.value as ProgrammePresentationType; if (item.type === "single") item.secondMachine = null; })}>{TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
        <label>First machine<select value={presentation.firstMachine || ""} disabled={disabled} onChange={(event) => update((draft) => { draft.areas[areaIndex].presentations[presentationIndex].firstMachine = event.target.value || null; })}><option value="">Choose</option>{programme.machineVocabulary.map((machine) => <option key={machine}>{machine}</option>)}</select></label>
        {presentationTargetCount(presentation.type) === 2 && <label>Second machine<select value={presentation.secondMachine || ""} disabled={disabled} onChange={(event) => update((draft) => { draft.areas[areaIndex].presentations[presentationIndex].secondMachine = event.target.value || null; })}><option value="">Choose</option>{programme.machineVocabulary.map((machine) => <option key={machine}>{machine}</option>)}</select></label>}
        <div className="btns"><button type="button" className="secondary smallButton" disabled={disabled || presentationIndex === 0} onClick={() => update((draft) => { const items = draft.areas[areaIndex].presentations; [items[presentationIndex - 1], items[presentationIndex]] = [items[presentationIndex], items[presentationIndex - 1]]; })}>Move up</button><button type="button" className="secondary smallButton" disabled={disabled} onClick={() => update((draft) => { draft.areas[areaIndex].presentations.splice(presentationIndex, 1); })}>Remove</button></div>
      </div>)}
      <button type="button" className="secondary smallButton" disabled={disabled} onClick={() => update((draft) => { draft.areas[areaIndex].presentations.push(newPresentation()); })}>Add presentation</button>
    </section>)}
    <div className="btns"><button type="button" className="secondary" disabled={disabled} onClick={() => update((draft) => { draft.areas.push({ areaNumber: draft.areas.length + 1, presentations: [] }); })}>Add area</button>{programme.templateId && <button type="button" className="secondary" disabled={disabled || !programme.modified} onClick={onReset}>Reset to template</button>}</div>
  </details>;
}
