import { getExpectedPresentationRows, type CompakSchemeRow } from "../fitasc/compakSchemes";

export type CompakRotationMode = "waiting_shooter" | "continuous_rotation";
export type CompakSequenceTarget = { targetNumber: number; targetInSequence: number; machine: string | null };
export type CompakSequence = { sequenceIndex: number; standNumber: number; eventNumber: number; presentation: string | null; firstMachine: string | null; secondMachine: string | null; hasSchemeData: boolean; targets: CompakSequenceTarget[] };
export const COMPAK_DEFAULT_STANDS = 5;
export const COMPAK_TARGETS_PER_STAND = 5;

export function compakPhysicalTargetCount(presentation: string | null | undefined) {
  const normalized = presentation?.toLowerCase();
  return normalized === "report_pair" || normalized === "simo_pair" ? 2 : 1;
}

export function buildCompakStandSequences(schemeNumber: number, standNumber: number, schemeRows: CompakSchemeRow[]): CompakSequence[] {
  const rowsForStand = schemeRows.filter((row) => row.scheme_number === schemeNumber && row.plate_number === standNumber).sort((a, b) => a.event_number - b.event_number);
  const hasSchemeData = rowsForStand.length > 0;
  const sourceRows = hasSchemeData ? rowsForStand : getExpectedPresentationRows(schemeNumber).map((presentation, index) => ({ scheme_number: schemeNumber, plate_number: standNumber, event_number: index + 1, presentation, first_machine: null, second_machine: null, is_verified: null }));
  let nextTargetNumber = 1;
  const sequences = sourceRows.flatMap((row) => {
    if (nextTargetNumber > COMPAK_TARGETS_PER_STAND) return [];
    const targetCount = Math.min(compakPhysicalTargetCount(row.presentation), COMPAK_TARGETS_PER_STAND - nextTargetNumber + 1);
    const targets = Array.from({ length: targetCount }, (_, index) => ({ targetNumber: nextTargetNumber + index, targetInSequence: index + 1, machine: index === 0 ? row.first_machine : row.second_machine }));
    nextTargetNumber += targetCount;
    return [{ sequenceIndex: 0, standNumber, eventNumber: row.event_number, presentation: row.presentation, firstMachine: row.first_machine, secondMachine: row.second_machine, hasSchemeData, targets }];
  });
  while (nextTargetNumber <= COMPAK_TARGETS_PER_STAND) {
    sequences.push({ sequenceIndex: 0, standNumber, eventNumber: sequences.length + 1, presentation: "unknown", firstMachine: null, secondMachine: null, hasSchemeData: false, targets: [{ targetNumber: nextTargetNumber, targetInSequence: 1, machine: null }] });
    nextTargetNumber += 1;
  }
  return sequences;
}

export function plateRotation(start: number) {
  return Array.from({ length: COMPAK_DEFAULT_STANDS }, (_, index) => ((start - 1 + index) % COMPAK_DEFAULT_STANDS) + 1);
}

export function buildCompakRoundProgram(schemeNumber: number, startStand: number, schemeRows: CompakSchemeRow[]) {
  return plateRotation(startStand).flatMap((standNumber) => buildCompakStandSequences(schemeNumber, standNumber, schemeRows)).map((sequence, index) => ({ ...sequence, sequenceIndex: index }));
}

export function compakStartPlateForOrderNumber(orderNumber: number, rotationMode: CompakRotationMode = "waiting_shooter") {
  if (orderNumber >= 1 && orderNumber <= COMPAK_DEFAULT_STANDS) return orderNumber;
  return rotationMode === "continuous_rotation" ? ((Math.max(orderNumber, 1) - 1) % COMPAK_DEFAULT_STANDS) + 1 : 1;
}

export function orderedShootersForPost<T>(shooters: T[], postNumber: number) {
  if (shooters.length === 0) return shooters;
  const startIndex = (Math.max(postNumber, 1) - 1) % shooters.length;
  return shooters.slice(startIndex).concat(shooters.slice(0, startIndex));
}

export type CompakShootingMode = "Squad" | "Inline";
export function normalizeCompakShootingMode(value: string | null | undefined): CompakShootingMode {
  return value === "Inline" ? "Inline" : "Squad";
}
export function normalizeCompakRotationMode(value: string | null | undefined): CompakRotationMode {
  return value === "continuous_rotation" || value === "Continuous rotation" ? "continuous_rotation" : "waiting_shooter";
}
