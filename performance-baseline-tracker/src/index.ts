import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { captureBaseline, compareToBaseline, getTrend, listBaselines } from "./tracker.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({ name: "performance-baseline-tracker", version: "1.0.0" });

const sampleSchema = z.object({
  input: z.string().describe("Input sent to the agent"),
  output: z.string().describe("Output received from the agent"),
  latencyMs: z.number().describe("Response time in milliseconds"),
  tokenCount: z.number().describe("Total tokens used"),
  isError: z.boolean().optional().describe("Whether this was an error response"),
  metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata"),
});

// --- Tool: capture_baseline ---
mcpServer.tool(
  "capture_baseline",
  "Capture a baseline snapshot of agent performance from sample input/output pairs. Calculates latency, token usage, output length, error rate, and output fingerprints.",
  {
    agentId: z.string().describe("Agent identifier"),
    version: z.string().describe("Baseline version label (e.g., 'v1.0', 'prod-2026-03')"),
    samples: z.array(sampleSchema).min(1).describe("Array of input/output samples with metrics"),
  },
  async ({ agentId, version, samples }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(captureBaseline(agentId, version, samples)) }],
  })
);

// --- Tool: compare_performance ---
mcpServer.tool(
  "compare_performance",
  "Compare new agent outputs against a stored baseline. Returns drift scores (0-100) per metric, alert level, degradation details, and recommendations.",
  {
    agentId: z.string().describe("Agent identifier"),
    baselineVersion: z.string().optional().describe("Specific baseline version to compare against (default: latest)"),
    samples: z.array(sampleSchema).min(1).describe("New input/output samples to compare"),
    sensitivity: z.number().optional().describe("Sensitivity multiplier (0.1-5.0, default 1.0). Higher = more sensitive to drift"),
  },
  async ({ agentId, baselineVersion, samples, sensitivity }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(compareToBaseline(agentId, baselineVersion, samples, sensitivity)) }],
  })
);

// --- Tool: get_trend ---
mcpServer.tool(
  "get_trend",
  "Get drift trend data over time for an agent. Returns time-series points for charting plus summary stats.",
  {
    agentId: z.string().describe("Agent identifier"),
    days: z.number().optional().describe("Number of days to look back (default: 7)"),
  },
  async ({ agentId, days }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(getTrend(agentId, days ?? 7)) }],
  })
);

// --- Tool: list_baselines ---
mcpServer.tool(
  "list_baselines",
  "List all stored baseline snapshots for an agent with their metrics summaries.",
  {
    agentId: z.string().describe("Agent identifier"),
  },
  async ({ agentId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(listBaselines(agentId)) }],
  })
);

// --- Express app ---
const app = express();
app.use(express.json());

const wellKnownDir = path.resolve(__dirname, "..", ".well-known");
const agentCard = JSON.parse(readFileSync(path.join(wellKnownDir, "agent-card.json"), "utf-8"));
const serverCard = JSON.parse(readFileSync(path.join(wellKnownDir, "mcp", "server-card.json"), "utf-8"));
app.get("/.well-known/mcp", (_req, res) => res.json(serverCard));
app.get("/.well-known/mcp/server-card.json", (_req, res) => res.json(serverCard));
app.get("/.well-known/agent-card.json", (_req, res) => res.json(agentCard));
app.get("/.well-known/x402", (_req, res) => res.json({ version: 1, resources: ["POST /mcp"] }));

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Performance Baseline Tracker",
      version: "1.0.0",
      description: "Captures and monitors AI agent output quality over time. Baseline snapshots, drift detection with semantic similarity, trend analysis. Pay-per-request via x402.",
      guidance: "4 MCP tools: capture_baseline (store reference snapshots), compare_performance (detect drift), get_trend (time-series data), list_baselines (view stored baselines). POST to /mcp with JSON-RPC body. Include X-Payment-Tx header.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Performance Baseline Tracker MCP endpoint",
          description: "Requires x402 payment (0.10 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.10" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, schema: { type: "string" } }],
        },
      },
    },
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

async function paymentGate(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const txHash = req.headers["x-payment-tx"] as string | undefined;
  if (!txHash) { res.status(402).json({ x402Version: 1, accepts: [getPaymentRequirement()], error: "Payment Required" }); return; }
  const valid = await verifyPayment(txHash);
  if (!valid) { res.status(402).json({ x402Version: 1, accepts: [getPaymentRequirement()], error: "Payment verification failed" }); return; }
  next();
}

app.post("/mcp", paymentGate, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  await transport.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse, req.body);
});

app.get("/mcp", (_req, res) => res.status(405).json({ error: "Stateless server — use POST" }));
app.delete("/mcp", (_req, res) => res.status(405).json({ error: "Stateless server — no sessions to close" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Performance Baseline Tracker MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
