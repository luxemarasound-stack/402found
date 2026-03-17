export interface CostCheckInput {
  agentId: string;
  action: string;
  tokenCount?: number;
  apiCalls?: number;
}

export interface CostBreakdown {
  tokens: number;
  calls: number;
}

export interface CostCheckResult {
  agentId: string;
  sessionCost: number;
  budgetStatus: "ok" | "warning" | "exceeded";
  breakdown: CostBreakdown;
  recommendation: string;
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
