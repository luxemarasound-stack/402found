export interface LoopDetectionResult {
  looped: boolean;
  loop_count: number;
  agent_id: string;
  tool_name: string;
  window_seconds: number;
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
  outputSchema: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
}

export interface IdempotencyEntry {
  result: unknown;
  created_at: number;
}
