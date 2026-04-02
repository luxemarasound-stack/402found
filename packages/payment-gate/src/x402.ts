import { X402Config, PaymentRequirement, PaymentGateConfig } from "./types.js";

const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_TX_AGE_MS = 5 * 60 * 1000;

export function getX402Config(): X402Config {
  return {
    rpcUrl: process.env.CHAIN_RPC_URL ?? "https://mainnet.base.org",
    walletAddress: process.env.WALLET_ADDRESS ?? "",
    usdcContract:
      process.env.USDC_CONTRACT ??
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    paymentAmount: process.env.PAYMENT_AMOUNT ?? "0.005",
    chainId: process.env.CHAIN_ID ?? "8453",
  };
}

export async function verifyX402Payment(txHash: string): Promise<boolean> {
  const { rpcUrl, walletAddress, usdcContract } = getX402Config();

  if (!walletAddress) {
    console.error("WALLET_ADDRESS not configured");
    return false;
  }

  try {
    const receiptRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 1,
      }),
    });

    const receiptData = (await receiptRes.json()) as { result: any };
    const receipt = receiptData.result;
    if (!receipt || receipt.status !== "0x1") return false;

    const validLog = receipt.logs?.some((log: any) => {
      if (log.address.toLowerCase() !== usdcContract.toLowerCase())
        return false;
      if (log.topics[0] !== TRANSFER_EVENT_TOPIC) return false;
      const recipient = "0x" + log.topics[2].slice(26);
      return recipient.toLowerCase() === walletAddress.toLowerCase();
    });

    if (!validLog) return false;

    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [receipt.blockNumber, false],
        id: 2,
      }),
    });

    const blockData = (await blockRes.json()) as { result: any };
    const block = blockData.result;
    if (!block) return false;

    const blockTimestamp = parseInt(block.timestamp, 16) * 1000;
    const age = Date.now() - blockTimestamp;
    return age <= MAX_TX_AGE_MS;
  } catch (err: any) {
    console.error("Payment verification error:", err.message);
    return false;
  }
}

export function getPaymentRequirement(
  config: PaymentGateConfig
): PaymentRequirement {
  const x402 = getX402Config();
  return {
    scheme: "exact",
    network: `eip155:${x402.chainId}`,
    maxAmountRequired: String(
      Math.round(parseFloat(x402.paymentAmount) * 1_000_000)
    ),
    asset: x402.usdcContract,
    payTo: x402.walletAddress,
    resource: config.resource,
    description: config.description,
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
    outputSchema: {
      input: { type: "http", method: "POST" },
      output: { type: "object" },
    },
  };
}
