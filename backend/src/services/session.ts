import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import DeviceDetector from "device-detector-js";
import db from "../db.js";
import { config } from "../config.js";
import { hashToken, getTokenExpiryDate } from "../utils/jwt.js";
import { sendNewDeviceLoginEmail } from "./email.js";

const deviceDetector = new DeviceDetector();

export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionInfo {
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
}

export interface RefreshTokenInfo {
  id: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
  isRevoked: boolean;
}

/**
 * Generate a unique device ID based on user agent and other factors
 */
export function generateDeviceId(userAgent: string, ipAddress?: string): string {
  const data = `${userAgent}${ipAddress || ""}`;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Parse device information from user agent
 */
export function parseDeviceInfo(
  userAgent: string,
  ipAddress?: string
): Omit<DeviceInfo, "deviceId"> {
  const result = deviceDetector.parse(userAgent);

  const deviceType = result.device?.type || "desktop";
  const browser = result.client?.name
    ? `${result.client.name}${result.client.version ? ` ${result.client.version}` : ""}`
    : undefined;
  const os = result.os?.name
    ? `${result.os.name}${result.os.version ? ` ${result.os.version}` : ""}`
    : undefined;

  let deviceName = "Unknown Device";
  if (result.device?.brand && result.device?.model) {
    deviceName = `${result.device.brand} ${result.device.model}`;
  } else if (result.os?.name) {
    deviceName = result.os.name;
  }

  return {
    deviceName,
    deviceType,
    browser,
    os,
    ipAddress,
    userAgent,
  };
}

/**
 * Create a new session for a device
 */
export async function createSession(
  userId: string,
  deviceId: string,
  deviceInfo: Omit<DeviceInfo, "deviceId">
): Promise<SessionInfo> {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + config.security.sessionMaxAge
  ).toISOString();

  const session: SessionInfo = {
    id: sessionId,
    userId,
    deviceId,
    deviceName: deviceInfo.deviceName,
    deviceType: deviceInfo.deviceType,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ipAddress: deviceInfo.ipAddress,
    createdAt: now,
    lastActiveAt: now,
    expiresAt,
    isActive: true,
  };

  await db("user_sessions").insert({
    id: session.id,
    user_id: session.userId,
    device_id: session.deviceId,
    device_name: session.deviceName,
    device_type: session.deviceType,
    browser: session.browser,
    os: session.os,
    ip_address: session.ipAddress,
    user_agent: deviceInfo.userAgent,
    created_at: session.createdAt,
    last_active_at: session.lastActiveAt,
    expires_at: session.expiresAt,
    is_active: session.isActive,
  });

  return session;
}

/**
 * Update session last active timestamp
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  await db("user_sessions").where({ id: sessionId }).update({
    last_active_at: new Date().toISOString(),
  });
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(
  userId: string,
  currentDeviceId?: string
): Promise<SessionInfo[]> {
  const sessions = await db("user_sessions")
    .where({ user_id: userId, is_active: true })
    .where("expires_at", ">", new Date().toISOString())
    .orderBy("last_active_at", "desc");

  return sessions.map((session: any) => ({
    id: session.id,
    userId: session.user_id,
    deviceId: session.device_id,
    deviceName: session.device_name,
    deviceType: session.device_type,
    browser: session.browser,
    os: session.os,
    ipAddress: session.ip_address,
    createdAt: new Date(session.created_at).toISOString(),
    lastActiveAt: new Date(session.last_active_at).toISOString(),
    expiresAt: new Date(session.expires_at).toISOString(),
    isActive: session.is_active,
    isCurrent: currentDeviceId ? session.device_id === currentDeviceId : false,
  }));
}

/**
 * Terminate a specific session
 */
export async function terminateSession(
  userId: string,
  sessionId: string
): Promise<void> {
  const session = await db("user_sessions")
    .where({ id: sessionId, user_id: userId })
    .first();

  if (!session) {
    throw new Error("Session not found");
  }

  await db("user_sessions").where({ id: sessionId }).update({
    is_active: false,
    terminated_at: new Date().toISOString(),
  });

  // Revoke all refresh tokens for this session's device
  await revokeDeviceRefreshTokens(userId, session.device_id);
}

/**
 * Terminate all sessions for a user except the current one
 */
export async function terminateOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<number> {
  const sessions = await db("user_sessions")
    .where({ user_id: userId, is_active: true })
    .whereNot({ id: currentSessionId });

  const deviceIds = sessions.map((s: any) => s.device_id);

  // Terminate sessions
  const terminated = await db("user_sessions")
    .where({ user_id: userId, is_active: true })
    .whereNot({ id: currentSessionId })
    .update({
      is_active: false,
      terminated_at: new Date().toISOString(),
    });

  // Revoke refresh tokens for all those devices
  if (deviceIds.length > 0) {
    await db("refresh_tokens")
      .where({ user_id: userId })
      .whereIn("device_id", deviceIds)
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      });
  }

  return terminated;
}

/**
 * Store a refresh token
 */
export async function storeRefreshToken(
  userId: string,
  refreshToken: string,
  deviceId: string,
  deviceInfo: Omit<DeviceInfo, "deviceId">,
  expiresAt: Date
): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const tokenId = randomUUID();

  await db("refresh_tokens").insert({
    id: tokenId,
    user_id: userId,
    token_hash: tokenHash,
    device_id: deviceId,
    device_name: deviceInfo.deviceName,
    device_type: deviceInfo.deviceType,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ip_address: deviceInfo.ipAddress,
    expires_at: expiresAt.toISOString(),
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    is_revoked: false,
  });
}

/**
 * Verify and retrieve refresh token
 */
export async function getRefreshToken(
  refreshToken: string
): Promise<RefreshTokenInfo | null> {
  const tokenHash = hashToken(refreshToken);

  const token = await db("refresh_tokens")
    .where({ token_hash: tokenHash, is_revoked: false })
    .where("expires_at", ">", new Date().toISOString())
    .first();

  if (!token) {
    return null;
  }

  // Update last used timestamp
  await db("refresh_tokens")
    .where({ id: token.id })
    .update({ last_used_at: new Date().toISOString() });

  return {
    id: token.id,
    userId: token.user_id,
    deviceId: token.device_id,
    deviceName: token.device_name,
    deviceType: token.device_type,
    browser: token.browser,
    os: token.os,
    ipAddress: token.ip_address,
    expiresAt: new Date(token.expires_at).toISOString(),
    lastUsedAt: new Date(token.last_used_at).toISOString(),
    createdAt: new Date(token.created_at).toISOString(),
    isRevoked: token.is_revoked,
  };
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);

  await db("refresh_tokens").where({ token_hash: tokenHash }).update({
    is_revoked: true,
    revoked_at: new Date().toISOString(),
  });
}

/**
 * Revoke all refresh tokens for a device
 */
export async function revokeDeviceRefreshTokens(
  userId: string,
  deviceId: string
): Promise<void> {
  await db("refresh_tokens")
    .where({ user_id: userId, device_id: deviceId })
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    });
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await db("refresh_tokens").where({ user_id: userId }).update({
    is_revoked: true,
    revoked_at: new Date().toISOString(),
  });
}

/**
 * Get all refresh tokens for a user
 */
export async function getUserRefreshTokens(
  userId: string
): Promise<RefreshTokenInfo[]> {
  const tokens = await db("refresh_tokens")
    .where({ user_id: userId, is_revoked: false })
    .where("expires_at", ">", new Date().toISOString())
    .orderBy("last_used_at", "desc");

  return tokens.map((token: any) => ({
    id: token.id,
    userId: token.user_id,
    deviceId: token.device_id,
    deviceName: token.device_name,
    deviceType: token.device_type,
    browser: token.browser,
    os: token.os,
    ipAddress: token.ip_address,
    expiresAt: new Date(token.expires_at).toISOString(),
    lastUsedAt: new Date(token.last_used_at).toISOString(),
    createdAt: new Date(token.created_at).toISOString(),
    isRevoked: token.is_revoked,
  }));
}

/**
 * Check if device is new for user and send notification if needed
 */
export async function checkAndNotifyNewDevice(
  userId: string,
  deviceId: string,
  deviceInfo: Omit<DeviceInfo, "deviceId">,
  userEmail: string,
  userName: string
): Promise<boolean> {
  const existingSession = await db("user_sessions")
    .where({ user_id: userId, device_id: deviceId })
    .first();

  const isNewDevice = !existingSession;

  if (isNewDevice) {
    // Send new device notification email (fire and forget)
    sendNewDeviceLoginEmail(userEmail, userName, {
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
    }).catch((error) => {
      console.error("Failed to send new device email:", error);
    });
  }

  return isNewDevice;
}

/**
 * Cleanup expired sessions and tokens (should be run periodically)
 */
export async function cleanupExpiredSessions(): Promise<{
  sessions: number;
  tokens: number;
}> {
  const now = new Date().toISOString();

  const expiredSessions = await db("user_sessions")
    .where("expires_at", "<", now)
    .where({ is_active: true })
    .update({
      is_active: false,
      terminated_at: now,
    });

  const expiredTokens = await db("refresh_tokens")
    .where("expires_at", "<", now)
    .where({ is_revoked: false })
    .update({
      is_revoked: true,
      revoked_at: now,
    });

  return {
    sessions: expiredSessions,
    tokens: expiredTokens,
  };
}
