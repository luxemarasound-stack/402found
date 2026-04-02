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
