const READ_RETRY_DELAY_MS = 30_000;

type DurableReadState = {
  unavailableUntil?: number;
};

function stateFor(key: string): DurableReadState {
  const globalState = globalThis as typeof globalThis & Record<string, DurableReadState | undefined>;
  return (globalState[key] ??= {});
}

/**
 * Avoid making every navigation wait on a database that has just failed. Writes still attempt
 * the database and report their own errors; this guard is only for read-time page hydration.
 */
export function canReadDurableData(key: string): boolean {
  return (stateFor(key).unavailableUntil ?? 0) <= Date.now();
}

/** Mark a failed read for a short cooldown so the in-memory demo remains responsive. */
export function markDurableReadUnavailable(key: string): void {
  stateFor(key).unavailableUntil = Date.now() + READ_RETRY_DELAY_MS;
}

/** Keep an unavailable database from holding a route transition open indefinitely. */
export function durableFetchOptions(): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(3_000) };
}
