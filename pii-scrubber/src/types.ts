export type PIIType =
  | "email"
  | "ssn"
  | "phone"
  | "credit_card"
  | "ip_address"
  | "api_key"
  | "street_address";

export interface ScrubResult {
  scrubbed: string;
  items_removed: number;
  types_found: PIIType[];
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
