import { LoopDetectionResult } from "./types.js";

// Window in which repeated calls count as a loop
const WINDOW_MS = 30_000;
const LOOP_THRESHOLD = 3;

// Counting bloom filter approximation — tracks agent+tool call frequency
// Uses multiple hash positions per key to reduce false positives
const FILTER_SIZE = 4096;
const NUM_HASHES = 3;

interface FilterEntry {
  counts: Uint16Array;
  timestamps: Float64Array;
}

// One filter per agent so agents don't interfere with each other
const agents = new Map<string, FilterEntry>();

// Simple non-crypto hash — FNV-1a variant, fast and well-distributed
function fnv1a(str: string, seed: number): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % FILTER_SIZE;
}

function getPositions(toolName: string): number[] {
  return Array.from({ length: NUM_HASHES }, (_, i) => fnv1a(toolName, i * 0x9e3779b9));
}

function getOrCreateFilter(agentId: string): FilterEntry {
  let entry = agents.get(agentId);
  if (!entry) {
    entry = {
      counts: new Uint16Array(FILTER_SIZE),
      timestamps: new Float64Array(FILTER_SIZE),
    };
    agents.set(agentId, entry);
  }
  return entry;
}

// Evict stale entries to keep memory bounded
function evictStale(filter: FilterEntry, now: number): void {
  for (let i = 0; i < FILTER_SIZE; i++) {
    if (filter.counts[i] > 0 && now - filter.timestamps[i] > WINDOW_MS) {
      filter.counts[i] = 0;
      filter.timestamps[i] = 0;
    }
  }
}

export function checkLoop(agentId: string, toolName: string): LoopDetectionResult {
  const now = Date.now();
  const filter = getOrCreateFilter(agentId);
  evictStale(filter, now);

  const positions = getPositions(toolName);

  // Increment all hash positions for this tool
  for (const pos of positions) {
    filter.counts[pos]++;
    filter.timestamps[pos] = now;
  }

  // Minimum count across positions = conservative estimate of true call count
  const minCount = Math.min(...positions.map((p) => filter.counts[p]));

  return {
    looped: minCount >= LOOP_THRESHOLD,
    loop_count: minCount,
    agent_id: agentId,
    tool_name: toolName,
    window_seconds: WINDOW_MS / 1000,
  };
}

export function resetAgent(agentId: string): void {
  agents.delete(agentId);
}

// Prevent unbounded memory growth — drop agents with no recent activity
setInterval(() => {
  const now = Date.now();
  for (const [id, filter] of agents) {
    const hasRecent = filter.timestamps.some((t) => t > 0 && now - t < WINDOW_MS);
    if (!hasRecent) agents.delete(id);
  }
}, 60_000).unref();
