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

// Authentication Types
export type RefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
  isRevoked: boolean;
  revokedAt: string | null;
};

export type PasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  isUsed: boolean;
  usedAt: string | null;
  ipAddress: string | null;
};

export type UserSession = {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isActive: boolean;
  terminatedAt: string | null;
};

export type LoginAttempt = {
  id: number;
  userId: string | null;
  email: string | null;
  ipAddress: string;
  successful: boolean;
  failureReason: string | null;
  userAgent: string | null;
  attemptedAt: string;
};

export type BlacklistedToken = {
  id: string;
  tokenHash: string;
  userId: string;
  tokenType: "access" | "refresh";
  expiresAt: string;
  blacklistedAt: string;
  reason: string | null;
};

export type AuthUser = {
  userId: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
};

export type LoginResult = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    emailVerified: boolean;
  };
  accessToken: string;
  refreshToken: string;
  session: {
    id: string;
    deviceId: string;
    expiresAt: string;
  };
};

export type TokenPayload = {
  userId: string;
  email: string;
  type: "access" | "refresh";
  deviceId?: string;
  jti?: string;
};

export type DeviceInfo = {
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type SessionInfo = {
  id: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isActive: boolean;
  isCurrent?: boolean;
};

export type PasswordResetRequest = {
  success: boolean;
  message: string;
};

export type PasswordResetVerification = {
  valid: boolean;
  message?: string;
};

export type LoginHistoryEntry = {
  attemptedAt: string;
  ipAddress: string;
  successful: boolean;
  failureReason: string | null;
  userAgent: string | null;
};
