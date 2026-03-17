export interface ProspectInput {
  url: string;
  capabilities?: string[];
  description?: string;
}

export interface AgentCard {
  spec_version: string;
  name: string;
  description: string;
  url: string;
  provider: { organization: string; url: string };
  capabilities: string[];
  endpoints: Record<string, string>;
  generated_by: string;
  [key: string]: unknown;
}

export interface ProspectResult {
  card: AgentCard;
  sources_checked: string[];
  hosting_upsell: {
    message: string;
    registry_url: string;
  };
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
