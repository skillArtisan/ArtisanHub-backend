import type { FastifyRequest, FastifyReply } from "fastify";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  [key: string]: Map<string, RateLimitEntry>;
}

// Separate stores for different rate limit types
const rateLimitStores: RateLimitStore = {
  default: new Map<string, RateLimitEntry>(),
  auth: new Map<string, RateLimitEntry>(),
  passwordReset: new Map<string, RateLimitEntry>(),
  emailVerification: new Map<string, RateLimitEntry>(),
  refreshToken: new Map<string, RateLimitEntry>(),
};

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  storeKey?: string; // Which store to use
}

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(options?: RateLimiterOptions) {
  const maxRequests = options?.maxRequests ?? MAX_REQUESTS;
  const windowMs = options?.windowMs ?? WINDOW_MS;
  const storeKey = options?.storeKey ?? "default";
  const keyGenerator = options?.keyGenerator ?? ((request: FastifyRequest) => request.ip);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const store = rateLimitStores[storeKey] || rateLimitStores.default;
    const clientId = keyGenerator(request);
    const now = Date.now();
    const entry = store.get(clientId);

    if (!entry || now > entry.resetTime) {
      store.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
      
      reply.header("X-RateLimit-Limit", maxRequests.toString());
      reply.header("X-RateLimit-Remaining", (maxRequests - 1).toString());
      reply.header("X-RateLimit-Reset", new Date(now + windowMs).toISOString());
      return;
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      reply.header("Retry-After", retryAfter.toString());
      reply.header("X-RateLimit-Limit", maxRequests.toString());
      reply.header("X-RateLimit-Remaining", "0");
      reply.header(
        "X-RateLimit-Reset",
        new Date(entry.resetTime).toISOString(),
      );

      return reply.code(429).send({
        error: "Rate limit exceeded",
        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    reply.header("X-RateLimit-Limit", maxRequests.toString());
    reply.header(
      "X-RateLimit-Remaining",
      (maxRequests - entry.count).toString(),
    );
    reply.header("X-RateLimit-Reset", new Date(entry.resetTime).toISOString());
  };
}

// Specific rate limiters for authentication endpoints

/**
 * Rate limiter for login attempts - stricter limits
 * 5 attempts per 15 minutes per IP
 */
export const loginRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  storeKey: "auth",
});

/**
 * Rate limiter for registration
 * 3 registrations per hour per IP
 */
export const registerRateLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  storeKey: "auth",
});

/**
 * Rate limiter for password reset requests
 * 3 requests per hour per IP
 */
export const passwordResetRequestLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  storeKey: "passwordReset",
});

/**
 * Rate limiter for password reset confirmation
 * 5 attempts per 15 minutes per IP
 */
export const passwordResetConfirmLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  storeKey: "passwordReset",
});

/**
 * Rate limiter for email verification
 * 5 requests per hour per IP
 */
export const emailVerificationLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  storeKey: "emailVerification",
});

/**
 * Rate limiter for refresh token endpoint
 * 10 requests per minute per IP
 */
export const refreshTokenLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
  storeKey: "refreshToken",
});

/**
 * Rate limiter for general user modifications
 * 10 requests per minute per IP
 */
export const userModificationLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

/**
 * Rate limiter for account deletion
 * 3 requests per hour per IP
 */
export const deletionLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 3600_000, // 1 hour
});

/**
 * Rate limiter for session management
 * 20 requests per minute per IP
 */
export const sessionManagementLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
});

// Cleanup old entries periodically for all stores
setInterval(() => {
  const now = Date.now();
  
  Object.values(rateLimitStores).forEach((store) => {
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetTime) {
        store.delete(key);
      }
    }
  });
}, WINDOW_MS);

/**
 * Manual cleanup function for testing or maintenance
 */
export function clearRateLimitStore(storeKey?: string): void {
  if (storeKey && rateLimitStores[storeKey]) {
    rateLimitStores[storeKey].clear();
  } else if (!storeKey) {
    Object.values(rateLimitStores).forEach((store) => store.clear());
  }
}

/**
 * Get current rate limit status for a client
 */
export function getRateLimitStatus(
  clientId: string,
  storeKey: string = "default"
): {
  remaining: number;
  resetTime: Date | null;
  isLimited: boolean;
} | null {
  const store = rateLimitStores[storeKey] || rateLimitStores.default;
  const entry = store.get(clientId);

  if (!entry || Date.now() > entry.resetTime) {
    return null;
  }

  const maxRequests = MAX_REQUESTS; // Should be made configurable per store
  return {
    remaining: Math.max(0, maxRequests - entry.count),
    resetTime: new Date(entry.resetTime),
    isLimited: entry.count >= maxRequests,
  };
}
