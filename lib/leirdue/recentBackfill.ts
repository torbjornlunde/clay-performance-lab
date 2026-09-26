export async function runBoundedLeirdueBatches<T>(runBatch: () => Promise<T>, options: { maxBatches?: number; startBudgetMs?: number; now?: () => number; shouldContinue?: (batch: T) => boolean } = {}) {
  const { maxBatches = 4, startBudgetMs = 90_000, now = Date.now, shouldContinue = () => true } = options;
  const startedAt = now();
  const batches: T[] = [];
  while (batches.length < maxBatches && (batches.length === 0 || now() - startedAt < startBudgetMs)) {
    const batch = await runBatch();
    batches.push(batch);
    if (!shouldContinue(batch)) break;
  }
  return batches;
}
