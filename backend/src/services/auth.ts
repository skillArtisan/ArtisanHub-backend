import { randomUUID } from "node:crypto";
import db from "../db.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  blacklistToken,
  getTokenExpiryDate,
} from "../utils/jwt.js";
import {
  generateDeviceId,
  parseDeviceInfo,
  createSession,
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  checkAndNotifyNewDevice,
  updateSessionActivity,
} from "./session.js";

export interface LoginResult {
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
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string;
  stellarPublicKey?: string; // Optional Stellar integration
}

/**
 * Record a login attempt
 */
async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  userAgent: string,
  successful: boolean,
  userId?: string,
  failureReason?: string
): Promise<void> {
  await db("login_attempts").insert({
    user_id: userId || null,
    email,
    ip_address: ipAddress,
    successful,
    failure_reason: failureReason || null,
    user_agent: userAgent,
    attempted_at: new Date().toISOString(),
  });
}

/**
 * Check if user has exceeded login attempt limit
 */
async function checkLoginAttempts(
  email: string,
  ipAddress: string
): Promise<{ allowed: boolean; remainingAttempts: number }> {
  const windowStart = new Date(
    Date.now() - config.security.loginAttemptWindow
  ).toISOString();

  const attempts = await db("login_attempts")
    .where({ email, successful: false })
    .where("attempted_at", ">", windowStart)
    .count("* as count")
    .first();

  const failedAttempts = Number(attempts?.count || 0);
  const remainingAttempts = Math.max(
    0,
    config.security.maxLoginAttempts - failedAttempts
  );

  return {
    allowed: failedAttempts < config.security.maxLoginAttempts,
    remainingAttempts,
  };
}

/**
 * Register a new user with email and password
 */
export async function register(input: RegisterInput): Promise<{
  userId: string;
  email: string;
  verificationRequired: boolean;
}> {
  // Check if email already exists
  const existing = await db("users").where({ email: input.email }).first();
  if (existing) {
    throw new Error("Email already registered");
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Generate user ID
  const userId = input.stellarPublicKey || `user_${randomUUID()}`;

  // Generate verification token
  const verificationToken = randomUUID();
  const verificationTokenExpiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString(); // 24 hours

  // Create user
  await db("users").insert({
    id: userId,
    email: input.email,
    full_name: input.fullName || null,
    password_hash: passwordHash,
    email_verified: false,
    verification_token: verificationToken,
    verification_token_expires_at: verificationTokenExpiresAt,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Create default preferences
  await db("user_preferences").insert({
    user_id: userId,
    notifications_enabled: true,
    email_notifications: true,
    preferred_language: "en",
    timezone: "UTC",
    receive_promotional_emails: false,
    notification_settings: {},
  });

  return {
    userId,
    email: input.email,
    verificationRequired: true,
  };
}

/**
 * Login with email and password
 */
export async function login(
  email: string,
  password: string,
  userAgent: string,
  ipAddress: string
): Promise<LoginResult> {
  // Check rate limiting
  const { allowed, remainingAttempts } = await checkLoginAttempts(
    email,
    ipAddress
  );

  if (!allowed) {
    await recordLoginAttempt(
      email,
      ipAddress,
      userAgent,
      false,
      undefined,
      "rate_limit_exceeded"
    );
    throw new Error(
      `Too many failed login attempts. Please try again later.`
    );
  }

  // Find user
  const user = await db("users").where({ email }).first();

  if (!user || !user.password_hash) {
    await recordLoginAttempt(
      email,
      ipAddress,
      userAgent,
      false,
      undefined,
      "invalid_credentials"
    );
    throw new Error("Invalid email or password");
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, user.password_hash);

  if (!isValidPassword) {
    await recordLoginAttempt(
      email,
      ipAddress,
      userAgent,
      false,
      user.id,
      "invalid_password"
    );
    throw new Error("Invalid email or password");
  }

  // Check if account is active
  if (!user.is_active) {
    await recordLoginAttempt(
      email,
      ipAddress,
      userAgent,
      false,
      user.id,
      "account_inactive"
    );
    throw new Error("Account is inactive");
  }

  // Parse device info
  const deviceInfo = parseDeviceInfo(userAgent, ipAddress);
  const deviceId = generateDeviceId(userAgent, ipAddress);

  // Check if this is a new device
  await checkAndNotifyNewDevice(
    user.id,
    deviceId,
    deviceInfo,
    user.email,
    user.full_name || "User"
  );

  // Create session
  const session = await createSession(user.id, deviceId, deviceInfo);

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id, user.email, deviceId);

  // Store refresh token
  const refreshTokenExpiry = getTokenExpiryDate(config.jwt.refreshTokenExpiry);
  await storeRefreshToken(
    user.id,
    refreshToken,
    deviceId,
    deviceInfo,
    refreshTokenExpiry
  );

  // Update user last login
  await db("users").where({ id: user.id }).update({
    last_login_at: new Date().toISOString(),
    last_login_ip: ipAddress,
  });

  // Record successful login
  await recordLoginAttempt(email, ipAddress, userAgent, true, user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      emailVerified: user.email_verified,
    },
    accessToken,
    refreshToken,
    session: {
      id: session.id,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
    },
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshTokenString: string,
  userAgent: string,
  ipAddress: string
): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  // Verify refresh token JWT
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshTokenString);
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }

  // Check if token exists in database and is not revoked
  const storedToken = await getRefreshToken(refreshTokenString);

  if (!storedToken) {
    throw new Error("Refresh token not found or has been revoked");
  }

  // Verify device ID matches
  const currentDeviceId = generateDeviceId(userAgent, ipAddress);
  if (storedToken.deviceId !== currentDeviceId) {
    // Possible token theft - revoke all tokens for this user
    await revokeAllUserRefreshTokens(storedToken.userId);
    throw new Error("Device mismatch detected. All sessions have been revoked for security.");
  }

  // Get user
  const user = await db("users").where({ id: storedToken.userId }).first();

  if (!user || !user.is_active) {
    throw new Error("User not found or inactive");
  }

  // Generate new tokens (refresh token rotation)
  const newAccessToken = generateAccessToken(user.id, user.email);
  const newRefreshToken = generateRefreshToken(
    user.id,
    user.email,
    storedToken.deviceId
  );

  // Revoke old refresh token
  await revokeRefreshToken(refreshTokenString);

  // Store new refresh token
  const deviceInfo = parseDeviceInfo(userAgent, ipAddress);
  const refreshTokenExpiry = getTokenExpiryDate(config.jwt.refreshTokenExpiry);
  await storeRefreshToken(
    user.id,
    newRefreshToken,
    storedToken.deviceId,
    deviceInfo,
    refreshTokenExpiry
  );

  // Update session activity
  const session = await db("user_sessions")
    .where({ user_id: user.id, device_id: storedToken.deviceId, is_active: true })
    .first();

  if (session) {
    await updateSessionActivity(session.id);
  }

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout user (revoke tokens and terminate session)
 */
export async function logout(
  userId: string,
  accessToken: string,
  refreshTokenString: string
): Promise<void> {
  // Blacklist access token
  await blacklistToken(accessToken, userId, "access", "logout");

  // Revoke refresh token
  await revokeRefreshToken(refreshTokenString);

  // Get device ID from refresh token to terminate session
  const storedToken = await db("refresh_tokens")
    .where({ token_hash: require("crypto").createHash("sha256").update(refreshTokenString).digest("hex") })
    .first();

  if (storedToken) {
    // Terminate session
    const session = await db("user_sessions")
      .where({
        user_id: userId,
        device_id: storedToken.device_id,
        is_active: true,
      })
      .first();

    if (session) {
      await db("user_sessions").where({ id: session.id }).update({
        is_active: false,
        terminated_at: new Date().toISOString(),
      });
    }
  }
}

/**
 * Logout from all devices
 */
export async function logoutAll(
  userId: string,
  currentAccessToken: string
): Promise<number> {
  // Blacklist current access token
  await blacklistToken(currentAccessToken, userId, "access", "logout_all");

  // Revoke all refresh tokens
  await revokeAllUserRefreshTokens(userId);

  // Terminate all sessions
  const terminated = await db("user_sessions")
    .where({ user_id: userId, is_active: true })
    .update({
      is_active: false,
      terminated_at: new Date().toISOString(),
    });

  return terminated;
}

/**
 * Change password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress: string
): Promise<void> {
  // Get user
  const user = await db("users").where({ id: userId }).first();

  if (!user || !user.password_hash) {
    throw new Error("User not found");
  }

  // Verify current password
  const isValidPassword = await verifyPassword(
    currentPassword,
    user.password_hash
  );

  if (!isValidPassword) {
    throw new Error("Current password is incorrect");
  }

  // Hash new password
  const newPasswordHash = await hashPassword(newPassword);

  // Update password
  await db("users").where({ id: userId }).update({
    password_hash: newPasswordHash,
    updated_at: new Date().toISOString(),
  });

  // Revoke all refresh tokens (force re-login on all devices)
  await revokeAllUserRefreshTokens(userId);

  // Terminate all sessions
  await db("user_sessions")
    .where({ user_id: userId, is_active: true })
    .update({
      is_active: false,
      terminated_at: new Date().toISOString(),
    });
}

/**
 * Get user login history
 */
export async function getLoginHistory(
  userId: string,
  limit: number = 20
): Promise<
  Array<{
    attemptedAt: string;
    ipAddress: string;
    successful: boolean;
    failureReason: string | null;
    userAgent: string | null;
  }>
> {
  const history = await db("login_attempts")
    .where({ user_id: userId })
    .orderBy("attempted_at", "desc")
    .limit(limit);

  return history.map((attempt: any) => ({
    attemptedAt: new Date(attempt.attempted_at).toISOString(),
    ipAddress: attempt.ip_address,
    successful: attempt.successful,
    failureReason: attempt.failure_reason,
    userAgent: attempt.user_agent,
  }));
}
