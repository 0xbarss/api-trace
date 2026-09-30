export interface RunRate {
  perSecond: number | null;
  etaSeconds: number | null;
}

/**
 * Derives throughput and estimated time remaining from progress so far.
 * Returns nulls until at least one test has completed.
 */
export function computeRunRate(
  completed: number,
  total: number,
  elapsedSeconds: number
): RunRate {
  if (elapsedSeconds <= 0 || completed <= 0) {
    return { perSecond: null, etaSeconds: null };
  }
  const perSecond = completed / elapsedSeconds;
  const remaining = Math.max(0, total - completed);
  return {
    perSecond,
    etaSeconds: remaining === 0 ? 0 : Math.ceil(remaining / perSecond),
  };
}

export function formatDuration(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}
