# 402found Fleet — Mandatory Service Checklist

Every new microservice in the 402found fleet MUST satisfy every item below before it is considered complete. Do not skip any step. Do not mark a service as done until all boxes can be checked.

---

## x402 Payment Middleware

- [ ] x402 payment gate on all paid routes via `X-Payment-Tx` header verification
- [ ] USDC on Base (Chain ID 8453, contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- [ ] Recipient wallet: `0x856401af27a1D59a473a2A8BD92Af3ccAa830376`
- [ ] Price set via `PAYMENT_AMOUNT` env var (in USD, e.g. `0.003`)
- [ ] Payment verification via Base RPC (`eth_getTransactionReceipt` + `eth_getBlockByNumber`)
- [ ] Transfer event topic check: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`
- [ ] Max transaction age: 5 minutes (anti-replay)
- [ ] 402 response includes `payment` object with `amount`, `currency`, `network`, `recipient`, `contract`
- [ ] Zero external crypto dependencies — use native `fetch` against Base RPC

## MCP Discovery — Agent Card

- [ ] `GET /.well-known/agent-card.json` — publicly accessible, no payment gate
- [ ] `spec_version: "2026-03"`
- [ ] Includes: `name`, `description`, `url`, `provider.organization`, `provider.url`
- [ ] `authentication.schemes: ["x402"]`
- [ ] `payment` block with `protocol`, `amount`, `currency`, `network`
- [ ] `endpoints` block with `mcp`, `openapi`, `health`
- [ ] `generated_by: "402found.dev"`

## MCP Discovery — Server Card

- [ ] `GET /.well-known/mcp/server-card.json` — publicly accessible
- [ ] `GET /.well-known/mcp` — same content as server-card.json
- [ ] Includes full `payment` block with `recipient` and `contract` addresses
- [ ] `tools` array with each tool's `name`, `description`, `inputSchema`, `outputSchema`
- [ ] `authentication.instructions` explaining the x402 payment flow

## OpenAPI Spec

- [ ] `GET /openapi.json` — publicly accessible, no payment gate
- [ ] Every route defined in `paths` with full request/response schemas — NOT empty stubs
- [ ] `/mcp` POST route includes `requestBody` schema showing MCP JSON-RPC format
- [ ] `/mcp` POST route includes `parameters` for `X-Payment-Tx` header
- [ ] Response schemas for both `200` (success) and `402` (payment required)
- [ ] `x-x402` extension in `info` with seller metadata (`name`, `organization`, `url`)
- [ ] `x-x402` extension in `/mcp` POST with `accepts` array containing payment details

## x402 Bazaar Discovery Document

- [ ] `GET /.well-known/x402.json` — publicly accessible, no payment gate
- [ ] `x402Version: 2`
- [ ] `seller` block with `name`, `description`, `url`, `organization`
- [ ] `routes` array with every paid route
- [ ] Each route has `path`, `method`, `description`
- [ ] Each route has `accepts` array with at least one entry containing:
  - [ ] `scheme: "exact"`
  - [ ] `network: "eip155:8453"`
  - [ ] `asset` — USDC contract address
  - [ ] `payTo` — recipient wallet address
  - [ ] `maxAmountRequired` — price in atomic units (6 decimals, e.g. `"3000"` = $0.003)
  - [ ] `maxTimeoutSeconds: 300`
  - [ ] `mimeType: "application/json"`
  - [ ] `outputSchema` with `input` (HTTP method, headers, body schema) and `output` (response example)

## Deployment — Fly.io

- [ ] `Dockerfile` — multi-stage build: `node:20-slim` builder + `node:20-slim` runtime
- [ ] Builder stage: `npm ci`, `npx tsc`
- [ ] Runtime stage: `npm ci --omit=dev`, copy `dist/` and `.well-known/`
- [ ] `EXPOSE 3000`
- [ ] `fly.toml` present with:
  - [ ] `primary_region = 'ord'`
  - [ ] `internal_port = 3000`
  - [ ] `force_https = true`
  - [ ] `auto_stop_machines = 'stop'`
  - [ ] `auto_start_machines = true`
  - [ ] `min_machines_running = 0`
  - [ ] `memory = '1gb'`, `cpu_kind = 'shared'`, `cpus = 1`

## Health & Endpoints

- [ ] `GET /health` returns `{"status":"ok"}` — no payment gate
- [ ] `POST /mcp` — payment-gated MCP endpoint
- [ ] `GET /mcp` returns 405 with `{"error":"Stateless server — use POST"}`
- [ ] `DELETE /mcp` returns 405 with `{"error":"Stateless server — no sessions to close"}`

## MCP Tool

- [ ] Tool name clearly defined and documented (e.g. `scrub_pii`, `scan_for_injection`)
- [ ] Tool registered via `mcpServer.tool()` with name, description, Zod schema, handler
- [ ] Tool description is specific and actionable — describes what it does, not marketing copy
- [ ] Tool returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- [ ] Stateless MCP transport: `sessionIdGenerator: undefined`

## Project Files

- [ ] `package.json` with `name`, `version`, `description`, scripts (`build`, `start`, `dev`)
- [ ] `type: "commonjs"` in package.json
- [ ] Dependencies: `@modelcontextprotocol/sdk`, `dotenv`, `express` — nothing else unless justified
- [ ] `tsconfig.json` with `target: "ES2022"`, `module: "commonjs"`, `strict: true`
- [ ] `.env.example` with all required environment variables and defaults
- [ ] `README.md` with:
  - [ ] Service description and OWASP/security coverage
  - [ ] Pricing
  - [ ] `curl` health check example
  - [ ] `curl` MCP call example (with `X-Payment-Tx` header)
  - [ ] Deploy commands (`fly launch`, `fly secrets set`, `fly deploy`)

## Architecture Rules

- [ ] Stateless — no database, no persistent sessions, no external state
- [ ] Zero external dependencies beyond Express + MCP SDK + dotenv
- [ ] All chain-specific values from environment variables, never hardcoded
- [ ] Domain logic in its own file (e.g. `detector.ts`, `scrubber.ts`) — not in `index.ts`
- [ ] TypeScript strict mode, no `any` in domain logic
- [ ] All discovery endpoints (`/.well-known/*`, `/openapi.json`, `/health`) publicly accessible
- [ ] Stability over cleverness — no fragile deps, no scrapers, no external APIs in core logic

---

## Directory Structure

Every service MUST follow this layout:

```
{service-name}/
  src/
    index.ts          — Express app, MCP server, payment gate, routes
    {domain}.ts       — Core domain logic (detector, scrubber, etc.)
    payment.ts        — verifyPayment(), getPaymentRequirement()
    types.ts          — TypeScript interfaces
  .well-known/
    agent-card.json   — A2A agent discovery card
    mcp/
      server-card.json — MCP protocol server card
  .env.example
  Dockerfile
  fly.toml
  package.json
  tsconfig.json
  README.md
```

---

## Verification

Before declaring a service complete, confirm:

1. `npx tsc` compiles with zero errors
2. `npm start` runs locally and `curl localhost:3000/health` returns `{"status":"ok"}`
3. `curl localhost:3000/.well-known/agent-card.json` returns valid agent card
4. `curl localhost:3000/.well-known/x402.json` returns valid x402 discovery with route definitions
5. `curl localhost:3000/openapi.json` returns complete OpenAPI spec with all routes and schemas
6. `fly deploy` succeeds
7. `curl https://{service}.fly.dev/health` returns `{"status":"ok"}`
8. `curl https://{service}.fly.dev/.well-known/x402.json` returns valid x402 discovery
