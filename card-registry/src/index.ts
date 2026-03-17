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
