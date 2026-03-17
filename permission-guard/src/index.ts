import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { checkPermission } from "./guard.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function paymentGate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const txHash = req.headers["x-payment-tx"] as string | undefined;

  if (!txHash) {
    res.status(402).json({
      x402Version: 1,
      accepts: [getPaymentRequirement()],
      error: "Payment Required",
    });
    return;
  }

  const valid = await verifyPayment(txHash);
  if (!valid) {
    res.status(402).json({
      x402Version: 1,
      accepts: [getPaymentRequirement()],
      error: "Payment verification failed",
      detail: "Transaction not found, not confirmed, wrong recipient, or expired (>5 min).",
    });
    return;
  }

  next();
}

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
