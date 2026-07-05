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
      error: "Payment Required",
    },
  };
}
