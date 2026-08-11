export type JobState =
  | "Open"
  | "Active"
  | "Disputed"
  | "Completed"
  | "Refunded";

export type ResolveFavour = "artisan" | "customer";

export type JobRecord = {
  jobId: string;
  customer: string;
  artisan: string;
  amount: string;
  state: JobState;
  createdAt: string;
  disputeAt: string | null;
  jobHash: string;
  trade: string;
  description?: string;
  contractTxHash?: string;
};

export type Reputation = {
  artisan: string;
  completed: number;
  disputed: number;
  totalEarned: string;
};

export type SettlementEventType = "payout" | "refund" | "dispute_refund";

export type SettlementEvent = {
  id: string;
  jobId: string;
  type: SettlementEventType;
  amount: string;
  from: string;
  to: string;
  transactionHash: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
};

export type IdempotencyKey = {
  key: string;
  jobId: string;
  operation: string;
  createdAt: string;
  expiresAt: string;
};

export type EscrowStatus =
  | "funding_pending"
  | "funds_locked"
  | "release_pending"
  | "released"
  | "refunded"
  | "disputed";

export type PaymentEventType =
  | "funding_initiated"
  | "funds_locked"
  | "release_initiated"
  | "released"
  | "refund_initiated"
  | "refunded"
  | "dispute_raised"
  | "dispute_resolved"
  | "transaction_failed"
  | "idempotency_detected";

export type EscrowState = {
  jobId: string;
  status: EscrowStatus;
  contractTxHash: string | null;
  fundingTxHash: string | null;
  releaseTxHash: string | null;
  refundTxHash: string | null;
  amountStroops: string;
  fundedAt: string | null;
  lockedAt: string | null;
  releaseInitiatedAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
  contractResponse: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentEvent = {
  id: number;
  jobId: string;
  eventType: PaymentEventType;
  status: "pending" | "completed" | "failed";
  transactionHash: string | null;
  fromWallet: string | null;
  toWallet: string | null;
  amountStroops: string | null;
  metadata: Record<string, any> | null;
  errorMessage: string | null;
  initiatedBy: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentIdempotencyKey = {
  key: string;
  jobId: string;
  operation: "fund" | "lock" | "release" | "refund" | "dispute" | "resolve";
  requestPayload: Record<string, any>;
  responsePayload: Record<string, any> | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};
