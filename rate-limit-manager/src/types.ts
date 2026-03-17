export interface RateLimitInput {
  agentId: string;
  targetApi: string;
  requestsPerMinute?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  queuePosition?: number;
  backoffStrategy: string;
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
