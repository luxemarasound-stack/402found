export interface LeakSignal {
  type: string;
  match: string;
  context: string;
  confidence: "high" | "medium" | "low";
}

export interface SentinelResult {
  clean: boolean;
  leak_count: number;
  leaks: LeakSignal[];
  categories_found: string[];
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
