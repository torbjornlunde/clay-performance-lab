export const DEFAULT_ROLLING_WINDOW_SIZE = 5;

function validWindowSize(windowSize: number) {
  return Math.max(1, Math.floor(windowSize));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateRollingAverage(values: number[], windowSize: number) {
  const size = validWindowSize(windowSize);

  return values.map((_, index) => {
    const windowValues = values.slice(Math.max(0, index - size + 1), index + 1);
    if (windowValues.length === 0) return null;
    return mean(windowValues);
  });
}

export function calculateRollingStdDev(values: number[], windowSize: number) {
  const size = validWindowSize(windowSize);

  return values.map((_, index) => {
    // Use the available trailing values until the full rolling window is filled.
    // This gives a useful consistency signal as soon as there are at least 2 scored competitions.
    const windowValues = values.slice(Math.max(0, index - size + 1), index + 1);
    if (windowValues.length < 2) return null;

    const average = mean(windowValues);
    const squaredDifferences = windowValues.map((value) => (value - average) ** 2);
    const sampleVariance = squaredDifferences.reduce((sum, value) => sum + value, 0) / (windowValues.length - 1);
    return Math.sqrt(sampleVariance);
  });
}
