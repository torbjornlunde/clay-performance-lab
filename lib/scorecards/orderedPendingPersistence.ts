export type OrderedPersistenceResult = { ok: true } | { ok: false; error: string };
export type OrderedPersistenceRecord = { sessionId: string; clientImportId: string; localReviewRevision?: number };
export type OrderedPersistenceStatus = "saving" | "saved" | "failed";
export function createOrderedPendingPersistence<T extends OrderedPersistenceRecord>(options: {
  write: (record: T) => Promise<void>;
  delete: (sessionId: string) => Promise<void>;
  currentRecord: () => T | null;
  remember: (record: T | null) => void;
  onStatus?: (status: OrderedPersistenceStatus, message?: string) => void;
}) {
  let chain = Promise.resolve();
  let generation = 0;
  let revision = 0;
  let latestStatusOperation = 0;
  const deleted = new Set<string>();
  function nextRevision() { revision += 1; return revision; }
  function noteRevision(value?: number) { if (value && value > revision) revision = value; }
  function invalidate() { generation += 1; return generation; }
  function enqueueWrite(record: T, opts: { generation?: number; commit?: boolean; status?: boolean } = {}): Promise<OrderedPersistenceResult> {
    const opGeneration = opts.generation ?? generation;
    const snapshot = record;
    const show = opts.status !== false;
    const statusOperation = show ? ++latestStatusOperation : latestStatusOperation;
    if (show) options.onStatus?.("saving");
    const run = async (): Promise<OrderedPersistenceResult> => {
      if (opGeneration !== generation) return { ok: false, error: "Skipped stale pending write." };
      const current = options.currentRecord();
      if (deleted.has(snapshot.clientImportId)) return { ok: false, error: "Skipped write for a deleted scorecard import." };
      if (current && current.clientImportId !== snapshot.clientImportId) return { ok: false, error: "Skipped write for an older scorecard image." };
      try {
        await options.write(snapshot);
        if (opts.commit !== false) options.remember(snapshot);
        if (show && statusOperation === latestStatusOperation) options.onStatus?.("saved");
        return { ok: true };
      } catch (e: any) {
        const error = e?.message || "Could not save review on this device.";
        if (show && statusOperation === latestStatusOperation) options.onStatus?.("failed", error);
        return { ok: false, error };
      }
    };
    const queued = chain.catch(() => undefined).then(run);
    chain = queued.then(() => undefined, () => undefined);
    return queued;
  }
  function enqueueDelete(sessionId: string, clientImportId: string | null): Promise<OrderedPersistenceResult> {
    const opGeneration = invalidate();
    const run = async (): Promise<OrderedPersistenceResult> => {
      if (opGeneration !== generation) return { ok: false, error: "Skipped stale pending delete." };
      try {
        await options.delete(sessionId);
        if (clientImportId) deleted.add(clientImportId);
        if (!clientImportId || options.currentRecord()?.clientImportId === clientImportId) options.remember(null);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || "Could not delete pending scorecard." };
      }
    };
    const queued = chain.catch(() => undefined).then(run);
    chain = queued.then(() => undefined, () => undefined);
    return queued;
  }
  async function flush() { await chain.catch(() => undefined); }
  return { enqueueWrite, enqueueDelete, flush, invalidate, nextRevision, noteRevision, generation: () => generation };
}
