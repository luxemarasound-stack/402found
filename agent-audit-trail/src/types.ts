export interface AuditInput {
  agentId: string;
  action: string;
  timestamp: string;
  payload?: Record<string, unknown>;
  outcome?: string;
}

export interface AuditReceipt {
  receiptId: string;
  hmacSignature: string;
  timestamp: string;
  action: string;
  agentId: string;
  verified: true;
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
