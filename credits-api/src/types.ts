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
