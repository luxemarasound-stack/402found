import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { scrubPII } from "./scrubber.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Create the MCP server
const mcpServer = new McpServer({
  name: "pii-scrubber",
  version: "1.0.0",
});

// Register the scrub tool
mcpServer.tool(
  "scrub_pii",
  "Strips personally identifiable information (SSNs, emails, API keys, phone numbers, addresses, credit cards, IP addresses) from text. GDPR/HIPAA aligned.",
  { text: z.string().describe("The text to scrub PII from") },
  async ({ text }) => {
    const result = scrubPII(text);
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

// Express app for HTTP layer
const app = express();
app.use(express.json());

// All /.well-known paths must be publicly accessible — no payment gate
import { readFileSync } from "node:fs";
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
      title: "PII Scrubber",
      version: "1.0.0",
      description: "Strips PII from text. Pay-per-request via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'scrub_pii' with a 'text' argument. Include your USDC-on-Base transaction hash in the X-Payment-Tx header. Returns { scrubbed, pii_found, count }.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Strip PII from text",
          description: "MCP endpoint for scrub_pii tool. Requires x402 payment (0.005 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.005" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["scrub_pii"] }, arguments: { type: "object", required: ["text"], properties: { text: { type: "string", description: "The text to scrub PII from" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Scrubbed text result", content: { "application/json": { schema: { type: "object", properties: { scrubbed: { type: "string" }, pii_found: { type: "array", items: { type: "string" } }, count: { type: "number" } } } } } }, "402": { description: "Payment Required" } },
        },
      },
    },
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// x402 payment gate middleware for MCP endpoint
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

// MCP endpoint with payment gate
// Each request gets its own stateless transport
app.post("/mcp", paymentGate, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless — no sessions
  });

  await mcpServer.connect(transport);

  await transport.handleRequest(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    req.body
  );
});

// Handle GET for SSE streams (stateless mode rejects these)
app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Stateless server — use POST" });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Stateless server — no sessions to close" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PII Scrubber MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
