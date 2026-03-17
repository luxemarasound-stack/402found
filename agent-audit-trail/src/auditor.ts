import { createHmac, randomUUID } from "node:crypto";
import { AuditInput, AuditReceipt } from "./types.js";

function getHmacSecret(): string {
  return process.env.HMAC_SECRET ?? "default-hmac-secret-change-me";
}

export function logAgentAction(input: AuditInput): AuditReceipt {
  const receiptId = `receipt_${randomUUID().replace(/-/g, "")}`;
  const timestamp = input.timestamp || new Date().toISOString();

  // Build canonical string for HMAC signing
  const canonical = JSON.stringify({
    receiptId,
    agentId: input.agentId,
    action: input.action,
    timestamp,
    payload: input.payload ?? null,
    outcome: input.outcome ?? null,
  });

  const hmac = createHmac("sha256", getHmacSecret());
  hmac.update(canonical);
  const hmacSignature = hmac.digest("hex");

  return {
    receiptId,
    hmacSignature,
    timestamp,
    action: input.action,
    agentId: input.agentId,
    verified: true,
  };
}
