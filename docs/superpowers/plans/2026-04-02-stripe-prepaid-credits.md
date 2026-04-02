# Stripe Prepaid Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe prepaid credits as a second payment option alongside x402/USDC for all 18 402Found agent services.

**Architecture:** Hybrid approach — a shared `@402found/payment-gate` local npm package handles both x402 and Stripe credit validation directly via Firestore. A new `credits-api` Cloud Run service handles Stripe Checkout, webhook processing, API key generation, and email delivery. All 18 services import the shared package; the credits-api is for purchasing only.

**Tech Stack:** TypeScript, Express, Firestore (`@google-cloud/firestore`), Stripe (`stripe` npm package), Cloud Run (us-east1, luxemara-tools project)

**Spec:** `docs/superpowers/specs/2026-04-02-stripe-prepaid-credits-design.md`

---

## File Structure

### New files

```
packages/payment-gate/
  package.json
  tsconfig.json
  src/
    index.ts              — main exports: createPaymentGate, verifyRequest
    x402.ts               — x402 USDC verification (extracted from existing payment.ts)
    stripe-credits.ts     — Firestore API key validation + atomic credit deduction
    types.ts              — PaymentGateConfig, PaymentRequirement, VerifyResult

credits-api/
  package.json
  tsconfig.json
  Dockerfile
  src/
    index.ts              — Express app, routes, webhook handler, CORS
    stripe.ts             — Stripe Checkout session creation
    types.ts              — interfaces
  public/
    index.html            — Buy credits page
    success.html          — Post-purchase API key display
```

### Modified files (per service, x17 TypeScript services)

```
{service}/src/index.ts    — replace inline paymentGate with import from shared package
{service}/src/payment.ts  — DELETE
{service}/package.json    — add @402found/payment-gate dependency
{service}/Dockerfile      — add COPY for shared package
```

### Modified files (code-quality-scanner)

```
code-quality-scanner/src/server.js    — replace inline payment functions with import
code-quality-scanner/package.json     — add @402found/payment-gate dependency
code-quality-scanner/Dockerfile       — add COPY for shared package
```

---

## Service Reference Table

| # | Service | Price | Resource URL | Notes |
|---|---------|-------|--------------|-------|
| 1 | pii-scrubber | 0.005 | https://pii-scrubber.402found.dev/mcp | |
| 2 | data-sentinel | 0.003 | https://data-sentinel.402found.dev/mcp | |
| 3 | prompt-injection-detector | 0.003 | https://prompt-injection-detector.402found.dev/mcp | |
| 4 | permission-guard | 0.002 | https://permission-guard.402found.dev/mcp | |
| 5 | agent-audit-trail | 0.001 | https://agent-audit-trail.402found.dev/mcp | |
| 6 | multi-agent-trust-verifier | 0.004 | https://multi-agent-trust-verifier.402found.dev/mcp | |
| 7 | rate-limit-manager | 0.001 | https://rate-limit-manager.402found.dev/mcp | |
| 8 | loop-gate | 0.005 | https://loop-gate.402found.dev/mcp | |
| 9 | agent-cost-meter | 0.002 | https://agent-cost-meter.402found.dev/mcp | |
| 10 | budget-ceiling-enforcer | 0.02 | https://budget-ceiling-enforcer.402found.dev/mcp | |
| 11 | agent-registry | 0.001 | https://agent-registry.402found.dev/mcp | |
| 12 | hallucination-detector | 0.003 | https://hallucination-detector.402found.dev/mcp | |
| 13 | performance-baseline-tracker | 0.10 | https://performance-baseline-tracker.402found.dev/mcp | |
| 14 | token-squeezer | 0.001 | https://token-squeezer.402found.dev/mcp | |
| 15 | format-converter | 0.001 | https://format-converter.402found.dev/mcp | |
| 16 | card-registry | 0.001 | https://card-registry.402found.dev/mcp | |
| 17 | the-prospector | 0.01 | https://the-prospector.402found.dev/mcp | |
| 18 | code-quality-scanner | 0.05 | https://code-quality-scanner.402found.dev/scan | Plain JS, node:http, port 8080 |

---

## Task 1: Create Firestore Database

**Files:**
- None (infrastructure setup)

- [ ] **Step 1: Enable Firestore API**

```bash
gcloud services enable firestore.googleapis.com --project=luxemara-tools
```

Expected: `Operation "..." finished successfully.`

- [ ] **Step 2: Create Firestore database in Native mode**

```bash
gcloud firestore databases create --location=us-east1 --project=luxemara-tools
```

Expected: `Success! Selected Google Cloud Firestore Native database for luxemara-tools`

If you get "already exists", that's fine — just verify it's in Native mode (not Datastore mode).

- [ ] **Step 3: Verify Firestore is accessible**

```bash
gcloud firestore databases describe --project=luxemara-tools
```

Expected output should show `type: FIRESTORE_NATIVE` and `locationId: us-east1`.

- [ ] **Step 4: Commit**

No files to commit — this is infrastructure only. Note in STATUS.md later.

---

## Task 2: Build Shared Payment Package — Types and x402

**Files:**
- Create: `packages/payment-gate/package.json`
- Create: `packages/payment-gate/tsconfig.json`
- Create: `packages/payment-gate/src/types.ts`
- Create: `packages/payment-gate/src/x402.ts`

- [ ] **Step 1: Create package.json**

Create `packages/payment-gate/package.json`:

```json
{
  "name": "@402found/payment-gate",
  "version": "1.0.0",
  "description": "Shared payment middleware for 402Found services — x402 + Stripe credits",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@google-cloud/firestore": "^7.11.0"
  },
  "peerDependencies": {
    "express": ">=4.0.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true }
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/payment-gate/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create types.ts**

Create `packages/payment-gate/src/types.ts`:

```typescript
export interface PaymentGateConfig {
  serviceName: string;
  price: number;
  description: string;
  resource: string;
}

export interface X402Config {
  rpcUrl: string;
  walletAddress: string;
  usdcContract: string;
  paymentAmount: string;
  chainId: string;
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  outputSchema: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
}

export interface VerifyResult {
  valid: boolean;
  method: "stripe" | "x402" | null;
  error?: string;
  statusCode: number;
  body?: Record<string, unknown>;
}
```

- [ ] **Step 4: Create x402.ts**

Create `packages/payment-gate/src/x402.ts`. This is the existing payment verification logic extracted from individual services:

```typescript
import { X402Config, PaymentRequirement, PaymentGateConfig } from "./types.js";

const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_TX_AGE_MS = 5 * 60 * 1000;

export function getX402Config(): X402Config {
  return {
    rpcUrl: process.env.CHAIN_RPC_URL ?? "https://mainnet.base.org",
    walletAddress: process.env.WALLET_ADDRESS ?? "",
    usdcContract:
      process.env.USDC_CONTRACT ??
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    paymentAmount: process.env.PAYMENT_AMOUNT ?? "0.005",
    chainId: process.env.CHAIN_ID ?? "8453",
  };
}

export async function verifyX402Payment(txHash: string): Promise<boolean> {
  const { rpcUrl, walletAddress, usdcContract } = getX402Config();

  if (!walletAddress) {
    console.error("WALLET_ADDRESS not configured");
    return false;
  }

  try {
    const receiptRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 1,
      }),
    });

    const receiptData = (await receiptRes.json()) as { result: any };
    const receipt = receiptData.result;
    if (!receipt || receipt.status !== "0x1") return false;

    const validLog = receipt.logs?.some((log: any) => {
      if (log.address.toLowerCase() !== usdcContract.toLowerCase())
        return false;
      if (log.topics[0] !== TRANSFER_EVENT_TOPIC) return false;
      const recipient = "0x" + log.topics[2].slice(26);
      return recipient.toLowerCase() === walletAddress.toLowerCase();
    });

    if (!validLog) return false;

    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [receipt.blockNumber, false],
        id: 2,
      }),
    });

    const blockData = (await blockRes.json()) as { result: any };
    const block = blockData.result;
    if (!block) return false;

    const blockTimestamp = parseInt(block.timestamp, 16) * 1000;
    const age = Date.now() - blockTimestamp;
    return age <= MAX_TX_AGE_MS;
  } catch (err: any) {
    console.error("Payment verification error:", err.message);
    return false;
  }
}

export function getPaymentRequirement(
  config: PaymentGateConfig
): PaymentRequirement {
  const x402 = getX402Config();
  return {
    scheme: "exact",
    network: `eip155:${x402.chainId}`,
    maxAmountRequired: String(
      Math.round(parseFloat(x402.paymentAmount) * 1_000_000)
    ),
    asset: x402.usdcContract,
    payTo: x402.walletAddress,
    resource: config.resource,
    description: config.description,
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
    outputSchema: {
      input: { type: "http", method: "POST" },
      output: { type: "object" },
    },
  };
}
```

- [ ] **Step 5: Install dependencies and build**

```bash
cd packages/payment-gate
npm install
npm run build
```

Expected: compiles with no errors, creates `dist/` with `.js` and `.d.ts` files.

- [ ] **Step 6: Commit**

```bash
git add packages/payment-gate/
git commit -m "feat: create @402found/payment-gate package with x402 verification"
```

---

## Task 3: Add Stripe Credits to Shared Package

**Files:**
- Create: `packages/payment-gate/src/stripe-credits.ts`
- Create: `packages/payment-gate/src/index.ts`

- [ ] **Step 1: Create stripe-credits.ts**

Create `packages/payment-gate/src/stripe-credits.ts`:

```typescript
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { PaymentGateConfig } from "./types.js";

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
  }
  return _db;
}

export interface CreditCheckResult {
  valid: boolean;
  error?: string;
  balance?: number;
  required?: number;
}

export async function validateAndDeductCredits(
  apiKey: string,
  config: PaymentGateConfig
): Promise<CreditCheckResult> {
  const db = getDb();
  const keyRef = db.collection("apiKeys").doc(apiKey);

  try {
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(keyRef);

      if (!doc.exists) {
        return { valid: false, error: "Invalid API key" } as CreditCheckResult;
      }

      const data = doc.data()!;

      if (!data.active) {
        return {
          valid: false,
          error: "API key is disabled",
        } as CreditCheckResult;
      }

      if (data.balanceUsd < config.price) {
        return {
          valid: false,
          error: "Insufficient credits",
          balance: data.balanceUsd,
          required: config.price,
        } as CreditCheckResult;
      }

      const newBalance = data.balanceUsd - config.price;

      tx.update(keyRef, {
        balanceUsd: newBalance,
        lastUsedAt: FieldValue.serverTimestamp(),
      });

      tx.create(db.collection("transactions").doc(), {
        apiKey,
        type: "deduction",
        amountUsd: config.price,
        balanceAfter: newBalance,
        service: config.serviceName,
        stripeSessionId: null,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { valid: true, balance: newBalance } as CreditCheckResult;
    });

    return result;
  } catch (err: any) {
    console.error("Credit validation error:", err.message);
    return { valid: false, error: "Internal payment error" };
  }
}
```

- [ ] **Step 2: Create index.ts — main exports**

Create `packages/payment-gate/src/index.ts`:

```typescript
import { PaymentGateConfig, VerifyResult } from "./types.js";
import { verifyX402Payment, getPaymentRequirement } from "./x402.js";
import { validateAndDeductCredits } from "./stripe-credits.js";
import type { Request, Response, NextFunction } from "express";
import type { IncomingMessage } from "node:http";

export { PaymentGateConfig, PaymentRequirement, VerifyResult } from "./types.js";
export { getPaymentRequirement } from "./x402.js";

const CREDITS_URL = "https://credits-api.402found.dev/";

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(sk_live_[a-f0-9]{64})$/i);
  return match ? match[1] : null;
}

/**
 * Express middleware for the 17 TypeScript/Express services.
 * Checks Authorization header (Stripe credits) first, then X-Payment-Tx (x402).
 */
export function createPaymentGate(config: PaymentGateConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers["authorization"] as string | undefined;
    const apiKey = extractBearerToken(authHeader);

    // Try Stripe credits first
    if (apiKey) {
      const result = await validateAndDeductCredits(apiKey, config);
      if (result.valid) {
        next();
        return;
      }
      if (result.error === "Insufficient credits") {
        res.status(402).json({
          error: "Insufficient credits",
          balance: result.balance,
          required: result.required,
          topUp: CREDITS_URL,
        });
        return;
      }
      res.status(403).json({ error: result.error });
      return;
    }

    // Fall back to x402
    const txHash = req.headers["x-payment-tx"] as string | undefined;

    if (txHash) {
      const valid = await verifyX402Payment(txHash);
      if (valid) {
        next();
        return;
      }
      res.status(402).json({
        x402Version: 1,
        accepts: [getPaymentRequirement(config)],
        error: "Payment verification failed",
        detail:
          "Transaction not found, not confirmed, wrong recipient, or expired (>5 min).",
      });
      return;
    }

    // Neither payment method provided
    res.status(402).json({
      x402Version: 1,
      accepts: [getPaymentRequirement(config)],
      stripe: {
        buyCredits: CREDITS_URL,
        docs: "Send Authorization: Bearer sk_live_... header",
      },
      error: "Payment Required",
    });
  };
}

/**
 * Standalone function for code-quality-scanner (plain JS, node:http).
 * Returns a result object instead of calling res/next.
 */
export async function verifyRequest(
  req: IncomingMessage,
  config: PaymentGateConfig
): Promise<VerifyResult> {
  const authHeader = req.headers["authorization"] as string | undefined;
  const apiKey = extractBearerToken(authHeader);

  // Try Stripe credits first
  if (apiKey) {
    const result = await validateAndDeductCredits(apiKey, config);
    if (result.valid) {
      return { valid: true, method: "stripe", statusCode: 200 };
    }
    if (result.error === "Insufficient credits") {
      return {
        valid: false,
        method: "stripe",
        error: result.error,
        statusCode: 402,
        body: {
          error: "Insufficient credits",
          balance: result.balance,
          required: result.required,
          topUp: CREDITS_URL,
        },
      };
    }
    return {
      valid: false,
      method: "stripe",
      error: result.error,
      statusCode: 403,
      body: { error: result.error },
    };
  }

  // Fall back to x402
  const txHash = req.headers["x-payment-tx"] as string | undefined;

  if (txHash) {
    const valid = await verifyX402Payment(txHash);
    if (valid) {
      return { valid: true, method: "x402", statusCode: 200 };
    }
    return {
      valid: false,
      method: "x402",
      error: "Payment verification failed",
      statusCode: 402,
      body: {
        x402Version: 1,
        accepts: [getPaymentRequirement(config)],
        error: "Payment verification failed",
        detail:
          "Transaction not found, not confirmed, wrong recipient, or expired (>5 min).",
      },
    };
  }

  // Neither payment method
  return {
    valid: false,
    method: null,
    error: "Payment Required",
    statusCode: 402,
    body: {
      x402Version: 1,
      accepts: [getPaymentRequirement(config)],
      stripe: {
        buyCredits: CREDITS_URL,
        docs: "Send Authorization: Bearer sk_live_... header",
      },
      error: "Payment Required",
    },
  };
}
```

- [ ] **Step 3: Rebuild the package**

```bash
cd packages/payment-gate
npm install
npm run build
```

Expected: compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/payment-gate/
git commit -m "feat: add Stripe credit validation and dual-payment middleware to payment-gate"
```

---

## Task 4: Migrate pii-scrubber to Shared Package (Template Service)

This is the template migration. All other 16 TypeScript services follow this exact pattern with their own config values.

**Files:**
- Modify: `pii-scrubber/package.json`
- Modify: `pii-scrubber/Dockerfile`
- Modify: `pii-scrubber/src/index.ts`
- Delete: `pii-scrubber/src/payment.ts`
- Modify: `pii-scrubber/src/types.ts` — remove PaymentRequirement (now from shared package)

- [ ] **Step 1: Update package.json — add shared package dependency**

In `pii-scrubber/package.json`, add to `dependencies`:

```json
"@402found/payment-gate": "file:../packages/payment-gate"
```

- [ ] **Step 2: Update Dockerfile — copy shared package**

Replace `pii-scrubber/Dockerfile` with:

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY packages/payment-gate/ ./packages/payment-gate/
COPY pii-scrubber/package*.json ./
RUN npm ci
COPY pii-scrubber/tsconfig.json ./
COPY pii-scrubber/src/ ./src/
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY packages/payment-gate/ ./packages/payment-gate/
COPY pii-scrubber/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY pii-scrubber/.well-known ./.well-known
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Important:** This Dockerfile must be run from the repo root with context `.`, not from the service directory. The deploy command will be:
```bash
gcloud run deploy pii-scrubber --source=. --dockerfile=pii-scrubber/Dockerfile --region=us-east1 --project=luxemara-tools
```

Alternatively, keep the Dockerfile self-contained by copying the payment-gate dist into the service before building. This is simpler for Cloud Run source deploys which zip the current directory:

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY .well-known ./.well-known
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

For this approach, before deploying each service, run:
```bash
cd packages/payment-gate && npm run build && cd ../..
cd pii-scrubber && npm install && cd ..
```

The `file:` dependency in package.json resolves at `npm install` time, copying the built package into `node_modules`. The Dockerfile stays unchanged. **Use this simpler approach.**

- [ ] **Step 3: Update src/index.ts — replace inline payment gate**

In `pii-scrubber/src/index.ts`:

Remove these lines (around line 7):
```typescript
import { verifyPayment, getPaymentRequirement } from "./payment.js";
```

Add this import:
```typescript
import { createPaymentGate } from "@402found/payment-gate";
```

Remove the entire inline `paymentGate` function (lines 127-155):
```typescript
// DELETE: async function paymentGate(...) { ... }
```

Add the configured payment gate after the CORS middleware:
```typescript
const paymentGate = createPaymentGate({
  serviceName: "pii-scrubber",
  price: 0.005,
  description: "Strips personally identifiable information from text",
  resource: "https://pii-scrubber.402found.dev/mcp",
});
```

The `app.post("/mcp", paymentGate, ...)` line stays exactly the same.

Also update the CORS middleware to allow the `Authorization` header:
```typescript
res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment-Tx, Authorization");
```

- [ ] **Step 4: Delete src/payment.ts**

```bash
rm pii-scrubber/src/payment.ts
```

- [ ] **Step 5: Remove PaymentRequirement from src/types.ts**

In `pii-scrubber/src/types.ts`, remove the `PaymentRequirement` interface (lines 16-30). Keep the PII-specific types (`PIIType`, `ScrubResult`).

- [ ] **Step 6: Build and verify**

```bash
cd pii-scrubber
npm install
npm run build
```

Expected: compiles with no errors.

- [ ] **Step 7: Commit**

```bash
git add pii-scrubber/ packages/payment-gate/
git commit -m "feat: migrate pii-scrubber to shared payment-gate package"
```

---

## Task 5: Migrate Remaining 16 TypeScript Services

Apply the same pattern from Task 4 to each service. For each service:

1. Add `"@402found/payment-gate": "file:../packages/payment-gate"` to `package.json` dependencies
2. In `src/index.ts`: replace `import { verifyPayment, getPaymentRequirement } from "./payment.js"` with `import { createPaymentGate } from "@402found/payment-gate"`
3. In `src/index.ts`: remove inline `paymentGate` function, add configured `createPaymentGate()` call
4. In `src/index.ts`: add `Authorization` to CORS `Access-Control-Allow-Headers`
5. Delete `src/payment.ts`
6. Remove `PaymentRequirement` from `src/types.ts` if present
7. Run `npm install && npm run build` to verify

**Service-specific config values (use these exact values in createPaymentGate):**

- [ ] **data-sentinel**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "data-sentinel",
  price: 0.003,
  description: "Deep second-pass scan for sensitive data",
  resource: "https://data-sentinel.402found.dev/mcp",
});
```

- [ ] **prompt-injection-detector**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "prompt-injection-detector",
  price: 0.003,
  description: "Scans text for prompt injection patterns",
  resource: "https://prompt-injection-detector.402found.dev/mcp",
});
```

- [ ] **permission-guard**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "permission-guard",
  price: 0.002,
  description: "Checks if an agent action exceeds its defined scope",
  resource: "https://permission-guard.402found.dev/mcp",
});
```

- [ ] **agent-audit-trail**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "agent-audit-trail",
  price: 0.001,
  description: "Creates tamper-evident HMAC-signed audit log entries",
  resource: "https://agent-audit-trail.402found.dev/mcp",
});
```

- [ ] **multi-agent-trust-verifier**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "multi-agent-trust-verifier",
  price: 0.004,
  description: "Verifies trust between agents by checking goal alignment and scope",
  resource: "https://multi-agent-trust-verifier.402found.dev/mcp",
});
```

- [ ] **rate-limit-manager**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "rate-limit-manager",
  price: 0.001,
  description: "Manages agent request rate limiting with sliding window",
  resource: "https://rate-limit-manager.402found.dev/mcp",
});
```

- [ ] **loop-gate**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "loop-gate",
  price: 0.005,
  description: "Clears loop-detection state for blocked agents",
  resource: "https://loop-gate.402found.dev/mcp",
});
```

- [ ] **agent-cost-meter**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "agent-cost-meter",
  price: 0.002,
  description: "Tracks cumulative agent session spend against budget",
  resource: "https://agent-cost-meter.402found.dev/mcp",
});
```

- [ ] **budget-ceiling-enforcer**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "budget-ceiling-enforcer",
  price: 0.02,
  description: "Prevents runaway cloud costs from AI agent usage",
  resource: "https://budget-ceiling-enforcer.402found.dev/mcp",
});
```

- [ ] **agent-registry**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "agent-registry",
  price: 0.001,
  description: "Central inventory of all deployed AI agents",
  resource: "https://agent-registry.402found.dev/mcp",
});
```

- [ ] **hallucination-detector**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "hallucination-detector",
  price: 0.003,
  description: "Scores AI-generated text for likely hallucinated facts",
  resource: "https://hallucination-detector.402found.dev/mcp",
});
```

- [ ] **performance-baseline-tracker**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "performance-baseline-tracker",
  price: 0.10,
  description: "Captures and monitors AI agent output quality over time",
  resource: "https://performance-baseline-tracker.402found.dev/mcp",
});
```

- [ ] **token-squeezer**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "token-squeezer",
  price: 0.001,
  description: "Compresses text to reduce LLM token usage",
  resource: "https://token-squeezer.402found.dev/mcp",
});
```

- [ ] **format-converter**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "format-converter",
  price: 0.001,
  description: "Converts data between JSON, CSV, XML, YAML, Markdown, HTML, and TOML",
  resource: "https://format-converter.402found.dev/mcp",
});
```

- [ ] **card-registry**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "card-registry",
  price: 0.001,
  description: "Registers agent-card.json at permanent public URLs",
  resource: "https://card-registry.402found.dev/mcp",
});
```

- [ ] **the-prospector**
```typescript
const paymentGate = createPaymentGate({
  serviceName: "the-prospector",
  price: 0.01,
  description: "Generates A2A agent cards from service metadata",
  resource: "https://the-prospector.402found.dev/mcp",
});
```

- [ ] **Commit after each batch of ~4 services, or all at once**

```bash
git add data-sentinel/ prompt-injection-detector/ permission-guard/ agent-audit-trail/
git add multi-agent-trust-verifier/ rate-limit-manager/ loop-gate/ agent-cost-meter/
git add budget-ceiling-enforcer/ agent-registry/ hallucination-detector/ performance-baseline-tracker/
git add token-squeezer/ format-converter/ card-registry/ the-prospector/
git commit -m "feat: migrate all 16 remaining TypeScript services to shared payment-gate"
```

---

## Task 6: Migrate code-quality-scanner (Plain JS)

**Files:**
- Modify: `code-quality-scanner/package.json`
- Modify: `code-quality-scanner/src/server.js`

- [ ] **Step 1: Update package.json**

In `code-quality-scanner/package.json`, add to dependencies:

```json
"@402found/payment-gate": "file:../packages/payment-gate"
```

- [ ] **Step 2: Update server.js — replace inline payment logic**

In `code-quality-scanner/src/server.js`:

Remove lines 9-117 (everything from `// ---- x402 Payment Configuration ----` through the end of `function paymentGate`).

Add this import at the top (after the existing imports):

```javascript
import { verifyRequest } from "@402found/payment-gate";
```

Replace the `handleScan` function (lines 138-216) with:

```javascript
async function handleScan(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "POST required" });
  }

  const payResult = await verifyRequest(req, {
    serviceName: "code-quality-scanner",
    price: 0.05,
    description: "Detects vibe-code anti-patterns in AI agent code",
    resource: "https://code-quality-scanner.402found.dev/scan",
  });
  if (!payResult.valid) {
    return json(res, payResult.statusCode, payResult.body);
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const { code, language, filename } = payload;

  if (!code || typeof code !== "string") {
    return json(res, 400, { error: "`code` field is required (string)" });
  }

  const lang = (language || inferLanguage(filename, code)).toLowerCase();

  let issues;
  switch (lang) {
    case "python":
    case "py":
      issues = scanPython(code);
      break;
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
      issues = scanJavaScript(code);
      break;
    case "prompt":
    case "llm":
      issues = scanPrompt(code);
      break;
    default:
      issues = [
        ...scanPython(code),
        ...scanJavaScript(code),
        ...scanPrompt(code),
      ];
      const seen = new Set();
      issues = issues.filter((i) => {
        const key = `${i.line}:${i.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const { score, productionReady } = computeScore(issues);

  const result = {
    scanner: "code-quality-scanner",
    version: "1.0.0",
    language: lang,
    linesAnalyzed: code.split("\n").length,
    qualityScore: score,
    productionReady,
    issueCount: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === "CRITICAL").length,
      high: issues.filter((i) => i.severity === "HIGH").length,
      medium: issues.filter((i) => i.severity === "MEDIUM").length,
      low: issues.filter((i) => i.severity === "LOW").length,
    },
    issues: issues.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity)
    ),
  };

  return json(res, 200, result);
}
```

Also update the CORS headers in the `json` function to include `Authorization`:

```javascript
function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://402found.dev",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment-Tx, Authorization",
  });
  res.end(JSON.stringify(body));
}
```

And the OPTIONS handler (lines 275-284):

```javascript
if (req.method === "OPTIONS") {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "https://402found.dev",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment-Tx, Authorization",
  });
  res.end();
  return;
}
```

- [ ] **Step 3: Install dependencies and test**

```bash
cd code-quality-scanner
npm install
node src/server.js
```

Expected: `Code Quality Scanner listening on :8080` — verify it starts without errors, then Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add code-quality-scanner/
git commit -m "feat: migrate code-quality-scanner to shared payment-gate package"
```

---

## Task 7: Build Credits API Service — Stripe Checkout

**Files:**
- Create: `credits-api/package.json`
- Create: `credits-api/tsconfig.json`
- Create: `credits-api/Dockerfile`
- Create: `credits-api/src/index.ts`
- Create: `credits-api/src/stripe.ts`
- Create: `credits-api/src/types.ts`

- [ ] **Step 1: Create package.json**

Create `credits-api/package.json`:

```json
{
  "name": "credits-api",
  "version": "1.0.0",
  "description": "Stripe prepaid credits API for 402Found services",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js"
  },
  "dependencies": {
    "@google-cloud/firestore": "^7.11.0",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "stripe": "^17.7.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `credits-api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create types.ts**

Create `credits-api/src/types.ts`:

```typescript
export interface CheckoutRequest {
  amount: number;
  email: string;
}

export interface ApiKeyDoc {
  email: string;
  balanceUsd: number;
  totalPurchasedUsd: number;
  stripeCustomerId: string;
  createdAt: FirebaseFirestore.Timestamp;
  lastUsedAt: FirebaseFirestore.Timestamp | null;
  lastChargeSessionId: string;
  active: boolean;
}
```

- [ ] **Step 4: Create stripe.ts**

Create `credits-api/src/stripe.ts`:

```typescript
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export async function createCheckoutSession(
  amount: number,
  email: string,
  successUrl: string
): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: "402Found API Credits",
            description: `$${amount.toFixed(2)} in API credits for 402Found.dev agent services`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: successUrl,
    metadata: {
      creditAmount: amount.toString(),
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}
```

- [ ] **Step 5: Create index.ts — Express app with checkout route**

Create `credits-api/src/index.ts`:

```typescript
import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { getStripe, createCheckoutSession } from "./stripe.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL ?? "https://credits-api.402found.dev/success";

const db = new Firestore();
const app = express();

// Stripe webhook needs raw body — must be before express.json()
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_email ?? session.customer_details?.email ?? "";
      const amount = parseFloat(session.metadata?.creditAmount ?? "0");
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? "";

      if (amount <= 0) {
        console.error("Invalid credit amount in session:", session.id);
        res.status(400).json({ error: "Invalid amount" });
        return;
      }

      // Generate API key
      const apiKey = "sk_live_" + crypto.randomBytes(32).toString("hex");

      // Check if this email already has a key — top up instead of creating new
      const existing = await db
        .collection("apiKeys")
        .where("email", "==", email)
        .where("active", "==", true)
        .limit(1)
        .get();

      if (!existing.empty) {
        // Top up existing key
        const doc = existing.docs[0];
        const oldBalance = doc.data().balanceUsd;
        const newBalance = oldBalance + amount;

        await db.runTransaction(async (tx) => {
          tx.update(doc.ref, {
            balanceUsd: newBalance,
            totalPurchasedUsd: FieldValue.increment(amount),
            lastChargeSessionId: session.id,
          });
          tx.create(db.collection("transactions").doc(), {
            apiKey: doc.id,
            type: "purchase",
            amountUsd: amount,
            balanceAfter: newBalance,
            service: null,
            stripeSessionId: session.id,
            createdAt: FieldValue.serverTimestamp(),
          });
        });

        // Store session→key mapping for success page
        await db.collection("checkoutSessions").doc(session.id).set({
          apiKey: doc.id,
          email,
          amount,
          isTopUp: true,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Create new key
        await db.runTransaction(async (tx) => {
          tx.set(db.collection("apiKeys").doc(apiKey), {
            email,
            balanceUsd: amount,
            totalPurchasedUsd: amount,
            stripeCustomerId: customerId,
            createdAt: FieldValue.serverTimestamp(),
            lastUsedAt: null,
            lastChargeSessionId: session.id,
            active: true,
          });
          tx.create(db.collection("transactions").doc(), {
            apiKey,
            type: "purchase",
            amountUsd: amount,
            balanceAfter: amount,
            service: null,
            stripeSessionId: session.id,
            createdAt: FieldValue.serverTimestamp(),
          });
        });

        // Store session→key mapping for success page
        await db.collection("checkoutSessions").doc(session.id).set({
          apiKey,
          email,
          amount,
          isTopUp: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Send confirmation email (best-effort, don't block response)
      sendConfirmationEmail(
        email,
        existing.empty ? apiKey : existing.docs[0].id,
        amount,
        existing.empty
      ).catch((err) =>
        console.error("Failed to send confirmation email:", err.message)
      );
    }

    res.json({ received: true });
  }
);

// Parse JSON for all other routes
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://402found.dev");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Serve static files
app.use(express.static(path.resolve(__dirname, "..", "public")));

// Create checkout session
app.post("/api/checkout", async (req, res) => {
  const { amount, email } = req.body;

  if (!amount || typeof amount !== "number" || amount < 1) {
    res.status(400).json({ error: "Amount must be at least $1" });
    return;
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  try {
    const url = await createCheckoutSession(amount, email, SUCCESS_URL);
    res.json({ url });
  } catch (err: any) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Check balance
app.get("/api/balance", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  const match = authHeader?.match(/^Bearer\s+(sk_live_[a-f0-9]{64})$/i);
  if (!match) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  const doc = await db.collection("apiKeys").doc(match[1]).get();
  if (!doc.exists || !doc.data()?.active) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  const data = doc.data()!;
  res.json({
    balance: data.balanceUsd,
    totalPurchased: data.totalPurchasedUsd,
    email: data.email,
    active: data.active,
  });
});

// Success page — look up API key from session ID
app.get("/api/session/:sessionId", async (req, res) => {
  const doc = await db
    .collection("checkoutSessions")
    .doc(req.params.sessionId)
    .get();
  if (!doc.exists) {
    res.status(404).json({ error: "Session not found — key may still be processing" });
    return;
  }
  const data = doc.data()!;
  res.json({
    apiKey: data.apiKey,
    email: data.email,
    amount: data.amount,
    isTopUp: data.isTopUp,
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Credits API running on port ${PORT}`);
});

// Email helper — uses stableemail.dev via fetch
async function sendConfirmationEmail(
  to: string,
  apiKey: string,
  amount: number,
  isNew: boolean
): Promise<void> {
  // Placeholder: implement with stableemail.dev or another provider
  // For now, log the key so it's recoverable from Cloud Run logs
  console.log(
    `[EMAIL] ${isNew ? "New key" : "Top-up"} for ${to}: key=${apiKey.slice(0, 16)}..., amount=$${amount}`
  );
}
```

- [ ] **Step 6: Install dependencies and build**

```bash
cd credits-api
npm install
npm run build
```

Expected: compiles with no errors.

- [ ] **Step 7: Commit**

```bash
git add credits-api/
git commit -m "feat: create credits-api service with Stripe Checkout and Firestore"
```

---

## Task 8: Build Credits API — Frontend Pages

**Files:**
- Create: `credits-api/public/index.html`
- Create: `credits-api/public/success.html`
- Create: `credits-api/Dockerfile`

- [ ] **Step 1: Create buy credits page**

Create `credits-api/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Buy API Credits — 402Found.dev</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{max-width:480px;width:90%;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:2.5rem}
h1{font-size:1.5rem;color:#fff;margin-bottom:.5rem;text-align:center}
.subtitle{color:#999;text-align:center;margin-bottom:2rem;font-size:.95rem}
label{display:block;color:#ccc;margin-bottom:.5rem;font-size:.9rem}
input{width:100%;padding:.75rem;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:1rem;margin-bottom:1rem}
input:focus{outline:none;border-color:#00d4aa}
.presets{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin-bottom:1rem}
.preset{padding:.6rem;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#ccc;cursor:pointer;text-align:center;font-size:.95rem;transition:all .15s}
.preset:hover,.preset.active{border-color:#00d4aa;color:#00d4aa;background:#1a2e28}
button{width:100%;padding:.85rem;background:#00d4aa;color:#0a0a0a;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity .15s}
button:hover{opacity:.9}
button:disabled{opacity:.5;cursor:not-allowed}
.error{color:#ff6b6b;font-size:.85rem;margin-bottom:1rem;display:none}
.back{display:block;text-align:center;margin-top:1.5rem;color:#00d4aa;text-decoration:none;font-size:.9rem}
.back:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <h1>Buy API Credits</h1>
  <p class="subtitle">Prepaid credits for all 402Found.dev agent services</p>
  <div class="presets">
    <div class="preset" data-amount="5">$5</div>
    <div class="preset" data-amount="10">$10</div>
    <div class="preset" data-amount="25">$25</div>
    <div class="preset" data-amount="50">$50</div>
  </div>
  <label for="amount">Or enter custom amount (min $1)</label>
  <input type="number" id="amount" min="1" step="0.01" placeholder="5.00">
  <label for="email">Email (for API key delivery)</label>
  <input type="email" id="email" placeholder="you@example.com">
  <div class="error" id="error"></div>
  <button id="buy" onclick="checkout()">Buy Credits</button>
  <a class="back" href="https://402found.dev">&larr; 402Found.dev</a>
</div>
<script>
const presets = document.querySelectorAll('.preset');
const amountInput = document.getElementById('amount');
const emailInput = document.getElementById('email');
const errorEl = document.getElementById('error');
const buyBtn = document.getElementById('buy');

presets.forEach(p => {
  p.addEventListener('click', () => {
    presets.forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    amountInput.value = p.dataset.amount;
  });
});

amountInput.addEventListener('input', () => {
  presets.forEach(x => x.classList.remove('active'));
});

async function checkout() {
  const amount = parseFloat(amountInput.value);
  const email = emailInput.value.trim();
  errorEl.style.display = 'none';

  if (!amount || amount < 1) {
    errorEl.textContent = 'Amount must be at least $1';
    errorEl.style.display = 'block';
    return;
  }
  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email';
    errorEl.style.display = 'block';
    return;
  }

  buyBtn.disabled = true;
  buyBtn.textContent = 'Redirecting...';

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, email }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Failed to create checkout');
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
    buyBtn.disabled = false;
    buyBtn.textContent = 'Buy Credits';
  }
}
</script>
</body>
</html>
```

- [ ] **Step 2: Create success page**

Create `credits-api/public/success.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Credits Purchased — 402Found.dev</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{max-width:560px;width:90%;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:2.5rem;text-align:center}
h1{font-size:1.5rem;color:#fff;margin-bottom:.5rem}
.check{font-size:3rem;margin-bottom:1rem}
.amount{color:#00d4aa;font-size:1.2rem;margin-bottom:1.5rem}
.key-box{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:1rem;margin:1.5rem 0;text-align:left;word-break:break-all;font-family:monospace;font-size:.85rem;color:#00d4aa;position:relative;cursor:pointer}
.key-box:hover{border-color:#00d4aa}
.copy-hint{font-size:.8rem;color:#666;margin-top:.5rem}
.info{color:#999;font-size:.9rem;line-height:1.6;margin:1.5rem 0}
.usage{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:1rem;text-align:left;margin:1rem 0;font-family:monospace;font-size:.8rem;color:#ccc;overflow-x:auto}
.links{display:flex;gap:1rem;justify-content:center;margin-top:1.5rem}
a{color:#00d4aa;text-decoration:none;font-size:.9rem}a:hover{text-decoration:underline}
.loading{color:#999}
.error{color:#ff6b6b}
</style>
</head>
<body>
<div class="card" id="content">
  <div class="loading">Loading your API key...</div>
</div>
<script>
async function load() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const content = document.getElementById('content');

  if (!sessionId) {
    content.innerHTML = '<div class="error">No session ID found.</div>';
    return;
  }

  // Poll for key (webhook may take a moment)
  let data;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('/api/session/' + sessionId);
      if (res.ok) { data = await res.json(); break; }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!data) {
    content.innerHTML = '<div class="error">Could not retrieve your API key. Please check your email or contact support.</div>';
    return;
  }

  const action = data.isTopUp ? 'Credits Added' : 'Credits Purchased';
  content.innerHTML = `
    <div class="check">&#10003;</div>
    <h1>${action}!</h1>
    <div class="amount">$${data.amount.toFixed(2)} added to your account</div>
    <p class="info">Your API key${data.isTopUp ? ' (same key, topped up)' : ''}:</p>
    <div class="key-box" onclick="navigator.clipboard.writeText('${data.apiKey}').then(()=>{this.style.borderColor='#00ff88';setTimeout(()=>this.style.borderColor='#333',1500)})">${data.apiKey}</div>
    <div class="copy-hint">Click to copy</div>
    <p class="info">Save this key! It was also sent to <strong>${data.email}</strong>.<br>Use it as a Bearer token in any 402Found service:</p>
    <div class="usage">curl -X POST https://pii-scrubber.402found.dev/mcp \\<br>&nbsp;&nbsp;-H "Authorization: Bearer ${data.apiKey}" \\<br>&nbsp;&nbsp;-H "Content-Type: application/json" \\<br>&nbsp;&nbsp;-d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"scrub_pii","arguments":{"text":"test"}},"id":1}'</div>
    <div class="links">
      <a href="https://402found.dev">&larr; 402Found.dev</a>
      <a href="/">Buy More Credits</a>
    </div>
  `;
}
load();
</script>
</body>
</html>
```

- [ ] **Step 3: Create Dockerfile**

Create `credits-api/Dockerfile`:

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY public/ ./public/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: Build and verify**

```bash
cd credits-api
npm install
npm run build
```

Expected: compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add credits-api/
git commit -m "feat: add credits-api frontend pages and Dockerfile"
```

---

## Task 9: Deploy Credits API to Cloud Run

**Files:** None (deployment)

- [ ] **Step 1: Deploy the service**

```bash
cd credits-api
gcloud run deploy credits-api \
  --source=. \
  --region=us-east1 \
  --project=luxemara-tools \
  --allow-unauthenticated \
  --set-env-vars="STRIPE_SECRET_KEY=sk_test_PLACEHOLDER,STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER,STRIPE_SUCCESS_URL=https://credits-api.402found.dev/success"
```

Replace `PLACEHOLDER` values with actual Stripe keys. Use test keys first for testing.

Expected: service deploys and returns a `.run.app` URL.

- [ ] **Step 2: Create Cloud Run domain mapping**

```bash
gcloud beta run domain-mappings create \
  --service=credits-api \
  --domain=credits-api.402found.dev \
  --region=us-east1 \
  --project=luxemara-tools
```

- [ ] **Step 3: Add Cloudflare DNS record**

In Cloudflare DNS for 402found.dev:
- Type: CNAME
- Name: `credits-api`
- Target: `ghs.googlehosted.com`
- Proxy: OFF (gray cloud) until SSL cert is issued

- [ ] **Step 4: Configure Stripe webhook**

In Stripe Dashboard → Webhooks:
- Endpoint URL: `https://credits-api.402found.dev/api/webhook`
- Events: `checkout.session.completed`
- Copy the webhook signing secret and update the Cloud Run env var:

```bash
gcloud run services update credits-api \
  --region=us-east1 \
  --project=luxemara-tools \
  --update-env-vars="STRIPE_WEBHOOK_SECRET=whsec_ACTUAL_SECRET"
```

- [ ] **Step 5: Test the full flow**

1. Visit `https://credits-api.402found.dev/`
2. Enter $5 and your email
3. Complete Stripe test payment (card 4242 4242 4242 4242)
4. Verify redirect to success page showing API key
5. Test the key:
```bash
curl -X POST https://pii-scrubber.402found.dev/mcp \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"scrub_pii","arguments":{"text":"My SSN is 123-45-6789"}},"id":1}'
```

Expected: 200 response with scrubbed text.

6. Check balance:
```bash
curl https://credits-api.402found.dev/api/balance \
  -H "Authorization: Bearer sk_live_YOUR_KEY"
```

Expected: balance should be $4.995 ($5.00 - $0.005 deduction).

- [ ] **Step 6: Commit any deployment fixes**

---

## Task 10: Deploy All 18 Services with Shared Package

**Files:** None (deployment)

Before deploying each service, rebuild the shared package so `node_modules` has the latest:

```bash
cd packages/payment-gate && npm run build && cd ../..
```

- [ ] **Step 1: Deploy services in batches**

For each service, run from its directory:

```bash
cd {service-name} && npm install && gcloud run deploy {service-name} --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
```

Deploy in batches of 4-5 to avoid rate limits:

**Batch 1:**
```bash
cd pii-scrubber && npm install && gcloud run deploy pii-scrubber --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd data-sentinel && npm install && gcloud run deploy data-sentinel --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd prompt-injection-detector && npm install && gcloud run deploy prompt-injection-detector --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd permission-guard && npm install && gcloud run deploy permission-guard --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
```

**Batch 2:**
```bash
cd agent-audit-trail && npm install && gcloud run deploy agent-audit-trail --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd multi-agent-trust-verifier && npm install && gcloud run deploy multi-agent-trust-verifier --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd rate-limit-manager && npm install && gcloud run deploy rate-limit-manager --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd loop-gate && npm install && gcloud run deploy loop-gate --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
```

**Batch 3:**
```bash
cd agent-cost-meter && npm install && gcloud run deploy agent-cost-meter --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd budget-ceiling-enforcer && npm install && gcloud run deploy budget-ceiling-enforcer --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd agent-registry && npm install && gcloud run deploy agent-registry --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd hallucination-detector && npm install && gcloud run deploy hallucination-detector --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
```

**Batch 4:**
```bash
cd performance-baseline-tracker && npm install && gcloud run deploy performance-baseline-tracker --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd token-squeezer && npm install && gcloud run deploy token-squeezer --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd format-converter && npm install && gcloud run deploy format-converter --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd card-registry && npm install && gcloud run deploy card-registry --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
```

**Batch 5:**
```bash
cd the-prospector && npm install && gcloud run deploy the-prospector --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
cd code-quality-scanner && npm install && gcloud run deploy code-quality-scanner --source=. --region=us-east1 --project=luxemara-tools --allow-unauthenticated && cd ..
```

- [ ] **Step 2: Verify all 18 services respond**

```bash
for agent in pii-scrubber data-sentinel prompt-injection-detector permission-guard agent-audit-trail multi-agent-trust-verifier rate-limit-manager loop-gate agent-cost-meter budget-ceiling-enforcer agent-registry code-quality-scanner hallucination-detector performance-baseline-tracker token-squeezer format-converter card-registry the-prospector; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://${agent}.402found.dev/")
  echo "$agent: HTTP $code"
done
```

Expected: all 18 return HTTP 200.

- [ ] **Step 3: Test x402 still works on one service**

Send a request without any auth header and verify you get a 402 response that includes both payment options:

```bash
curl -s https://pii-scrubber.402found.dev/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"scrub_pii","arguments":{"text":"test"}},"id":1}' | jq .
```

Expected: 402 response with both `accepts` (x402) and `stripe` fields.

---

## Task 11: Update STATUS.md and Website

**Files:**
- Modify: `STATUS.md`
- Modify: `index.html` (add credit purchase link)

- [ ] **Step 1: Update STATUS.md**

Add to the session log section and update remaining steps to reflect Stripe credits are live.

- [ ] **Step 2: Update index.html**

Add a "Buy API Credits" button/link to the main 402found.dev landing page that points to `https://credits-api.402found.dev/`.

- [ ] **Step 3: Update landing pages on all 18 services**

Each service's landing page HTML (the `app.get("/", ...)` handler) currently only mentions x402. Add a line mentioning Stripe credits are also accepted. For example, update the badge:

```html
<div class="badge">x402 · USDC on Base · Stripe Credits</div>
```

And add a link:

```html
<a href="https://credits-api.402found.dev">Buy Credits</a>
```

- [ ] **Step 4: Commit**

```bash
git add STATUS.md index.html
git commit -m "docs: update STATUS.md and website with Stripe credits info"
```

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```
