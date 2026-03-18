import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  AlertLevel, BaselineMetrics, BaselineSnapshot, DriftReport, DriftScore,
  Sample, TrendPoint, TrendReport,
} from "./types.js";

const DB_PATH = process.env.DB_PATH ?? "./baselines.db";
let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS baselines (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sample_count INTEGER NOT NULL,
      metrics TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_baselines_agent ON baselines(agent_id);

    CREATE TABLE IF NOT EXISTS samples (
      id TEXT PRIMARY KEY,
      baseline_id TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT NOT NULL,
      latency_ms REAL NOT NULL,
      token_count INTEGER NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL,
      FOREIGN KEY (baseline_id) REFERENCES baselines(id)
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      baseline_id TEXT NOT NULL,
      compared_at TEXT NOT NULL,
      sample_count INTEGER NOT NULL,
      drift_score TEXT NOT NULL,
      alert_level TEXT NOT NULL,
      current_metrics TEXT NOT NULL,
      degradations TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comparisons_agent ON comparisons(agent_id);
    CREATE INDEX IF NOT EXISTS idx_comparisons_time ON comparisons(compared_at);
  `);
}

// --- Fingerprinting & Similarity ---

function fingerprint(text: string): string {
  // Normalized token-based fingerprint for semantic comparison
  const tokens = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 2)
    .sort();
  // Use sorted unique tokens as fingerprint
  return [...new Set(tokens)].join("|");
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split("|"));
  const setB = new Set(b.split("|"));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function cosineSimilarity(a: string, b: string): number {
  // TF-based cosine similarity
  const tokensA = a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(t => t.length > 1);
  const tokensB = b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(t => t.length > 1);

  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const t of tokensA) freqA.set(t, (freqA.get(t) ?? 0) + 1);
  for (const t of tokensB) freqB.set(t, (freqB.get(t) ?? 0) + 1);

  const allTokens = new Set([...freqA.keys(), ...freqB.keys()]);
  let dot = 0, magA = 0, magB = 0;
  for (const t of allTokens) {
    const va = freqA.get(t) ?? 0;
    const vb = freqB.get(t) ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function semanticSimilarity(textA: string, textB: string): number {
  const j = jaccardSimilarity(fingerprint(textA), fingerprint(textB));
  const c = cosineSimilarity(textA, textB);
  // Weighted blend: cosine captures frequency, jaccard captures vocabulary overlap
  return 0.6 * c + 0.4 * j;
}

// --- Stats helpers ---

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function calcMetrics(samples: { output: string; latencyMs: number; tokenCount: number; isError: boolean; fp: string }[]): BaselineMetrics {
  const n = samples.length;
  if (n === 0) return { avgLatencyMs: 0, p95LatencyMs: 0, avgTokenCount: 0, avgOutputLength: 0, errorRate: 0, outputFingerprints: [] };

  const latencies = samples.map(s => s.latencyMs).sort((a, b) => a - b);
  const tokens = samples.map(s => s.tokenCount);
  const lengths = samples.map(s => s.output.length);
  const errors = samples.filter(s => s.isError).length;

  return {
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / n),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    avgTokenCount: Math.round(tokens.reduce((a, b) => a + b, 0) / n),
    avgOutputLength: Math.round(lengths.reduce((a, b) => a + b, 0) / n),
    errorRate: Math.round((errors / n) * 10000) / 10000,
    outputFingerprints: [...new Set(samples.map(s => s.fp))].slice(0, 50),
  };
}

// --- Public API ---

export function captureBaseline(agentId: string, version: string, samples: Sample[]): BaselineSnapshot {
  const d = getDb();
  const id = `bl_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();

  const processed = samples.map(s => ({
    output: s.output,
    latencyMs: s.latencyMs,
    tokenCount: s.tokenCount,
    isError: s.isError ?? false,
    fp: fingerprint(s.output),
  }));

  const metrics = calcMetrics(processed);

  d.prepare("INSERT INTO baselines (id, agent_id, version, created_at, sample_count, metrics) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, agentId, version, now, samples.length, JSON.stringify(metrics));

  const insertSample = d.prepare("INSERT INTO samples (id, baseline_id, input, output, latency_ms, token_count, is_error, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const tx = d.transaction(() => {
    for (let i = 0; i < samples.length; i++) {
      insertSample.run(
        `s_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        id, samples[i].input, samples[i].output, samples[i].latencyMs,
        samples[i].tokenCount, samples[i].isError ? 1 : 0, processed[i].fp
      );
    }
  });
  tx();

  return { id, agentId, version, createdAt: now, sampleCount: samples.length, metrics };
}

export function compareToBaseline(agentId: string, baselineVersion: string | undefined, samples: Sample[], sensitivity?: number): DriftReport {
  const d = getDb();
  const sens = Math.max(0.1, Math.min(5.0, sensitivity ?? 1.0));

  // Find baseline
  let baselineRow: any;
  if (baselineVersion) {
    baselineRow = d.prepare("SELECT * FROM baselines WHERE agent_id = ? AND version = ? ORDER BY created_at DESC LIMIT 1").get(agentId, baselineVersion);
  } else {
    baselineRow = d.prepare("SELECT * FROM baselines WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1").get(agentId);
  }

  if (!baselineRow) {
    return {
      agentId,
      baselineVersion: baselineVersion ?? "none",
      comparedAt: new Date().toISOString(),
      sampleCount: samples.length,
      driftScore: { overall: 0, latencyDrift: 0, tokenDrift: 0, outputLengthDrift: 0, semanticDrift: 0, errorRateDrift: 0 },
      alertLevel: "NONE",
      degradations: [],
      recommendation: "No baseline found. Capture a baseline first with capture_baseline.",
      currentMetrics: calcMetrics(samples.map(s => ({ output: s.output, latencyMs: s.latencyMs, tokenCount: s.tokenCount, isError: s.isError ?? false, fp: fingerprint(s.output) }))),
      baselineMetrics: { avgLatencyMs: 0, p95LatencyMs: 0, avgTokenCount: 0, avgOutputLength: 0, errorRate: 0, outputFingerprints: [] },
    };
  }

  const baselineMetrics: BaselineMetrics = JSON.parse(baselineRow.metrics);

  // Calculate current metrics
  const processed = samples.map(s => ({
    output: s.output,
    latencyMs: s.latencyMs,
    tokenCount: s.tokenCount,
    isError: s.isError ?? false,
    fp: fingerprint(s.output),
  }));
  const currentMetrics = calcMetrics(processed);

  // Get baseline samples for semantic comparison
  const baselineSamples = d.prepare("SELECT output FROM samples WHERE baseline_id = ?").all(baselineRow.id) as any[];

  // Calculate drift scores (0-100 each)
  const latencyDrift = calcPercentDrift(baselineMetrics.avgLatencyMs, currentMetrics.avgLatencyMs, sens);
  const tokenDrift = calcPercentDrift(baselineMetrics.avgTokenCount, currentMetrics.avgTokenCount, sens);
  const outputLengthDrift = calcPercentDrift(baselineMetrics.avgOutputLength, currentMetrics.avgOutputLength, sens);
  const errorRateDrift = calcErrorDrift(baselineMetrics.errorRate, currentMetrics.errorRate, sens);

  // Semantic drift: average similarity between current outputs and baseline outputs
  let semanticDrift = 0;
  if (baselineSamples.length > 0 && samples.length > 0) {
    let totalSim = 0;
    let comparisons = 0;
    for (const current of samples) {
      let bestSim = 0;
      for (const base of baselineSamples) {
        const sim = semanticSimilarity(current.output, base.output);
        if (sim > bestSim) bestSim = sim;
      }
      totalSim += bestSim;
      comparisons++;
    }
    const avgSim = comparisons > 0 ? totalSim / comparisons : 1;
    semanticDrift = Math.round((1 - avgSim) * 100 * sens);
  }
  semanticDrift = Math.min(100, semanticDrift);

  // Overall = weighted blend
  const overall = Math.min(100, Math.round(
    latencyDrift * 0.15 +
    tokenDrift * 0.15 +
    outputLengthDrift * 0.10 +
    semanticDrift * 0.40 +
    errorRateDrift * 0.20
  ));

  const driftScore: DriftScore = { overall, latencyDrift, tokenDrift, outputLengthDrift, semanticDrift, errorRateDrift };

  // Identify degradations
  const degradations: string[] = [];
  if (latencyDrift > 30) degradations.push(`Slower response time: ${currentMetrics.avgLatencyMs}ms vs baseline ${baselineMetrics.avgLatencyMs}ms (+${Math.round((currentMetrics.avgLatencyMs / Math.max(1, baselineMetrics.avgLatencyMs) - 1) * 100)}%)`);
  if (tokenDrift > 30) degradations.push(`Token usage change: ${currentMetrics.avgTokenCount} vs baseline ${baselineMetrics.avgTokenCount}`);
  if (outputLengthDrift > 30) degradations.push(`Output length change: ${currentMetrics.avgOutputLength} chars vs baseline ${baselineMetrics.avgOutputLength}`);
  if (semanticDrift > 25) degradations.push(`Semantic drift detected: output meaning has shifted (drift: ${semanticDrift}%)`);
  if (errorRateDrift > 20) degradations.push(`Error rate increased: ${(currentMetrics.errorRate * 100).toFixed(1)}% vs baseline ${(baselineMetrics.errorRate * 100).toFixed(1)}%`);

  // Alert level
  let alertLevel: AlertLevel;
  if (overall >= 80) alertLevel = "CRITICAL";
  else if (overall >= 60) alertLevel = "HIGH";
  else if (overall >= 40) alertLevel = "MEDIUM";
  else if (overall >= 20) alertLevel = "LOW";
  else alertLevel = "NONE";

  // Recommendation
  let recommendation: string;
  if (alertLevel === "CRITICAL") recommendation = "Investigate immediately. Significant quality degradation detected across multiple metrics. Consider rolling back to previous agent version.";
  else if (alertLevel === "HIGH") recommendation = "Prompt investigation needed. Quality drift exceeds acceptable thresholds. Review recent changes to prompts, models, or dependencies.";
  else if (alertLevel === "MEDIUM") recommendation = "Monitor closely. Moderate drift detected. If trend continues, consider retuning prompts or adjusting model parameters.";
  else if (alertLevel === "LOW") recommendation = "Continue monitoring. Minor drift within acceptable range. Normal operational variance.";
  else recommendation = "All metrics within baseline tolerance. No action required.";

  // Store comparison
  const compId = `cmp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();
  d.prepare("INSERT INTO comparisons (id, agent_id, baseline_id, compared_at, sample_count, drift_score, alert_level, current_metrics, degradations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(compId, agentId, baselineRow.id, now, samples.length, JSON.stringify(driftScore), alertLevel, JSON.stringify(currentMetrics), JSON.stringify(degradations));

  return {
    agentId,
    baselineVersion: baselineRow.version,
    comparedAt: now,
    sampleCount: samples.length,
    driftScore,
    alertLevel,
    degradations,
    recommendation,
    currentMetrics,
    baselineMetrics,
  };
}

function calcPercentDrift(baseline: number, current: number, sensitivity: number): number {
  if (baseline === 0 && current === 0) return 0;
  if (baseline === 0) return Math.min(100, 50 * sensitivity);
  const pctChange = Math.abs(current - baseline) / baseline;
  return Math.min(100, Math.round(pctChange * 100 * sensitivity));
}

function calcErrorDrift(baselineRate: number, currentRate: number, sensitivity: number): number {
  const diff = currentRate - baselineRate;
  if (diff <= 0) return 0;
  return Math.min(100, Math.round(diff * 500 * sensitivity));
}

export function getTrend(agentId: string, days: number): TrendReport {
  const d = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = d.prepare(
    "SELECT c.compared_at, c.drift_score, c.alert_level, b.version FROM comparisons c JOIN baselines b ON c.baseline_id = b.id WHERE c.agent_id = ? AND c.compared_at >= ? ORDER BY c.compared_at ASC"
  ).all(agentId, since) as any[];

  const points: TrendPoint[] = rows.map(r => {
    const ds = JSON.parse(r.drift_score);
    return {
      timestamp: r.compared_at,
      overallDrift: ds.overall,
      latencyDrift: ds.latencyDrift,
      tokenDrift: ds.tokenDrift,
      semanticDrift: ds.semanticDrift,
      alertLevel: r.alert_level,
    };
  });

  const alertCount = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const p of points) {
    const key = p.alertLevel.toLowerCase() as keyof typeof alertCount;
    if (key in alertCount) alertCount[key]++;
  }

  const drifts = points.map(p => p.overallDrift);
  const avgDrift = drifts.length > 0 ? Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length) : 0;
  const maxDrift = drifts.length > 0 ? Math.max(...drifts) : 0;

  const baselineVersion = rows.length > 0 ? rows[rows.length - 1].version : "none";

  return { agentId, baselineVersion, period: `${days}d`, points, avgDrift, maxDrift, alertCount };
}

export function listBaselines(agentId: string): BaselineSnapshot[] {
  const d = getDb();
  const rows = d.prepare("SELECT * FROM baselines WHERE agent_id = ? ORDER BY created_at DESC").all(agentId) as any[];
  return rows.map(r => ({
    id: r.id,
    agentId: r.agent_id,
    version: r.version,
    createdAt: r.created_at,
    sampleCount: r.sample_count,
    metrics: JSON.parse(r.metrics),
  }));
}
