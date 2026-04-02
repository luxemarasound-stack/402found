import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { checkLoop, resetAgent } from "./bloom.js";
import {
  verifyPayment,
  getPaymentRequirement,
  getCachedResult,
  cacheResult,
  isTxHashUsed,
  markTxHashUsed,
} from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({
  name: "loop-gate",
  version: "1.0.0",
});

// Check if an agent is looping — free to call, it's the loop-kill that costs money
mcpServer.tool(
  "check_loop",
  "Detects if an agent is stuck in a recursive tool-call loop. Pass the agent ID and the tool name being called. Returns loop status. If a loop is detected, agent must pay a loop-reset fee to clear the block.",
  {
    agent_id: z.string().describe("Unique identifier for the calling agent"),
    tool_name: z.string().describe("Name of the tool being called"),
  },
  async ({ agent_id, tool_name }) => {
    const result = checkLoop(agent_id, tool_name);
    if (result.looped) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "loop_detected",
              loop_count: result.loop_count,
              agent_id: result.agent_id,
              tool_name: result.tool_name,
              window_seconds: result.window_seconds,
              suggested_action: "break_loop",
              message: "Agent is looping. Call reset_loop with payment to clear.",
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "ok",
            loop_count: result.loop_count,
            agent_id: result.agent_id,
            tool_name: result.tool_name,
            window_seconds: result.window_seconds,
          }),
        },
      ],
    };
  }
);

// Reset a looping agent — this is the paid operation
mcpServer.tool(
  "reset_loop",
  "Clears the loop-detection state for an agent. Requires x402 payment. Use this when an agent is blocked by loop detection and needs to resume.",
  {
    agent_id: z.string().describe("The agent ID to reset"),
  },
  async ({ agent_id }) => {
    resetAgent(agent_id);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "reset",
            agent_id,
            fingerprint_cleared: true,
            message:
              "Loop fingerprint fully cleared. All call-frequency counters for this agent have been deleted. Agent starts fresh with zero history.",
          }),
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment-Tx");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});


// Discovery endpoints — publicly accessible, no payment gate
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
      title: "Loop-Gate",
      version: "1.0.0",
      description: "Detects recursive agent loops and charges a reset fee via x402 (USDC on Base).",
      guidance: "POST to /mcp with JSON-RPC. 'check_loop' (free) takes agent_id and tool_name. 'reset_loop' (paid, 0.005 USDC) takes agent_id. Include X-Payment-Tx header for reset_loop only.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Detect and reset agent loops",
          description: "MCP endpoint for check_loop (free) and reset_loop (paid) tools.",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.005" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: false, description: "Transaction hash from USDC transfer on Base (required for reset_loop only)", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method", "params", "id"], properties: { jsonrpc: { type: "string", enum: ["2.0"] }, method: { type: "string", enum: ["tools/call"] }, params: { type: "object", required: ["name", "arguments"], properties: { name: { type: "string", enum: ["check_loop", "reset_loop"] }, arguments: { type: "object", properties: { agent_id: { type: "string", description: "Unique identifier for the agent" }, tool_name: { type: "string", description: "Name of the tool being called (for check_loop)" } }, required: ["agent_id"] } } }, id: { type: "number" } } } } } },
          responses: { "200": { description: "Loop check or reset result", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["ok", "loop_detected", "reset"] }, loop_count: { type: "number" }, agent_id: { type: "string" } } } } } }, "402": { description: "Payment Required" } },
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
<title>Loop-Gate — 402Found.dev</title>
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
<h1>Loop-Gate</h1>
<div class="price">$0.005 USDC/request</div>
<p>Detects recursive agent loops and charges a reset fee via x402 (USDC on Base).</p>
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

// Payment gate only triggers for reset_loop — check_loop is free
async function paymentGate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  // Let check_loop through without payment
  const body = req.body;
  if (body?.method === "tools/call" && body?.params?.name === "check_loop") {
    next();
    return;
  }

  // Check for idempotency key — if we already have a cached result, return it immediately
  const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
  if (idempotencyKey) {
    const cached = getCachedResult(idempotencyKey);
    if (cached) {
      res.json(cached);
      return;
    }
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

  // Reject replayed tx hashes — each payment can only be used once
  if (isTxHashUsed(txHash)) {
    res.status(402).json({
      x402Version: 1,
      accepts: [getPaymentRequirement()],
      error: "Transaction already used",
      detail:
        "This tx hash has already been redeemed. If you need another reset, send a new payment.",
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

  // Payment verified — mark tx as used so it can't be replayed
  markTxHashUsed(txHash);

  // Stash the idempotency key so the response handler can cache the result
  (req as any)._idempotencyKey = idempotencyKey;

  next();
}

app.post("/mcp", paymentGate, async (req, res) => {
  const idempotencyKey: string | undefined = (req as any)._idempotencyKey;

  // If there's an idempotency key, intercept the response to cache it
  if (idempotencyKey) {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      cacheResult(idempotencyKey, body);
      return originalJson(body);
    };

    const originalWrite = res.write.bind(res);
    const chunks: Buffer[] = [];
    res.write = function (chunk: any, ...args: any[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return (originalWrite as any)(chunk, ...args);
    };

    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, ...args: any[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      if (chunks.length > 0) {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          cacheResult(idempotencyKey, body);
        } catch {
          // Non-JSON response, skip caching
        }
      }
      return (originalEnd as any)(chunk, ...args);
    } as any;
  }

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
  console.log(`Loop-Gate MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`OpenAPI:   http://localhost:${PORT}/openapi.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
