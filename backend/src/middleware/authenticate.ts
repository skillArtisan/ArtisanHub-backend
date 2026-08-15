import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, extractTokenFromHeader, isTokenBlacklisted } from "../utils/jwt.js";
import db from "../db.js";

// Extend FastifyRequest to include user information
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      emailVerified: boolean;
      isActive: boolean;
    };
  }
}

/**
 * Middleware to authenticate requests using JWT access token
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(request.headers.authorization as string);

    if (!token) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Access token is required",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid token";
      return reply.code(401).send({
        error: "Unauthorized",
        message,
      });
    }

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Token has been revoked",
      });
    }

    // Get user from database
    const user = await db("users").where({ id: decoded.userId }).first();

    if (!user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "User not found",
      });
    }

    // Check if user account is active
    if (!user.is_active) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Account is inactive",
      });
    }

    // Attach user to request
    request.user = {
      userId: user.id,
      email: user.email,
      emailVerified: user.email_verified,
      isActive: user.is_active,
    };
  } catch (error) {
    console.error("Authentication error:", error);
    return reply.code(500).send({
      error: "Internal server error",
      message: "Authentication failed",
    });
  }
}

/**
 * Middleware to optionally authenticate requests
 * Does not reject requests without tokens, but attaches user if valid token provided
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractTokenFromHeader(request.headers.authorization as string);

    if (!token) {
      // No token provided, continue without user
      return;
    }

    // Try to verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      // Invalid token, continue without user
      return;
    }

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return;
    }

    // Get user from database
    const user = await db("users").where({ id: decoded.userId }).first();

    if (user && user.is_active) {
      request.user = {
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        isActive: user.is_active,
      };
    }
  } catch (error) {
    // Error during optional auth, continue without user
    console.error("Optional authentication error:", error);
  }
}

/**
 * Middleware to require email verification
 * Should be used after authenticate middleware
 */
export async function requireEmailVerification(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  if (!request.user.emailVerified) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Email verification required",
      requiresVerification: true,
    });
  }
}

/**
 * Middleware to check if user owns the resource
 * Compares userId from JWT with userId in route params
 */
export async function requireResourceOwnership(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  const params = request.params as Record<string, string>;
  const resourceUserId = params.userId;

  if (!resourceUserId) {
    return reply.code(400).send({
      error: "Bad Request",
      message: "User ID parameter is required",
    });
  }

  if (request.user.userId !== resourceUserId) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "You do not have permission to access this resource",
    });
  }
}

/**
 * Create a combined middleware that checks authentication and ownership
 */
export function authenticateAndAuthorize() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return; // Stop if authenticate failed
    
    await requireResourceOwnership(request, reply);
  };
}

/**
 * Create a combined middleware that checks authentication, ownership, and email verification
 */
export function authenticateWithVerification() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    
    await requireEmailVerification(request, reply);
    if (reply.sent) return;
    
    await requireResourceOwnership(request, reply);
  };
}
