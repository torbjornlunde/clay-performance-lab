import { JEGERTRAP_NORDISK_TRAP } from "../disciplines";

export type FixedTrapProgramId = "jegertrap" | "nordisk-trap";

export type FixedTrapRotationStrategy = {
  type: "cyclic";
};

export type FixedTrapProgramDefinition = {
  id: FixedTrapProgramId | (string & {});
  label: string;
  discipline: string;
  standCount: number;
  targetsPerSeries: number;
  rotation: FixedTrapRotationStrategy;
};

export const FIXED_TRAP_PROGRAM_IDS = {
  JEGERTRAP: "jegertrap",
  NORDISK_TRAP: "nordisk-trap",
} as const;

export const JEGERTRAP_PROGRAM: FixedTrapProgramDefinition = {
  id: FIXED_TRAP_PROGRAM_IDS.JEGERTRAP,
  label: "Jegertrap",
  discipline: JEGERTRAP_NORDISK_TRAP,
  standCount: 5,
  targetsPerSeries: 25,
  rotation: { type: "cyclic" },
};

export const NORDISK_TRAP_PROGRAM: FixedTrapProgramDefinition = {
  id: FIXED_TRAP_PROGRAM_IDS.NORDISK_TRAP,
  label: "Nordisk trap",
  discipline: JEGERTRAP_NORDISK_TRAP,
  standCount: 5,
  targetsPerSeries: 25,
  rotation: { type: "cyclic" },
};

export const FIXED_TRAP_PROGRAMS = [JEGERTRAP_PROGRAM, NORDISK_TRAP_PROGRAM] as const;

export function validateTrapProgram(program: FixedTrapProgramDefinition): void {
  if (!program || typeof program !== "object") {
    throw new Error("Fixed trap program must be an object.");
  }
  if (!program.id || typeof program.id !== "string") {
    throw new Error("Fixed trap program requires a string id.");
  }
  if (!program.label || typeof program.label !== "string") {
    throw new Error("Fixed trap program requires a string label.");
  }
  if (!program.discipline || typeof program.discipline !== "string") {
    throw new Error("Fixed trap program requires a string discipline.");
  }
  if (!Number.isInteger(program.standCount) || program.standCount < 1) {
    throw new Error("Fixed trap program standCount must be a positive integer.");
  }
  if (!Number.isInteger(program.targetsPerSeries) || program.targetsPerSeries < 1) {
    throw new Error("Fixed trap program targetsPerSeries must be a positive integer.");
  }
  if (!program.rotation || program.rotation.type !== "cyclic") {
    throw new Error("Fixed trap program requires a supported rotation strategy.");
  }
}

function assertPublicStand(program: FixedTrapProgramDefinition, startStand: number): void {
  if (!Number.isInteger(startStand) || startStand < 1 || startStand > program.standCount) {
    throw new Error(`Start stand must be an integer from 1 to ${program.standCount}.`);
  }
}

function assertPublicShot(program: FixedTrapProgramDefinition, shotNumber: number): void {
  if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > program.targetsPerSeries) {
    throw new Error(`Shot number must be an integer from 1 to ${program.targetsPerSeries}.`);
  }
}

/**
 * Resolves the actual stand for one shot in a fixed trap program.
 * Public inputs are 1-based: startStand 1 is the first stand, and shotNumber 1 is the first shot.
 */
export function resolveTrapStand(program: FixedTrapProgramDefinition, startStand: number, shotNumber: number): number {
  validateTrapProgram(program);
  assertPublicStand(program, startStand);
  assertPublicShot(program, shotNumber);

  if (program.rotation.type === "cyclic") {
    return ((startStand - 1 + shotNumber - 1) % program.standCount) + 1;
  }

  throw new Error("Unsupported fixed trap rotation strategy.");
}

/**
 * Builds the complete 1-based stand sequence for a single series in a fixed trap program.
 */
export function buildTrapStandSequence(program: FixedTrapProgramDefinition, startStand: number): number[] {
  validateTrapProgram(program);
  assertPublicStand(program, startStand);

  return Array.from({ length: program.targetsPerSeries }, (_, index) => resolveTrapStand(program, startStand, index + 1));
}
