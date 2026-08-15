import { randomUUID } from "node:crypto";
import { createHash } from "crypto";
import db from "../db.js";
import { config } from "../config.js";
import { hashPassword } from "../utils/password.js";
import { sendPasswordResetEmail, sendPasswordChangedEmail } from "./email.js";
import { revokeAllUserRefreshTokens } from "./session.js";

/**
 * Hash a reset token for secure storage
 */
function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Request a password reset
 */
export async function requestPasswordReset(
  email: string,
  ipAddress: string
): Promise<{ success: boolean; message: string }> {
  // Find user by email
  const user = await db("users").where({ email }).first();

  // Always return success to prevent email enumeration
  // But only send email if user exists
  if (!user) {
    return {
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    };
  }

  // Check if user has a password (might be Stellar-only auth)
  if (!user.password_hash) {
    return {
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    };
  }

  // Check if there's a recent unused reset token (prevent spam)
  const recentToken = await db("password_reset_tokens")
    .where({ user_id: user.id, is_used: false })
    .where("expires_at", ">", new Date().toISOString())
    .where(
      "created_at",
      ">",
      new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes
    )
    .first();

  if (recentToken) {
    return {
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    };
  }

  // Generate reset token
  const resetToken = randomUUID();
  const tokenHash = hashResetToken(resetToken);
  const expiresAt = new Date(
    Date.now() + config.security.passwordResetExpiry
  ).toISOString();

  // Store reset token
  await db("password_reset_tokens").insert({
    id: randomUUID(),
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    is_used: false,
    ip_address: ipAddress,
  });

  // Send reset email
  try {
    await sendPasswordResetEmail(
      user.email,
      user.full_name || "User",
      resetToken,
      user.id
    );
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    // Don't throw error to prevent information leakage
  }

  return {
    success: true,
    message: "If the email exists, a password reset link has been sent.",
  };
}

/**
 * Verify a password reset token
 */
export async function verifyPasswordResetToken(
  userId: string,
  token: string
): Promise<{ valid: boolean; message?: string }> {
  const tokenHash = hashResetToken(token);

  const resetToken = await db("password_reset_tokens")
    .where({
      user_id: userId,
      token_hash: tokenHash,
      is_used: false,
    })
    .where("expires_at", ">", new Date().toISOString())
    .first();

  if (!resetToken) {
    return {
      valid: false,
      message: "Invalid or expired password reset token",
    };
  }

  return { valid: true };
}

/**
 * Reset password using reset token
 */
export async function resetPassword(
  userId: string,
  token: string,
  newPassword: string,
  ipAddress: string
): Promise<void> {
  // Verify token
  const tokenHash = hashResetToken(token);

  const resetToken = await db("password_reset_tokens")
    .where({
      user_id: userId,
      token_hash: tokenHash,
      is_used: false,
    })
    .where("expires_at", ">", new Date().toISOString())
    .first();

  if (!resetToken) {
    throw new Error("Invalid or expired password reset token");
  }

  // Get user
  const user = await db("users").where({ id: userId }).first();

  if (!user) {
    throw new Error("User not found");
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password
  await db("users").where({ id: userId }).update({
    password_hash: passwordHash,
    updated_at: new Date().toISOString(),
  });

  // Mark token as used
  await db("password_reset_tokens").where({ id: resetToken.id }).update({
    is_used: true,
    used_at: new Date().toISOString(),
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

  // Send password changed notification
  try {
    await sendPasswordChangedEmail(
      user.email,
      user.full_name || "User",
      ipAddress
    );
  } catch (error) {
    console.error("Failed to send password changed email:", error);
    // Don't throw error, password was already changed successfully
  }
}

/**
 * Get password reset token info (for debugging/admin purposes)
 */
export async function getPasswordResetTokenInfo(
  userId: string,
  token: string
): Promise<{
  exists: boolean;
  isUsed?: boolean;
  expiresAt?: string;
  createdAt?: string;
}> {
  const tokenHash = hashResetToken(token);

  const resetToken = await db("password_reset_tokens")
    .where({
      user_id: userId,
      token_hash: tokenHash,
    })
    .first();

  if (!resetToken) {
    return { exists: false };
  }

  return {
    exists: true,
    isUsed: resetToken.is_used,
    expiresAt: new Date(resetToken.expires_at).toISOString(),
    createdAt: new Date(resetToken.created_at).toISOString(),
  };
}

/**
 * Cleanup expired and used password reset tokens (should be run periodically)
 */
export async function cleanupPasswordResetTokens(): Promise<number> {
  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Delete tokens that are:
  // 1. Expired, OR
  // 2. Used and older than 30 days
  const deleted = await db("password_reset_tokens")
    .where("expires_at", "<", now)
    .orWhere(function () {
      this.where("is_used", true).where("created_at", "<", thirtyDaysAgo);
    })
    .delete();

  return deleted;
}

/**
 * Invalidate all password reset tokens for a user
 */
export async function invalidateAllUserResetTokens(
  userId: string
): Promise<number> {
  const updated = await db("password_reset_tokens")
    .where({ user_id: userId, is_used: false })
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
    });

  return updated;
}

/**
 * Get user's recent password reset requests
 */
export async function getUserPasswordResetHistory(
  userId: string,
  limit: number = 10
): Promise<
  Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    isUsed: boolean;
    usedAt: string | null;
    ipAddress: string | null;
  }>
> {
  const history = await db("password_reset_tokens")
    .where({ user_id: userId })
    .orderBy("created_at", "desc")
    .limit(limit);

  return history.map((record: any) => ({
    id: record.id,
    createdAt: new Date(record.created_at).toISOString(),
    expiresAt: new Date(record.expires_at).toISOString(),
    isUsed: record.is_used,
    usedAt: record.used_at ? new Date(record.used_at).toISOString() : null,
    ipAddress: record.ip_address,
  }));
}
