import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { verifyAgentTrust } from "./verifier.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "multi-agent-trust-verifier",
  version: "1.0.0",
});

mcpServer.tool(
  "verify_agent_trust",
  "Verifies trust between agents by checking goal alignment, spend limits, action scope, and detecting goal drift. Compares proposed action against original goal, enforces spend limits, detects high-risk actions. Returns trust score, goal alignment score, violations, and approve/deny/escalate recommendation. Covers OWASP ASI01 Agent Goal Hijack.",
  {
    requestingAgentId: z.string().describe("ID of the agent requesting the action"),
    targetAgentId: z.string().describe("ID of the agent that will execute the action"),
    proposedAction: z.string().describe("Description of the proposed action"),
    originalGoal: z.string().describe("The original goal or task the agent was assigned"),
    spendLimit: z.number().optional().describe("Maximum allowed spend in USD"),
    proposedSpend: z.number().optional().describe("Proposed spend for this action in USD"),
  },
  async ({ requestingAgentId, targetAgentId, proposedAction, originalGoal, spendLimit, proposedSpend }) => {
    const result = verifyAgentTrust({
      requestingAgentId,
      targetAgentId,
      proposedAction,
      originalGoal,
      spendLimit,
      proposedSpend,
    });
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
      title: "Multi-Agent Trust Verifier",
      version: "1.0.0",
      description: "Verifies trust between agents by checking goal alignment, spend limits, and action scope. Pay-per-request via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'verify_agent_trust' with 'requestingAgentId', 'targetAgentId', 'proposedAction', 'originalGoal', and optional 'spendLimit'/'proposedSpend'. Include X-Payment-Tx header. Returns { authorized, trustScore, goalAlignmentScore, violations, recommendation }.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Verify trust between agents",
          description: "MCP endpoint for verify_agent_trust tool. Requires x402 payment (0.004 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.004" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["verify_agent_trust"] }, arguments: { type: "object", required: ["requestingAgentId", "targetAgentId", "proposedAction", "originalGoal"], properties: { requestingAgentId: { type: "string" }, targetAgentId: { type: "string" }, proposedAction: { type: "string" }, originalGoal: { type: "string" }, spendLimit: { type: "number" }, proposedSpend: { type: "number" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Trust verification result", content: { "application/json": { schema: { type: "object", properties: { authorized: { type: "boolean" }, trustScore: { type: "number" }, goalAlignmentScore: { type: "number" }, violations: { type: "array", items: { type: "string" } }, recommendation: { type: "string", enum: ["approve", "deny", "escalate"] } } } } } }, "402": { description: "Payment Required" } },
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
  console.log(`Multi-Agent Trust Verifier MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
