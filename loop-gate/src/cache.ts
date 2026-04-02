import { IdempotencyEntry } from "./types.js";

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // cached results live 10 minutes
const idempotencyCache = new Map<string, IdempotencyEntry>();
const usedTxHashes = new Set<string>();

export function getCachedResult(key: string): unknown | undefined {
  const entry = idempotencyCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.created_at > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return undefined;
  }
  return entry.result;
}

export function cacheResult(key: string, result: unknown): void {
  idempotencyCache.set(key, { result, created_at: Date.now() });
}

export function isTxHashUsed(txHash: string): boolean {
  return usedTxHashes.has(txHash.toLowerCase());
}

export function markTxHashUsed(txHash: string): void {
  usedTxHashes.add(txHash.toLowerCase());
}

// Evict expired idempotency entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.created_at > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}, 60_000).unref();
