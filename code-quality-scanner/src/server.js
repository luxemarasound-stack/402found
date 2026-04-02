import { createServer } from "node:http";
import { scanPython } from "./scanners/python.js";
import { scanJavaScript } from "./scanners/javascript.js";
import { scanPrompt } from "./scanners/prompt.js";
import { computeScore } from "./scoring.js";

const PORT = process.env.PORT || 8080;

// ---- x402 Payment Configuration ----
const PAYMENT_CONFIG = {
  rpcUrl: process.env.CHAIN_RPC_URL || "https://mainnet.base.org",
  walletAddress: process.env.WALLET_ADDRESS || "",
  usdcContract: process.env.USDC_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  paymentAmount: process.env.PAYMENT_AMOUNT || "0.05",
  chainId: process.env.CHAIN_ID || "8453",
};

const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_TX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function getPaymentRequirement() {
  return {
    scheme: "exact",
    network: `eip155:${PAYMENT_CONFIG.chainId}`,
    maxAmountRequired: String(Math.round(parseFloat(PAYMENT_CONFIG.paymentAmount) * 1_000_000)),
    asset: PAYMENT_CONFIG.usdcContract,
    payTo: PAYMENT_CONFIG.walletAddress,
    resource: "https://code-quality-scanner.402found.dev/scan",
    description: "Detects vibe-code anti-patterns in AI agent code. AST-powered analysis for Python, JavaScript, and LLM prompts.",
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        properties: {
          code: { type: "string", description: "Source code or prompt text to scan" },
          language: { type: "string", description: "python | javascript | prompt | auto (optional)" },
          filename: { type: "string", description: "Filename for language inference (optional)" },
        },
        required: ["code"],
      },
      output: {
        type: "object",
        properties: {
          qualityScore: { type: "number" },
          productionReady: { type: "string" },
          issueCount: { type: "object" },
          issues: { type: "array" },
        },
      },
    },
  };
}

async function verifyPayment(txHash) {
  const { rpcUrl, walletAddress, usdcContract } = PAYMENT_CONFIG;
  if (!walletAddress) return false;

  try {
    // Get transaction receipt
    const receiptRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [txHash], id: 1 }),
    });
    const { result: receipt } = await receiptRes.json();
    if (!receipt || receipt.status !== "0x1") return false;

    // Verify USDC Transfer event to our wallet
    const validLog = receipt.logs?.some((log) => {
      if (log.address.toLowerCase() !== usdcContract.toLowerCase()) return false;
      if (log.topics[0] !== TRANSFER_EVENT_TOPIC) return false;
      const recipient = "0x" + log.topics[2].slice(26);
      return recipient.toLowerCase() === walletAddress.toLowerCase();
    });
    if (!validLog) return false;

    // Anti-replay: reject transactions older than 5 minutes
    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBlockByNumber", params: [receipt.blockNumber, false], id: 2 }),
    });
    const { result: block } = await blockRes.json();
    if (!block) return false;

    const age = Date.now() - parseInt(block.timestamp, 16) * 1000;
    return age <= MAX_TX_AGE_MS;
  } catch (err) {
    console.error("Payment verification error:", err.message);
    return false;
  }
}

// Returns true if payment is valid or sends 402 and returns false
async function paymentGate(req, res) {
  const txHash = req.headers["x-payment-tx"];

  if (!txHash) {
    json(res, 402, { x402Version: 1, accepts: [getPaymentRequirement()], error: "Payment Required" });
    return false;
  }

  const valid = await verifyPayment(txHash);
  if (!valid) {
    json(res, 402, {
      x402Version: 1,
      accepts: [getPaymentRequirement()],
      error: "Payment verification failed",
      detail: "Transaction not found, not confirmed, wrong recipient, or expired (>5 min).",
    });
    return false;
  }

  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://402found.dev",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment-Tx",
  });
  res.end(JSON.stringify(body));
}

async function handleScan(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "POST required" });
  }

  // x402 payment gate — require payment before processing
  const paid = await paymentGate(req, res);
  if (!paid) return;

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const { code, language, filename } = payload;

  if (!code || typeof code !== "string") {
    return json(res, 400, { error: "`code` field is required (string)" });
  }

  const lang = (language || inferLanguage(filename, code)).toLowerCase();

  let issues;
  switch (lang) {
    case "python":
    case "py":
      issues = scanPython(code);
      break;
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
      issues = scanJavaScript(code);
      break;
    case "prompt":
    case "llm":
      issues = scanPrompt(code);
      break;
    default:
      // Run all scanners and merge
      issues = [
        ...scanPython(code),
        ...scanJavaScript(code),
        ...scanPrompt(code),
      ];
      // Deduplicate by line+message
      const seen = new Set();
      issues = issues.filter((i) => {
        const key = `${i.line}:${i.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const { score, productionReady } = computeScore(issues);

  const result = {
    scanner: "code-quality-scanner",
    version: "1.0.0",
    language: lang,
    linesAnalyzed: code.split("\n").length,
    qualityScore: score,
    productionReady,
    issueCount: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === "CRITICAL").length,
      high: issues.filter((i) => i.severity === "HIGH").length,
      medium: issues.filter((i) => i.severity === "MEDIUM").length,
      low: issues.filter((i) => i.severity === "LOW").length,
    },
    issues: issues.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity)
    ),
  };

  return json(res, 200, result);
}

function severityRank(s) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[s] ?? 4;
}

function inferLanguage(filename, code) {
  if (filename) {
    if (/\.py$/.test(filename)) return "python";
    if (/\.(js|ts|mjs|cjs)$/.test(filename)) return "javascript";
  }
  // Heuristics
  if (/^(import |from |def |class .*:)$/m.test(code)) return "python";
  if (/\b(const |let |var |function |=>|require\()/.test(code))
    return "javascript";
  if (
    /\b(you are|act as|respond|system prompt|user message)\b/i.test(code)
  )
    return "prompt";
  return "unknown";
}

// Health + discovery
function handleMeta(req, res) {
  if (req.url === "/health") {
    return json(res, 200, { status: "ok" });
  }
  if (req.url === "/.well-known/x402" || req.url === "/") {
    return json(res, 200, {
      name: "Code Quality Scanner",
      description:
        "Detects vibe-code anti-patterns in AI agent code before production deployment",
      version: "1.0.0",
      endpoints: [
        {
          path: "/scan",
          method: "POST",
          price: "$0.05",
          currency: "USDC",
          description: "Scan code for quality issues and anti-patterns",
          input: {
            code: "string (required) — source code or prompt text",
            language:
              "string (optional) — python | javascript | prompt | auto",
            filename: "string (optional) — used for language inference",
          },
          output: {
            qualityScore: "number 0-100",
            productionReady: "PASS | FAIL",
            issues: "array of detected issues with line numbers and fixes",
          },
        },
      ],
    });
  }
  return json(res, 404, { error: "Not found" });
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "https://402found.dev",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Payment-Tx",
    });
    res.end();
    return;
  }
  if (req.url === "/scan") {
    handleScan(req, res);
  } else {
    handleMeta(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Code Quality Scanner listening on :${PORT}`);
});
