import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { prospect } from "./prospect.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "the-prospector",
  version: "1.0.0",
});

mcpServer.tool(
  "prospect",
  "Takes a URL and generates a valid agent-card.json following the 2026 A2A spec. Reads only from stable structured sources (llms.txt, robots.txt, sitemap.xml, .well-known files). Never scrapes HTML.",
  {
    url: z.string().url().describe("The target website URL to generate an agent card for"),
    capabilities: z
      .array(z.string())
      .optional()
      .describe("Optional list of capabilities to include if not auto-detected"),
    description: z
      .string()
      .optional()
      .describe("Optional description fallback if not auto-detected"),
  },
  async ({ url, capabilities, description }) => {
    const result = await prospect({ url, capabilities, description });
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

// Discovery endpoints — publicly accessible
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
      title: "The Prospector",
      version: "1.0.0",
      description: "Generates valid agent-card.json files from stable structured sources. Pay-per-card via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'prospect' with a 'url' argument (the target website). Optionally include 'capabilities' array and 'description' string. Include X-Payment-Tx header. Returns a generated agent-card.json.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Generate agent card from URL",
          description: "MCP endpoint for prospect tool. Requires x402 payment (0.01 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.01" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["prospect"] }, arguments: { type: "object", required: ["url"], properties: { url: { type: "string", description: "Target website URL" }, capabilities: { type: "array", items: { type: "string" } }, description: { type: "string" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Generated agent card", content: { "application/json": { schema: { type: "object", properties: { card: { type: "object" }, source: { type: "string" } } } } } }, "402": { description: "Payment Required" } },
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
      detail:
        "Transaction not found, not confirmed, wrong recipient, or expired (>5 min).",
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
  console.log(`The Prospector MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
