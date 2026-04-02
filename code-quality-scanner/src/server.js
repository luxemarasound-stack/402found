import { createServer } from "node:http";
import { verifyRequest } from "@402found/payment-gate";
import { scanPython } from "./scanners/python.js";
import { scanJavaScript } from "./scanners/javascript.js";
import { scanPrompt } from "./scanners/prompt.js";
import { computeScore } from "./scoring.js";

const PORT = process.env.PORT || 8080;

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
    "Access-Control-Allow-Headers": "Content-Type, X-Payment-Tx, Authorization",
  });
  res.end(JSON.stringify(body));
}

async function handleScan(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "POST required" });
  }

  const payResult = await verifyRequest(req, {
    serviceName: "code-quality-scanner",
    price: 0.05,
    description: "Detects vibe-code anti-patterns in AI agent code",
    resource: "https://code-quality-scanner.402found.dev/scan",
  });
  if (!payResult.valid) {
    return json(res, payResult.statusCode, payResult.body);
  }

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
      issues = [
        ...scanPython(code),
        ...scanJavaScript(code),
        ...scanPrompt(code),
      ];
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
      "Access-Control-Allow-Headers": "Content-Type, X-Payment-Tx, Authorization",
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
