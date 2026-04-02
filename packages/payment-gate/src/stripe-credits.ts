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
