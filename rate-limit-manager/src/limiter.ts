import { RateLimitInput, RateLimitResult } from "./types.js";

interface WindowEntry {
  timestamps: number[];
  backoffLevel: number;
}

// In-memory sliding window tracker: key = "agentId:targetApi"
const windows = new Map<string, WindowEntry>();

// Periodic cleanup every 2 minutes — remove entries older than 2 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      windows.delete(key);
    }
  }
}, 120_000);

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const defaultRpm = parseInt(process.env.DEFAULT_RPM ?? "60", 10);
  const maxRpm = input.requestsPerMinute ?? defaultRpm;
  const key = `${input.agentId}:${input.targetApi}`;
  const now = Date.now();
  const windowMs = 60_000; // 1-minute sliding window

  // Get or create window entry
  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [], backoffLevel: 0 };
    windows.set(key, entry);
  }

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > now - windowMs);

  const currentCount = entry.timestamps.length;

  if (currentCount < maxRpm) {
    // Allowed — record this request
    entry.timestamps.push(now);
    // Reset backoff on successful request
    if (entry.backoffLevel > 0) {
      entry.backoffLevel = Math.max(0, entry.backoffLevel - 1);
    }

    return {
      allowed: true,
      queuePosition: 0,
      backoffStrategy: `${currentCount + 1}/${maxRpm} requests used in current window. No backoff needed.`,
    };
  }

  // Rate limited — calculate backoff
  entry.backoffLevel = Math.min(entry.backoffLevel + 1, 6); // max 6 levels
  const baseMs = 1000;
  const retryAfterMs = Math.min(baseMs * Math.pow(2, entry.backoffLevel - 1), 64_000);

  // Queue position: how many requests are queued (over limit)
  const queuePosition = currentCount - maxRpm + 1;

  // Calculate when the oldest request in the window will expire
  const oldestInWindow = entry.timestamps[0];
  const windowExpiry = oldestInWindow ? oldestInWindow + windowMs - now : retryAfterMs;
  const effectiveRetry = Math.max(retryAfterMs, windowExpiry);

  return {
    allowed: false,
    retryAfterMs: Math.round(effectiveRetry),
    queuePosition,
    backoffStrategy: `Exponential backoff level ${entry.backoffLevel}/6. Wait ${(effectiveRetry / 1000).toFixed(1)}s before retrying. ${currentCount}/${maxRpm} requests in current window.`,
  };
}
