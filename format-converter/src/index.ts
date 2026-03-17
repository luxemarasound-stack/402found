import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { convert, getSupportedFormats } from "./convert.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Format } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const FORMATS = getSupportedFormats();

const mcpServer = new McpServer({
  name: "format-converter",
  version: "1.0.0",
});

mcpServer.tool(
  "convert",
  `Converts data between formats: ${FORMATS.join(", ")}. Handles nested JSON flattening to CSV with dot-notation. Zero external dependencies.`,
  {
    data: z.string().describe("The content to convert"),
    from: z.enum(FORMATS as [Format, ...Format[]]).describe("Source format"),
    to: z.enum(FORMATS as [Format, ...Format[]]).describe("Target format"),
  },
  async ({ data, from, to }) => {
    try {
      const result = convert(data, from, to);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

const app = express();
app.use(express.json({ limit: "2mb" }));

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
      title: "Format Converter",
      version: "1.0.0",
      description: "Converts data between JSON, CSV, XML, YAML, Markdown, HTML, and TOML. Pay-per-conversion via x402 (USDC on Base).",
      guidance: "POST to /mcp with a JSON-RPC body calling 'convert' with 'data' (string), 'from' (source format), and 'to' (target format). Supported formats: json, csv, xml, yaml, markdown, html, toml. Include X-Payment-Tx header.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Convert between data formats",
          description: "MCP endpoint for convert tool. Requires x402 payment (0.001 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.001" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, description: "Transaction hash from USDC transfer on Base", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["convert"] }, arguments: { type: "object", required: ["data", "from", "to"], properties: { data: { type: "string", description: "The content to convert" }, from: { type: "string", enum: ["json", "csv", "xml", "yaml", "markdown", "html", "toml"] }, to: { type: "string", enum: ["json", "csv", "xml", "yaml", "markdown", "html", "toml"] } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Converted data", content: { "application/json": { schema: { type: "object", properties: { converted: { type: "string" }, from: { type: "string" }, to: { type: "string" } } } } } }, "402": { description: "Payment Required" } },
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
  console.log(`Format Converter MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
