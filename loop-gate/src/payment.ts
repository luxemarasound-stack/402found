import crypto from "node:crypto";
import { PaymentRequirement, IdempotencyEntry } from "./types.js";

function getConfig() {
  return {
    rpcUrl: process.env.CHAIN_RPC_URL ?? "https://mainnet.base.org",
    walletAddress: process.env.WALLET_ADDRESS ?? "",
    usdcContract: process.env.USDC_CONTRACT ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    paymentAmount: process.env.PAYMENT_AMOUNT ?? "0.005",
    chainId: process.env.CHAIN_ID ?? "8453",
  };
}

const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_TX_AGE_MS = 5 * 60 * 1000;

// --- Idempotency key store ---
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // cached results live 10 minutes
const idempotencyCache = new Map<string, IdempotencyEntry>();

// --- Used tx hashes (prevent replay) ---
const usedTxHashes = new Set<string>();

export function generateIdempotencyKey(): string {
  return `idk_${crypto.randomUUID()}`;
}

export function getCachedResult(key: string): unknown | undefined {
  const entry = idempotencyCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.created_at > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return undefined;
  }
  return entry.result;
}

export function cacheResult(key: string, result: unknown): void {
  idempotencyCache.set(key, { result, created_at: Date.now() });
}

export function isTxHashUsed(txHash: string): boolean {
  return usedTxHashes.has(txHash.toLowerCase());
}

export function markTxHashUsed(txHash: string): void {
  usedTxHashes.add(txHash.toLowerCase());
}

// Evict expired idempotency entries and old tx hashes periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.created_at > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}, 60_000).unref();

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
    resource: "https://loop-gate.fly.dev/mcp",
    description: "Clears the loop-detection state for an agent blocked by recursive tool-call loop detection, allowing it to resume. Requires x402 payment.",
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        properties: {
          agent_id: { type: "string", description: "The agent ID to reset" },
        },
        required: ["agent_id"],
      },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["reset"] },
          agent_id: { type: "string" },
          fingerprint_cleared: { type: "boolean" },
          message: { type: "string" },
        },
        required: ["status", "agent_id", "fingerprint_cleared", "message"],
      },
    },
  };
}
