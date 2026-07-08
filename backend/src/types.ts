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
