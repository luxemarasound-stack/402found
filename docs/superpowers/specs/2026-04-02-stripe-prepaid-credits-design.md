# Stripe Prepaid Credits — Design Spec

**Date:** 2026-04-02
**Status:** Approved

## Overview

Add Stripe prepaid credits as a second payment option alongside x402/USDC for all 18 402Found agent services. Users pay via Stripe, receive an API key, and include it in requests. Each service deducts credits per call. x402 continues to work unchanged.

## Architecture: Hybrid (Approach C)

- **Shared payment package** (`@402found/payment-gate`) — local npm package used by all 18 services. Handles both x402 verification and Stripe credit validation/deduction via direct Firestore access.
- **Credits API service** (`credits-api`) — new Cloud Run service for purchasing credits only (Stripe Checkout, webhooks, key generation, email delivery). Does NOT handle per-request validation.
- **Firestore** — stores API keys and credit balances. Each service accesses Firestore directly for fast validation (no extra network hop).

## Shared Payment Package — `@402found/payment-gate`

**Location:** `packages/payment-gate/` (installed via `"file:../../packages/payment-gate"`)

**Exports:**

```typescript
// Express middleware — for the 17 TypeScript/Express services
createPaymentGate(config: {
  serviceName: string;
  price: number;          // USD per request
  description: string;
  resource: string;
}): express.RequestHandler

// Standalone function — for code-quality-scanner (plain JS, node:http)
verifyRequest(req: IncomingMessage, config: {
  serviceName: string;
  price: number;
  resource: string;
}): Promise<{ valid: boolean; method: "stripe" | "x402" | null; error?: string; statusCode: number; body?: object }>
```

**Middleware logic (order of operations):**

1. Check `Authorization: Bearer sk_live_...` header
   - If present: Firestore transaction — validate key exists + active, check balance >= price, atomically deduct, log to transactions collection
   - 403 if invalid/inactive key
   - 402 if insufficient credits (include balance + required amount + top-up link)
2. If no Bearer token: check `X-Payment-Tx` header (existing x402 flow)
   - Verify USDC transfer on Base chain (same logic as today)
   - 402 if missing or invalid
3. If neither header: return 402 with both payment options

**Package structure:**

```
packages/payment-gate/
  package.json
  tsconfig.json
  src/
    index.ts          — createPaymentGate, verifyRequest exports
    x402.ts           — x402 verification (extracted from existing payment.ts)
    stripe-credits.ts — Firestore key validation + atomic credit deduction
    types.ts          — shared types/interfaces
```

**Environment variables consumed:**

| Var | Purpose | Existing? |
|-----|---------|-----------|
| `WALLET_ADDRESS` | x402 payment recipient | Yes |
| `CHAIN_RPC_URL` | Base RPC endpoint | Yes |
| `USDC_CONTRACT` | USDC contract address | Yes |
| `CHAIN_ID` | Base chain ID | Yes |
| `GOOGLE_CLOUD_PROJECT` | Firestore project (auto-set on Cloud Run) | Auto |

No new env vars needed for Firestore — Cloud Run services in `luxemara-tools` get access via default service account.

## Firestore Data Model

**Database:** Default Firestore database in `luxemara-tools` project (needs to be created).

### Collection: `apiKeys`

Document ID = API key (e.g. `sk_live_a1b2c3d4...`)

```
{
  email: string,                    // buyer's email
  balanceUsd: number,               // remaining credits in USD
  totalPurchasedUsd: number,        // lifetime total
  stripeCustomerId: string,         // Stripe customer ID
  createdAt: Timestamp,
  lastUsedAt: Timestamp,
  lastChargeSessionId: string,      // most recent Stripe Checkout session
  active: boolean                   // can be disabled manually
}
```

### Collection: `transactions`

Auto-generated document IDs, append-only audit trail.

```
{
  apiKey: string,
  type: "purchase" | "deduction",
  amountUsd: number,                // always positive
  balanceAfter: number,
  service: string | null,           // null for purchases
  stripeSessionId: string | null,   // null for deductions
  createdAt: Timestamp
}
```

**Key design decisions:**
- API key as document ID for O(1) lookup on every request (no query needed)
- Firestore transactions for atomic balance deduction (no double-spend)
- Transactions collection is write-only during normal operation (read for auditing/analytics)
- No secondary indexes needed beyond Firestore defaults

**API key format:** `sk_live_` + 32 random hex characters via `crypto.randomBytes(32).toString('hex')`.

## Credits API Service — `credits-api`

New Cloud Run service deployed at `credits-api.402found.dev`.

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | None | Buy credits web page (preset $5/$10/$25/$50 + custom amount, min $1) |
| POST | `/api/checkout` | None | Creates Stripe Checkout session |
| POST | `/api/webhook` | Stripe signature | Handles checkout.session.completed |
| GET | `/api/balance` | Bearer key | Returns current balance |
| GET | `/success` | None | Post-purchase page showing API key |

### Purchase Flow (Web)

1. User visits `credits-api.402found.dev`, picks amount, clicks Buy
2. Frontend calls `POST /api/checkout` with `{ amount: 10, email: "user@example.com" }`
3. Server creates Stripe Checkout session (payment mode, amount as line item), returns `{ url: "https://checkout.stripe.com/..." }`
4. User completes payment on Stripe
5. Stripe fires `checkout.session.completed` webhook to `/api/webhook`
6. Webhook handler:
   a. Verify Stripe signature
   b. Generate API key (`sk_live_` + 32 hex)
   c. Write to Firestore `apiKeys` collection
   d. Write purchase record to `transactions` collection
   e. Send confirmation email with API key (via stableemail.dev / AgentCash)
   f. Store key reference in Stripe session metadata for success page lookup
7. Stripe redirects user to `/success?session_id=cs_xxx`
8. Success page looks up session → retrieves API key → displays it

### Purchase Flow (API / Agent-to-Agent)

1. Agent calls `POST /api/checkout` with `{ amount: 5, email: "agent@example.com" }`
2. Gets Stripe Checkout URL — operator completes payment
3. Webhook creates key (same as web flow)
4. Key is delivered via email; agent can use `GET /api/balance` to check status

### Service Structure

```
credits-api/
  package.json
  tsconfig.json
  Dockerfile
  src/
    index.ts       — Express app, routes, CORS
    stripe.ts      — Stripe Checkout session creation
    webhook.ts     — Webhook handler, key generation, Firestore writes
    email.ts       — Send confirmation email via stableemail.dev
    types.ts       — interfaces
  public/
    index.html     — Buy credits page
    success.html   — Post-purchase API key display
```

### Environment Variables

| Var | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_SUCCESS_URL` | Redirect URL after payment |
| `GOOGLE_CLOUD_PROJECT` | Firestore project (auto on Cloud Run) |
| `PORT` | Server port (default 3000) |

## Integration: All 18 Services

### 17 TypeScript/Express Services

Each service migration:

1. Delete local `src/payment.ts`
2. Add dependency: `"@402found/payment-gate": "file:../../packages/payment-gate"`
3. Replace inline `paymentGate` function in `src/index.ts` with:

```typescript
import { createPaymentGate } from "@402found/payment-gate";

const paymentGate = createPaymentGate({
  serviceName: "pii-scrubber",
  price: 0.005,
  description: "Strips PII from text...",
  resource: "https://pii-scrubber.402found.dev/mcp"
});

app.post("/mcp", paymentGate, async (req, res) => { /* unchanged */ });
```

4. Update Dockerfile: add `COPY packages/payment-gate/ ./packages/payment-gate/` before `npm ci`

**All 17 services:**
1. pii-scrubber ($0.005)
2. data-sentinel ($0.003)
3. prompt-injection-detector ($0.003)
4. permission-guard ($0.002)
5. agent-audit-trail ($0.001)
6. multi-agent-trust-verifier ($0.004)
7. rate-limit-manager ($0.001)
8. loop-gate ($0.005)
9. agent-cost-meter ($0.002)
10. budget-ceiling-enforcer ($0.02)
11. agent-registry ($0.001)
12. hallucination-detector ($0.003)
13. performance-baseline-tracker ($0.10)
14. token-squeezer ($0.001)
15. format-converter ($0.001)
16. card-registry ($0.001)
17. the-prospector ($0.01)

### code-quality-scanner (Plain JS, node:http)

1. Remove inline `verifyPayment`, `getPaymentRequirement`, `paymentGate` from `server.js`
2. Import standalone function:

```javascript
import { verifyRequest } from "@402found/payment-gate";

async function handleScan(req, res) {
  const result = await verifyRequest(req, {
    serviceName: "code-quality-scanner",
    price: 0.05,
    resource: "https://code-quality-scanner.402found.dev/scan"
  });
  if (!result.valid) {
    json(res, result.statusCode, result.body);
    return;
  }
  // ... existing scan logic
}
```

## Response Formats

### 402 — No payment provided (advertises both options)

```json
{
  "x402Version": 1,
  "accepts": [{ "scheme": "exact", "network": "eip155:8453", ... }],
  "stripe": {
    "buyCredits": "https://credits-api.402found.dev/",
    "docs": "Send Authorization: Bearer sk_live_... header"
  },
  "error": "Payment Required"
}
```

### 402 — Insufficient credits

```json
{
  "error": "Insufficient credits",
  "balance": 0.002,
  "required": 0.005,
  "topUp": "https://credits-api.402found.dev/"
}
```

### 403 — Invalid/inactive API key

```json
{
  "error": "Invalid API key"
}
```

## Infrastructure

| Component | Platform | Notes |
|-----------|----------|-------|
| Firestore | GCP (luxemara-tools) | New — needs to be created |
| credits-api | Cloud Run (us-east1) | New service |
| credits-api.402found.dev | Cloudflare DNS + Cloud Run mapping | New subdomain |
| Stripe account | stripe.com | Needs API keys + webhook configured |
| Shared package | Local in repo | `packages/payment-gate/` |

## What's NOT in Scope

- User dashboard / login portal (future enhancement)
- Refund handling (manual via Stripe dashboard for now)
- Usage analytics dashboard (transactions collection enables this later)
- Rate limiting per API key (can be added to shared package later)
