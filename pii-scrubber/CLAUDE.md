# PII Scrubber

MCP micro-tool that strips PII from text. Pay-per-request via x402 (USDC on Base).

## Stack
- TypeScript + Express + MCP SDK (`@modelcontextprotocol/sdk`)
- Stateless MCP server over Streamable HTTP (`POST /mcp`)
- x402 payment gate: clients must send USDC on Base, then pass tx hash in `X-Payment-Tx` header
- Deploys to Fly.io at `pii-scrubber.fly.dev`

## Project structure
```
src/
  index.ts       — Express app, MCP server setup, payment gate middleware, routes
  scrubber.ts    — PII detection regex patterns and scrubPII() function
  payment.ts     — verifyPayment() via Base RPC, getPaymentRequirement()
  types.ts       — PIIType, ScrubResult, PaymentRequirement interfaces
.well-known/     — agent-card.json for MCP discovery
```

## Commands
- `npm run build` — compile TypeScript (`tsc`)
- `npm run start` — run compiled server (`node dist/index.js`)
- `npm run dev` — build + run

## Environment variables (see .env.example)
- `WALLET_ADDRESS` — USDC recipient wallet
- `CHAIN_RPC_URL` — Base RPC endpoint (default: https://mainnet.base.org)
- `USDC_CONTRACT` — USDC token contract on Base
- `PAYMENT_AMOUNT` — price per request in USDC (default: 0.005)
- `CHAIN_ID` — chain ID (default: 8453 = Base)
- `PORT` — server port (default: 3000)

## Rules
- All chain-specific values must come from env vars, never hardcoded
- Stateless: no sessions, no dashboards, no human-in-the-loop
- No fragile deps, no scrapers
- Stability over cleverness
