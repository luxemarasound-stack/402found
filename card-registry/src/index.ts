import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { registerCard, getCard, listCards, validateSlug, validateCard } from "./cards.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "card-registry",
  version: "1.0.0",
});

mcpServer.tool(
  "register_card",
  "Hosts an agent-card.json at a permanent public URL. Pass a URL-safe slug and the card JSON. The card will be served at /cards/{slug}.json.",
  {
    slug: z
      .string()
      .describe("URL-safe identifier (lowercase, hyphens, 3-64 chars). e.g. 'organic-honey-shop'"),
    card: z
      .record(z.string(), z.unknown())
      .describe("The agent-card.json object to host"),
  },
  async ({ slug, card }) => {
    const slugErr = validateSlug(slug);
    if (slugErr) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: slugErr }) }],
        isError: true,
      };
    }

    const cardErr = validateCard(card);
    if (cardErr) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: cardErr }) }],
        isError: true,
      };
    }

    const result = registerCard(slug, card);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

mcpServer.tool(
  "get_card",
  "Retrieves a hosted agent card by slug.",
  {
    slug: z.string().describe("The slug of the card to retrieve"),
  },
  async ({ slug }) => {
    const card = getCard(slug);
    if (!card) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Card not found" }) }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(card) }],
    };
  }
);

mcpServer.tool(
  "list_cards",
  "Lists all hosted card slugs.",
  {},
  async () => {
    const slugs = listCards();
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ cards: slugs, count: slugs.length }) }],
    };
  }
);

const app = express();
app.use(express.json());
// CORS - allow 402found.dev to reach /health for status dots
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://402found.dev");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment-Tx");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});


// Discovery endpoints — publicly accessible
const wellKnownDir = path.resolve(__dirname, "..", ".well-known");
const agentCard = JSON.parse(readFileSync(path.join(wellKnownDir, "agent-card.json"), "utf-8"));
const serverCard = JSON.parse(readFileSync(path.join(wellKnownDir, "mcp", "server-card.json"), "utf-8"));
app.get("/.well-known/mcp", (_req, res) => res.json(serverCard));
app.get("/.well-known/mcp/server-card.json", (_req, res) => res.json(serverCard));
app.get("/.well-known/agent-card.json", (_req, res) => res.json(agentCard));

app.get("/.well-known/x402", (_req, res) => {
  res.json({ version: 1, resources: ["POST /mcp"] });
});

// Hosted cards — publicly accessible, no payment gate
app.get("/cards/:slug.json", (req, res) => {
  const card = getCard(req.params.slug);
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  res.json(card);
});

// List all hosted cards — public
app.get("/cards", (_req, res) => {
  const slugs = listCards();
  res.json({ cards: slugs, count: slugs.length });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Card Registry",
      version: "1.0.0",
      description: "Hosts agent-card.json files at permanent public URLs. Pay-per-card via x402 (USDC on Base).",
      guidance: "POST to /mcp with JSON-RPC. 'register_card' (paid, 0.001 USDC) takes slug and card object. 'get_card' and 'list_cards' are free. Include X-Payment-Tx header for register_card only.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Register, retrieve, or list agent cards",
          description: "MCP endpoint for register_card (paid), get_card (free), list_cards (free).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.001" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: false, description: "Transaction hash from USDC transfer on Base (required for register_card only)", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name"], properties: { name: { type: "string", enum: ["register_card", "get_card", "list_cards"] }, arguments: { type: "object", properties: { slug: { type: "string", description: "URL-safe identifier (3-64 chars)" }, card: { type: "object", description: "The agent-card.json to host" } } } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Card operation result" }, "402": { description: "Payment Required" } },
        },
      },
      "/cards/{slug}.json": {
        get: {
          summary: "Retrieve a hosted agent card",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Agent card JSON" }, "404": { description: "Card not found" } },
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
<title>Card Registry — 402Found.dev</title>
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
<h1>Card Registry</h1>
<div class="price">$0.001 USDC/request</div>
<p>Hosts agent-card.json files at permanent public URLs. Pay-per-card via x402 (USDC on Base).</p>
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

// Payment gate — only register_card requires payment
async function paymentGate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const body = req.body;
  // get_card and list_cards are free
  if (
    body?.method === "tools/call" &&
    (body?.params?.name === "get_card" || body?.params?.name === "list_cards")
  ) {
    next();
    return;
  }

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
  console.log(`Card Registry MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`Cards:     http://localhost:${PORT}/cards`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
