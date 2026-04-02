export interface PaymentGateConfig {
  serviceName: string;
  price: number;
  description: string;
  resource: string;
}

export interface X402Config {
  rpcUrl: string;
  walletAddress: string;
  usdcContract: string;
  paymentAmount: string;
  chainId: string;
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

export interface VerifyResult {
  valid: boolean;
  method: "stripe" | "x402" | null;
  error?: string;
  statusCode: number;
  body?: Record<string, unknown>;
}
