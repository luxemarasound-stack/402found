export interface Permission {
  resource: string;
  actions: string[];
}

export interface Violation {
  action: string;
  resource: string;
  reason: string;
  severity: "warning" | "denied";
}

export interface GuardResult {
  allowed: boolean;
  violations: Violation[];
  checked_action: string;
  checked_resource: string;
  scope_size: number;
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
