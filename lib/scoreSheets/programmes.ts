import { getExpectedPresentationRows, type CompakSchemeRow } from "../fitasc/compakSchemes";
import { resizeShootersForSetup, setupReductionWouldTrimData, trimTargetResults, type TargetResultMap } from "./core";

export type ProgrammePresentationType = "single" | "report_pair" | "simultaneous_pair" | "unknown";
export type ProgrammePresentation = { id: string; type: ProgrammePresentationType; firstMachine: string | null; secondMachine: string | null };
export type ProgrammeArea = { areaNumber: number; presentations: ProgrammePresentation[] };
export type ScoreSheetProgramme = {
  schemaVersion: 1;
  snapshotId: string;
  name: string;
  family: "compak_menu" | "sporttrap_menu" | "custom";
  source: "built_in" | "custom" | "legacy";
  sourceOrganisation: string | null;
  sourceVersion: string | null;
  templateId: string | null;
  modified: boolean;
  machineVocabulary: string[];
  areas: ProgrammeArea[];
};
export type ProgrammeSetup = { numberOfPosts: number; targetsPerPost: number; expectedTargetsByPost: number[] | null };
type ProgrammeShooter = { localId: string; scores: number[] };

const id = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `programme-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const presentationTargetCount = (type: ProgrammePresentationType) => type === "report_pair" || type === "simultaneous_pair" ? 2 : 1;
export const programmeAreaTargetCount = (area: ProgrammeArea) => area.presentations.reduce((sum, item) => sum + presentationTargetCount(item.type), 0);
export const programmeTargetCount = (programme: ScoreSheetProgramme) => programme.areas.reduce((sum, area) => sum + programmeAreaTargetCount(area), 0);
export const cloneProgramme = (programme: ScoreSheetProgramme): ScoreSheetProgramme => structuredClone(programme);
export function deriveProgrammeSetup(programme: ScoreSheetProgramme): ProgrammeSetup { const counts = programme.areas.map(programmeAreaTargetCount); const targetsPerPost = Math.max(...counts, 1); return { numberOfPosts: counts.length, targetsPerPost, expectedTargetsByPost: counts.every((count) => count === targetsPerPost) ? null : counts }; }
export function programmeSetupMatches(programme: ScoreSheetProgramme, setup: ProgrammeSetup) { const derived = deriveProgrammeSetup(programme); return derived.numberOfPosts === setup.numberOfPosts && derived.targetsPerPost === setup.targetsPerPost && JSON.stringify(derived.expectedTargetsByPost) === JSON.stringify(setup.expectedTargetsByPost); }
export function reconcileProgrammeStructure<T extends ProgrammeShooter>(options: { programme: ScoreSheetProgramme; shooters: T[]; targetResults: TargetResultMap; allowDestructiveReduction: boolean }) { const setup = deriveProgrammeSetup(options.programme); const targetLimits = setup.expectedTargetsByPost ?? setup.targetsPerPost; const requiresConfirmation = setupReductionWouldTrimData({ shooters: options.shooters, targetResults: options.targetResults, nextPostCount: setup.numberOfPosts, nextTargetsPerPost: targetLimits }); if (requiresConfirmation && !options.allowDestructiveReduction) return { accepted: false as const, requiresConfirmation, setup, shooters: options.shooters, targetResults: options.targetResults }; return { accepted: true as const, requiresConfirmation, setup, shooters: resizeShootersForSetup(options.shooters, setup.numberOfPosts, targetLimits), targetResults: trimTargetResults(options.targetResults, setup.numberOfPosts, targetLimits) }; }

function mappedType(value: string | null): ProgrammePresentationType {
  if (value === "single" || value === "report_pair") return value;
  if (value === "simo_pair" || value === "simultaneous_pair") return "simultaneous_pair";
  return "unknown";
}

export function compakProgrammeTemplate(scheme: number, rows: CompakSchemeRow[] = []): ScoreSheetProgramme {
  const areas = Array.from({ length: 5 }, (_, index) => {
    const areaNumber = index + 1;
    const concrete = rows.filter((row) => row.scheme_number === scheme && row.plate_number === areaNumber).sort((a, b) => a.event_number - b.event_number);
    const source = concrete.length ? concrete : getExpectedPresentationRows(scheme).map((presentation) => ({ presentation, first_machine: null, second_machine: null }));
    return { areaNumber, presentations: source.map((row) => ({ id: id(), type: mappedType(row.presentation), firstMachine: row.first_machine, secondMachine: row.second_machine })) };
  });
  return { schemaVersion: 1, snapshotId: id(), name: `FITASC Scheme ${scheme}`, family: "compak_menu", source: "built_in", sourceOrganisation: "FITASC", sourceVersion: "Current CPL reference", templateId: `fitasc-compak-current-${scheme}`, modified: false, machineVocabulary: ["A", "B", "C", "D", "E", "F"], areas };
}

export function sporttrapProgrammeTemplate(): ScoreSheetProgramme {
  const types: ProgrammePresentationType[] = ["single", "report_pair", "simultaneous_pair"];
  return { schemaVersion: 1, snapshotId: id(), name: "Sporttrap structural starter", family: "sporttrap_menu", source: "built_in", sourceOrganisation: null, sourceVersion: "V1 structure", templateId: "sporttrap-structural-v1", modified: false, machineVocabulary: ["A", "B", "C", "D", "E"], areas: Array.from({ length: 5 }, (_, index) => ({ areaNumber: index + 1, presentations: types.map((type) => ({ id: id(), type, firstMachine: null, secondMachine: null })) })) };
}

export function customProgramme(areaCount = 1): ScoreSheetProgramme {
  return { schemaVersion: 1, snapshotId: id(), name: "Custom programme", family: "custom", source: "custom", sourceOrganisation: null, sourceVersion: null, templateId: null, modified: false, machineVocabulary: ["A", "B", "C", "D", "E", "F"], areas: Array.from({ length: areaCount }, (_, index) => ({ areaNumber: index + 1, presentations: [{ id: id(), type: "single", firstMachine: null, secondMachine: null }] })) };
}

export function snapshotProgramme(template: ScoreSheetProgramme): ScoreSheetProgramme { return { ...cloneProgramme(template), snapshotId: id(), modified: false }; }
export function editProgramme(programme: ScoreSheetProgramme, edit: (draft: ScoreSheetProgramme) => void) { const draft = cloneProgramme(programme); edit(draft); draft.modified = draft.source !== "custom"; return draft; }
export function validateProgramme(programme: ScoreSheetProgramme) {
  const errors: string[] = [];
  if (!programme.areas.length) errors.push("Add at least one shooting area.");
  for (const area of programme.areas) {
    if (!area.presentations.length) errors.push(`Area ${area.areaNumber} has no presentations.`);
    for (const presentation of area.presentations) {
      if (presentation.type === "unknown") continue;
      if (!presentation.firstMachine) errors.push(`Area ${area.areaNumber} has a presentation without a first machine.`);
      else if (!programme.machineVocabulary.includes(presentation.firstMachine)) errors.push(`Area ${area.areaNumber} has a presentation with an invalid first machine.`);
      if (presentation.type !== "single" && !presentation.secondMachine) errors.push(`Area ${area.areaNumber} has a pair without a second machine.`);
      else if (presentation.type !== "single" && presentation.secondMachine && !programme.machineVocabulary.includes(presentation.secondMachine)) errors.push(`Area ${area.areaNumber} has a pair with an invalid second machine.`);
      else if (presentation.type !== "single" && presentation.firstMachine === presentation.secondMachine) errors.push(`Area ${area.areaNumber} has a pair using the same machine twice.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function programmeLabel(programme: ScoreSheetProgramme) {
  return [programme.name, programme.sourceVersion, programme.source === "custom" ? "Custom" : programme.modified ? "Modified" : null].filter(Boolean).join(" · ");
}

export function compakSchemeNumberFromProgramme(programme: ScoreSheetProgramme | null | undefined): number | null { const match = programme?.templateId?.match(/^fitasc-compak-.*-(\d+)$/); const scheme = Number(match?.[1]); return Number.isInteger(scheme) && scheme >= 1 && scheme <= 40 ? scheme : null; }
export function programmeAsCompakRows(programme: ScoreSheetProgramme): CompakSchemeRow[] {
  const schemeNumber = compakSchemeNumberFromProgramme(programme) ?? 0;
  return programme.areas.flatMap((area) => area.presentations.map((presentation, index) => ({ scheme_number: schemeNumber, plate_number: area.areaNumber, event_number: index + 1, presentation: presentation.type === "simultaneous_pair" ? "simo_pair" : presentation.type, first_machine: presentation.firstMachine, second_machine: presentation.secondMachine, is_verified: false })));
}
