import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { logAgentAction } from "./auditor.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "agent-audit-trail",
  version: "1.0.0",
});

mcpServer.tool(
  "log_agent_action",
  "Creates a tamper-evident, HMAC-signed audit log entry for an agent action. Returns a signed receipt with receiptId and hmacSignature that the caller stores for compliance. Covers OWASP ASI audit requirements.",
  {
    agentId: z.string().describe("Unique identifier for the agent"),
    action: z.string().describe("Description of the action performed"),
    timestamp: z.string().describe("ISO 8601 timestamp of the action"),
    payload: z.record(z.string(), z.unknown()).optional().describe("Optional structured payload data"),
    outcome: z.string().optional().describe("Optional outcome/result of the action"),
  },
  async ({ agentId, action, timestamp, payload, outcome }) => {
    const result = logAgentAction({ agentId, action, timestamp, payload, outcome });
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
      title: "Agent Audit Trail",
      version: "1.0.0",
      description: "Creates tamper-evident, HMAC-signed audit log entries for agent actions. Pay-per-request via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'log_agent_action' with 'agentId', 'action', 'timestamp' (ISO 8601), and optional 'payload'/'outcome'. Include X-Payment-Tx header. Returns { receiptId, hmacSignature, timestamp, action, agentId, verified }.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Create HMAC-signed audit log entry",
          description: "MCP endpoint for log_agent_action tool. Requires x402 payment (0.001 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.001" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["log_agent_action"] }, arguments: { type: "object", required: ["agentId", "action", "timestamp"], properties: { agentId: { type: "string", description: "Unique identifier for the agent" }, action: { type: "string", description: "Description of the action performed" }, timestamp: { type: "string", description: "ISO 8601 timestamp" }, payload: { type: "object", description: "Optional structured payload" }, outcome: { type: "string", description: "Optional outcome" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Signed audit receipt", content: { "application/json": { schema: { type: "object", properties: { receiptId: { type: "string" }, hmacSignature: { type: "string" }, timestamp: { type: "string" }, action: { type: "string" }, agentId: { type: "string" }, verified: { type: "boolean" } } } } } }, "402": { description: "Payment Required" } },
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
  console.log(`Agent Audit Trail MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
