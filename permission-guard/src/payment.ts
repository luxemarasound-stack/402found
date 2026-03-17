import { PaymentRequirement } from "./types.js";

function getConfig() {
  return {
    rpcUrl: process.env.CHAIN_RPC_URL ?? "https://mainnet.base.org",
    walletAddress: process.env.WALLET_ADDRESS ?? "",
    usdcContract: process.env.USDC_CONTRACT ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    paymentAmount: process.env.PAYMENT_AMOUNT ?? "0.002",
    chainId: process.env.CHAIN_ID ?? "8453",
  };
}

const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
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

  const validLog = receipt.logs?.some((log: any) => {
    if (log.address.toLowerCase() !== usdcContract.toLowerCase()) return false;
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
  if (Date.now() - blockTimestamp > MAX_TX_AGE_MS) return false;

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
    resource: "https://permission-guard.fly.dev/mcp",
    description: "Checks if an agent's requested action exceeds its defined scope. Returns allowed/denied with violation details and flags dangerous operations even when technically in scope.",
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        required: ["action", "resource", "scope"],
        properties: {
          action: { type: "string", description: "The action the agent wants to perform (e.g. read, write, delete, execute)" },
          resource: { type: "string", description: "The resource path being accessed (e.g. db/users, files/config/*)" },
          scope: {
            type: "array",
            description: "The agent's defined permission scope",
            items: {
              type: "object",
              properties: {
                resource: { type: "string", description: "Resource pattern (supports * and /* wildcards)" },
                actions: { type: "array", items: { type: "string" }, description: "Allowed actions on this resource" },
              },
            },
          },
        },
      },
      output: {
        type: "object",
        properties: {
          allowed: { type: "boolean" },
          violations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                resource: { type: "string" },
                reason: { type: "string" },
                severity: { type: "string", enum: ["warning", "denied"] },
              },
            },
          },
          checked_action: { type: "string" },
          checked_resource: { type: "string" },
          scope_size: { type: "integer" },
        },
      },
    },
  };
}
