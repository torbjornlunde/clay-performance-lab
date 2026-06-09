const DEFAULT_SAVE_MESSAGE = "Could not save right now. Your data is saved locally. Try again when online.";
const DEFAULT_LOAD_MESSAGE = "Could not load this right now. Check your connection and try again.";
const DEFAULT_DELETE_MESSAGE = "Could not delete this right now. Check your connection and try again.";

export function technicalErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function userFacingSaveError(error?: unknown, fallback = DEFAULT_SAVE_MESSAGE) {
  const message = technicalErrorMessage(error).toLowerCase();
  if (message.includes("auth") || message.includes("jwt") || message.includes("permission")) {
    return "Could not save because your session or permissions need attention. Sign in again and retry.";
  }
  return fallback;
}

export function userFacingLoadError(error?: unknown, fallback = DEFAULT_LOAD_MESSAGE) {
  const message = technicalErrorMessage(error).toLowerCase();
  if (message.includes("auth") || message.includes("jwt") || message.includes("permission")) {
    return "Could not load this because your session or permissions need attention. Sign in again and retry.";
  }
  return fallback;
}

export function userFacingDeleteError(error?: unknown, fallback = DEFAULT_DELETE_MESSAGE) {
  const message = technicalErrorMessage(error).toLowerCase();
  if (message.includes("auth") || message.includes("jwt") || message.includes("permission")) {
    return "Could not delete this because your session or permissions need attention. Sign in again and retry.";
  }
  return fallback;
}
