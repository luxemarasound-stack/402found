import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { compress } from "./compress.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "token-squeezer",
  version: "1.0.0",
});

mcpServer.tool(
  "squeeze",
  "Compresses large text, code, or conversation history into a hyper-dense Reasoning Map optimized for LLM context windows. Saves 80%+ on token costs.",
  {
    text: z.string().describe("The text to compress"),
    target_tokens: z
      .number()
      .int()
      .positive()
      .default(500)
      .describe("Target token count for the compressed output"),
  },
  async ({ text, target_tokens }) => {
    const result = compress(text, target_tokens);
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
app.use(express.json({ limit: "2mb" }));

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
      title: "Token Squeezer",
      version: "1.0.0",
      description: "Compresses text into hyper-dense Reasoning Maps for LLM context windows. Pay-per-request via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'squeeze' with 'text' and optional 'target_tokens' arguments. Include your USDC-on-Base transaction hash in the X-Payment-Tx header. Returns compressed text with token savings ratio.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Compress text into Reasoning Maps",
          description: "MCP endpoint for squeeze tool. Requires x402 payment (0.001 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.001" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["squeeze"] }, arguments: { type: "object", required: ["text"], properties: { text: { type: "string", description: "The text to compress" }, target_tokens: { type: "number", description: "Target token count (default 500)" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Compressed text result", content: { "application/json": { schema: { type: "object", properties: { compressed: { type: "string" }, original_tokens: { type: "number" }, compressed_tokens: { type: "number" }, ratio: { type: "number" } } } } } }, "402": { description: "Payment Required" } },
        },
      },
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// x402 payment gate
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
      detail:
        "Transaction not found, not confirmed, wrong recipient, or expired (>5 min).",
    });
    return;
  }

  next();
}

// Stateless MCP endpoint — each request gets its own transport
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
  console.log(`Token Squeezer MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
