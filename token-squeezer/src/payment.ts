import { PaymentRequirement } from "./types.js";

// All chain-specific values from environment — never hardcoded
function getConfig() {
  return {
    rpcUrl: process.env.CHAIN_RPC_URL ?? "https://mainnet.base.org",
    walletAddress: process.env.WALLET_ADDRESS ?? "",
    usdcContract: process.env.USDC_CONTRACT ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    paymentAmount: process.env.PAYMENT_AMOUNT ?? "0.001",
    chainId: process.env.CHAIN_ID ?? "8453",
  };
}

// ERC-20 Transfer event topic
const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Reject transactions older than 5 minutes to prevent replay attacks
const MAX_TX_AGE_MS = 5 * 60 * 1000;

export async function verifyPayment(txHash: string): Promise<boolean> {
  const { rpcUrl, walletAddress, usdcContract } = getConfig();

  if (!walletAddress) {
    console.error("WALLET_ADDRESS not configured");
    return false;
  }

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

  // Verify a USDC transfer log exists to our wallet
  const validLog = receipt.logs?.some((log: any) => {
    if (log.address.toLowerCase() !== usdcContract.toLowerCase()) return false;
    if (log.topics[0] !== TRANSFER_EVENT_TOPIC) return false;
    // topics[2] is the recipient (padded to 32 bytes)
    const recipient = "0x" + log.topics[2].slice(26);
    return recipient.toLowerCase() === walletAddress.toLowerCase();
  });

  if (!validLog) return false;

  // Anti-replay: reject if block is too old
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
  if (age > MAX_TX_AGE_MS) return false;

  return true;
}

export function getPaymentRequirement(): PaymentRequirement {
  const config = getConfig();
  return {
    scheme: "exact",
    network: `eip155:${config.chainId}`,
    maxAmountRequired: String(Math.round(parseFloat(config.paymentAmount) * 1_000_000)),
    asset: config.usdcContract,
    payTo: config.walletAddress,
    resource: "https://token-squeezer.fly.dev/mcp",
    description: "Compresses text to reduce LLM token usage",
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        properties: {
          text: { type: "string" },
          target_tokens: { type: "number" },
        },
        required: ["text"],
      },
      output: {
        type: "object",
        properties: {
          compressed: { type: "string" },
          original_tokens: { type: "number" },
          compressed_tokens: { type: "number" },
          savings_pct: { type: "number" },
        },
      },
    },
  };
}
