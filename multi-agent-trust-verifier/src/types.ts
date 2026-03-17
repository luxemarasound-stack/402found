export interface TrustVerificationInput {
  requestingAgentId: string;
  targetAgentId: string;
  proposedAction: string;
  originalGoal: string;
  spendLimit?: number;
  proposedSpend?: number;
}

export interface TrustVerificationResult {
  authorized: boolean;
  trustScore: number;
  goalAlignmentScore: number;
  violations: string[];
  recommendation: "approve" | "deny" | "escalate";
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
