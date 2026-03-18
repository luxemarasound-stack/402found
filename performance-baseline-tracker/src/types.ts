export type AlertLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Sample {
  input: string;
  output: string;
  latencyMs: number;
  tokenCount: number;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BaselineSnapshot {
  id: string;
  agentId: string;
  version: string;
  createdAt: string;
  sampleCount: number;
  metrics: BaselineMetrics;
}

export interface BaselineMetrics {
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokenCount: number;
  avgOutputLength: number;
  errorRate: number;
  outputFingerprints: string[];
}

export interface DriftScore {
  overall: number;
  latencyDrift: number;
  tokenDrift: number;
  outputLengthDrift: number;
  semanticDrift: number;
  errorRateDrift: number;
}

export interface DriftReport {
  agentId: string;
  baselineVersion: string;
  comparedAt: string;
  sampleCount: number;
  driftScore: DriftScore;
  alertLevel: AlertLevel;
  degradations: string[];
  recommendation: string;
  currentMetrics: BaselineMetrics;
  baselineMetrics: BaselineMetrics;
}

export interface TrendPoint {
  timestamp: string;
  overallDrift: number;
  latencyDrift: number;
  tokenDrift: number;
  semanticDrift: number;
  alertLevel: AlertLevel;
}

export interface TrendReport {
  agentId: string;
  baselineVersion: string;
  period: string;
  points: TrendPoint[];
  avgDrift: number;
  maxDrift: number;
  alertCount: { none: number; low: number; medium: number; high: number; critical: number };
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  outputSchema: { input: Record<string, unknown>; output: Record<string, unknown> };
}
