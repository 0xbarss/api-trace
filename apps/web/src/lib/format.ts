/**
 * Formats an ISO timestamp as a short relative label such as "5m ago".
 * Returns "unknown" when the timestamp cannot be parsed.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";

  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Extracts the pathname from a URL or path. Falls back to the raw input when it
 * cannot be parsed, and to `fallback` when no URL was recorded.
 */
export function safePathname(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url;
  }
}
