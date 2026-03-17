export type Format = "json" | "csv" | "xml" | "yaml" | "markdown" | "html" | "toml";

export interface ConvertResult {
  converted: string;
  from: Format;
  to: Format;
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
