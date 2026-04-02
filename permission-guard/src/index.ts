import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { checkPermission } from "./guard.js";
import { createPaymentGate } from "@402found/payment-gate";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "permission-guard",
  version: "1.0.0",
});

mcpServer.tool(
  "check_permission",
  "Checks if an agent's requested action exceeds its defined scope. Pass the action, resource, and the agent's permission scope. Returns allowed/denied with violation details. Flags dangerous operations even when technically in scope.",
  {
    action: z.string().describe("The action the agent wants to perform (e.g. read, write, delete, execute)"),
    resource: z.string().describe("The resource path being accessed (e.g. db/users, files/config/*, api/billing)"),
    scope: z.array(z.object({
      resource: z.string().describe("Resource pattern this permission grants (supports * and /* wildcards)"),
      actions: z.array(z.string()).describe("Allowed actions on this resource"),
    })).describe("The agent's defined permission scope — array of {resource, actions[]} objects"),
  },
  async ({ action, resource, scope }) => {
    const result = checkPermission(action, resource, scope);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
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

// x402 well-known fallback discovery (v1)
app.get("/.well-known/x402", (_req, res) => {
  res.json({ version: 1, resources: ["POST /mcp"] });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Permission Guard",
      version: "1.0.0",
      description: "Checks if an agent's requested action exceeds its defined scope. Pay-per-request via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'check_permission' with 'action' (string), 'resource' (string), and 'scope' (array of {resource, actions[]}). Include X-Payment-Tx header. Returns { allowed, violations, risk_level }.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Check agent action against permission scope",
          description: "MCP endpoint for check_permission tool. Requires x402 payment (0.002 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.002" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["check_permission"] }, arguments: { type: "object", required: ["action", "resource", "scope"], properties: { action: { type: "string", description: "The action to check (e.g. read, write, delete)" }, resource: { type: "string", description: "The resource path (e.g. db/users)" }, scope: { type: "array", items: { type: "object", properties: { resource: { type: "string" }, actions: { type: "array", items: { type: "string" } } } }, description: "Agent's permission scope" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Permission check result", content: { "application/json": { schema: { type: "object", properties: { allowed: { type: "boolean" }, violations: { type: "array", items: { type: "string" } }, risk_level: { type: "string" } } } } } }, "402": { description: "Payment Required" } },
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
<title>Permission Guard — 402Found.dev</title>
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
<h1>Permission Guard</h1>
<div class="price">$0.002 USDC/request</div>
<p>Checks if an agent's requested action exceeds its defined scope. Pay-per-request via x402 (USDC on Base).</p>
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
  serviceName: "permission-guard",
  price: 0.002,
  description: "Checks if an agent action exceeds its defined scope",
  resource: "https://permission-guard.402found.dev/mcp",
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
  console.log(`Permission Guard MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
