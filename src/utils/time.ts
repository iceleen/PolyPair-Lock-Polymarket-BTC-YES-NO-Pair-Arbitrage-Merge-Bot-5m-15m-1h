export function floorToWindowStart(nowSec: number, windowSeconds: number): number {
  return Math.floor(nowSec / windowSeconds) * windowSeconds;
}

export function msToExpiry(closeTsMs: number, now = Date.now()): number {
  return Math.max(0, closeTsMs - now);
}

export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
