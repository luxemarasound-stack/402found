import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { checkBudget, configureBudget } from "./enforcer.js";
import { createPaymentGate } from "@402found/payment-gate";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "budget-ceiling-enforcer",
  version: "1.0.0",
});

mcpServer.tool(
  "check_budget",
  "Checks current spend against budget ceiling and returns enforcement action. Optionally records new spend. Returns budget status, projected spend, time until exhaustion, and recommended action (THROTTLE/PAUSE/ALERT/KILL).",
  {
    agentId: z.string().describe("Unique identifier for the agent"),
    currentSpend: z.number().optional().describe("Amount in USD to add to spend tracking"),
    action: z.string().optional().describe("Description of the spend action"),
  },
  async ({ agentId, currentSpend, action }) => {
    const result = checkBudget({ agentId, currentSpend, action });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

mcpServer.tool(
  "configure_budget",
  "Sets or updates budget ceiling configuration for an agent. Define spending limits, enforcement thresholds, webhook alerts, and dry-run mode.",
  {
    agentId: z.string().describe("Unique identifier for the agent"),
    ceiling: z.number().describe("Budget ceiling in USD"),
    period: z.enum(["daily", "weekly", "monthly"]).optional().describe("Budget period (default: daily)"),
    thresholds: z
      .array(
        z.object({
          percent: z.number().describe("Percentage of budget (e.g., 80)"),
          action: z.enum(["THROTTLE", "PAUSE", "ALERT", "KILL"]).describe("Action when threshold is reached"),
        })
      )
      .optional()
      .describe("Custom enforcement thresholds"),
    webhookUrl: z.string().optional().describe("Webhook URL for alert notifications"),
    dryRun: z.boolean().optional().describe("If true, alerts only — no enforcement"),
  },
  async ({ agentId, ceiling, period, thresholds, webhookUrl, dryRun }) => {
    const result = configureBudget({ agentId, ceiling, period, thresholds, webhookUrl, dryRun });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

const app = express();
app.use(express.json());
// CORS - allow 402found.dev to reach /health for status dots
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://402found.dev");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment-Tx, Authorization");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});


const wellKnownDir = path.resolve(__dirname, "..", ".well-known");
const agentCard = JSON.parse(readFileSync(path.join(wellKnownDir, "agent-card.json"), "utf-8"));
const serverCard = JSON.parse(readFileSync(path.join(wellKnownDir, "mcp", "server-card.json"), "utf-8"));
app.get("/.well-known/mcp", (_req, res) => res.json(serverCard));
app.get("/.well-known/mcp/server-card.json", (_req, res) => res.json(serverCard));
app.get("/.well-known/agent-card.json", (_req, res) => res.json(agentCard));

app.get("/.well-known/x402", (_req, res) => {
  res.json({ version: 1, resources: ["POST /mcp"] });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Budget Ceiling Enforcer",
      version: "1.0.0",
      description: "Prevents runaway cloud costs from AI agent usage. Enforces hard budget limits with configurable actions. Pay-per-request via x402 (USDC on Base).",
      guidance: "Two MCP tools: 'check_budget' (check/record spend, get enforcement action) and 'configure_budget' (set ceiling, thresholds, webhooks). POST to /mcp with JSON-RPC body. Include X-Payment-Tx header.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Enforce budget ceiling on agent spend",
          description: "MCP endpoint for check_budget and configure_budget tools. Requires x402 payment (0.02 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.02" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["check_budget", "configure_budget"] }, arguments: { type: "object" } } }, id: { type: "number" } } } } } },
          responses: {
            "200": { description: "Budget check or configuration result" },
            "402": { description: "Payment Required" },
          },
        },
      },
    },
  });
});


// Landing page
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Budget Ceiling Enforcer — 402Found.dev</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{max-width:560px;width:90%;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:2.5rem;text-align:center}
h1{font-size:1.5rem;color:#fff;margin-bottom:.5rem}
.price{color:#00d4aa;font-size:1.1rem;margin-bottom:1rem}
p{color:#999;line-height:1.6;margin-bottom:1.5rem}
a{color:#00d4aa;text-decoration:none}a:hover{text-decoration:underline}
.links{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;font-size:.9rem}
.badge{display:inline-block;background:#1a2e28;color:#00d4aa;padding:.25rem .75rem;border-radius:999px;font-size:.8rem;margin-bottom:1rem}
</style>
</head><body><div class="card">
<div class="badge">x402 · USDC on Base</div>
<h1>Budget Ceiling Enforcer</h1>
<div class="price">$0.02 USDC/request</div>
<p>MCP endpoint for check_budget and configure_budget tools. Requires x402 payment (0.02 USDC on Base).</p>
<div class="links">
<a href="/.well-known/agent-card.json">Agent Card</a>
<a href="/openapi.json">OpenAPI</a>
<a href="/.well-known/x402">x402 Info</a>
<a href="/health">Health</a>
<a href="https://402found.dev">← 402Found.dev</a>
</div>
</div></body></html>`);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const paymentGate = createPaymentGate({
  serviceName: "budget-ceiling-enforcer",
  price: 0.02,
  description: "Prevents runaway cloud costs from AI agent usage",
  resource: "https://budget-ceiling-enforcer.402found.dev/mcp",
});

app.post("/mcp", paymentGate, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await mcpServer.connect(transport);

  await transport.handleRequest(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    req.body
  );
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Stateless server — use POST" });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Stateless server — no sessions to close" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Budget Ceiling Enforcer MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
