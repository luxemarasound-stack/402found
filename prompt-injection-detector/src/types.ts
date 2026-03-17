export interface InjectionPattern {
  type: string;
  matched: string;
  reason: string;
}

export interface DetectionResult {
  injectionDetected: boolean;
  confidence: number;
  patterns: InjectionPattern[];
  recommendation: "block" | "warn" | "pass";
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
