export type CompakMachineLabel = "A" | "B" | "C" | "D" | "E" | "F" | "Unknown";
export type CompakCellValue = CompakMachineLabel | `${Exclude<CompakMachineLabel, "Unknown">}+${Exclude<CompakMachineLabel, "Unknown">}`;

export type VerifiedCompakScheme = {
  schemeNumber: number;
  plates: CompakCellValue[][];
};

/**
 * Verified FITASC Compak A-F machine data imported from source material.
 *
 * Keep this list limited to exact, verified source data. Scheme numbers not
 * present here are still selectable by the app, but their machine labels are
 * intentionally returned as Unknown until the official A-F sequence is imported.
 */
export const verifiedCompakSchemes: Record<number, VerifiedCompakScheme> = {};
