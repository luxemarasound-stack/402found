export interface HallucinationSignal {
  type: string;
  text: string;
  reason: string;
}

export interface DetectionResult {
  score: number;
  verdict: "low" | "medium" | "high";
  signals: HallucinationSignal[];
  sentence_count: number;
  flagged_count: number;
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
