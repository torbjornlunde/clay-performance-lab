import { appBuildLabel } from "@/lib/appBuildInfo";

type TrainingFeedbackContext = {
  title?: string;
  discipline?: string;
  sessionDate?: string;
  location?: string;
  url?: string;
  userAgent?: string;
};

export const TRAINING_SCORE_SHEET_BETA_NOTE =
  "Beta test: Use this for training/testing only. Do not use as official competition scoring.";

export const TRAINING_SCORE_SHEET_QUICK_START_STEPS = [
  "Create training",
  "Add shooters",
  "Choose discipline",
  "Start Field Mode",
  "Log Hit/Miss",
  "Review results",
  "Copy/share results",
  "Send feedback if something breaks",
];

export function buildTrainingScoreSheetFeedback(context: TrainingFeedbackContext) {
  const lines = [
    "Training Score Sheet feedback",
    "",
    "App area: Training Score Sheet",
    `Discipline: ${context.discipline || "Not selected"}`,
    `Score sheet: ${context.title?.trim() || "Untitled / archive"}`,
    `Date: ${context.sessionDate || "Not set"}`,
    `Location: ${context.location?.trim() || "Not set"}`,
    `URL: ${context.url || "Not available"}`,
    `Browser/device: ${context.userAgent || "Not available"}`,
    `App version/build: ${appBuildLabel()}`,
    "",
    "What happened?",
    "",
    "What did you expect?",
    "",
    "Screenshot attached?",
  ];

  return lines.join("\n");
}
