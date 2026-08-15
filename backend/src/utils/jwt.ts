import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { config } from "../config.js";
import db from "../db.js";

export interface TokenPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
  deviceId?: string;
  jti?: string; // JWT ID for token tracking
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate an access token (short-lived)
 */
export function generateAccessToken(userId: string, email: string): string {
  const payload: TokenPayload = {
    userId,
    email,
    type: "access",
    jti: randomUUID(),
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessTokenExpiry,
  });
}

/**
 * Generate a refresh token (long-lived)
 */
export function generateRefreshToken(
  userId: string,
  email: string,
  deviceId: string
): string {
  const payload: TokenPayload = {
    userId,
    email,
    type: "refresh",
    deviceId,
    jti: randomUUID(),
  };

  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTokenExpiry,
  });
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): DecodedToken {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as DecodedToken;

    if (decoded.type !== "access") {
      throw new Error("Invalid token type");
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Access token expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid access token");
    }
    throw error;
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): DecodedToken {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as DecodedToken;

    if (decoded.type !== "refresh") {
      throw new Error("Invalid token type");
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Refresh token expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid refresh token");
    }
    throw error;
  }
}

/**
 * Check if a token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const blacklisted = await db("blacklisted_tokens")
    .where({ token_hash: tokenHash })
    .where("expires_at", ">", new Date().toISOString())
    .first();

  return !!blacklisted;
}

/**
 * Blacklist a token (for logout or security purposes)
 */
export async function blacklistToken(
  token: string,
  userId: string,
  tokenType: "access" | "refresh",
  reason: string = "logout"
): Promise<void> {
  const tokenHash = hashToken(token);
  
  let expiresAt: Date;
  
  try {
    if (tokenType === "access") {
      const decoded = jwt.decode(token) as DecodedToken;
      expiresAt = new Date(decoded.exp * 1000);
    } else {
      const decoded = jwt.decode(token) as DecodedToken;
      expiresAt = new Date(decoded.exp * 1000);
    }
  } catch (error) {
    // If we can't decode, set a default expiry
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  await db("blacklisted_tokens").insert({
    id: randomUUID(),
    token_hash: tokenHash,
    user_id: userId,
    token_type: tokenType,
    expires_at: expiresAt.toISOString(),
    blacklisted_at: new Date().toISOString(),
    reason,
  });
}

/**
 * Get token expiry date from config string
 */
export function getTokenExpiryDate(expiryString: string): Date {
  const now = new Date();
  const match = expiryString.match(/^(\d+)([mhd])$/);
  
  if (!match) {
    throw new Error("Invalid expiry format");
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "m": // minutes
      return new Date(now.getTime() + value * 60 * 1000);
    case "h": // hours
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case "d": // days
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      throw new Error("Invalid expiry unit");
  }
}

/**
 * Cleanup expired blacklisted tokens (should be run periodically)
 */
export async function cleanupExpiredBlacklistedTokens(): Promise<number> {
  const deleted = await db("blacklisted_tokens")
    .where("expires_at", "<", new Date().toISOString())
    .delete();

  return deleted;
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}
