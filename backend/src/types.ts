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

// User Management Types
export type UserPreferences = {
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  preferredLanguage: string;
  timezone: string;
  receivePromotionalEmails: boolean;
  notificationSettings: Record<string, unknown>;
};

export type UserProfile = {
  id: string; // Stellar public key
  email: string;
  fullName: string | null;
  profileImageUrl: string | null;
  preferences: Record<string, unknown>;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProfileImage = {
  id: string;
  userId: string;
  imageUrl: string;
  mimeType: string;
  fileSize: number;
  isCurrent: boolean;
  createdAt: string;
};

export type AccountDeletionRequest = {
  id: string;
  userId: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  confirmationToken: string;
  requestedAt: string;
  confirmedAt: string | null;
  completionAt: string | null;
  expiresAt: string;
  reason: string | null;
};
