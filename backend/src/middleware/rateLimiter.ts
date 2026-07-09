import type { FastifyRequest, FastifyReply } from "fastify";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

export function createRateLimiter(options?: {
  maxRequests?: number;
  windowMs?: number;
}) {
  const maxRequests = options?.maxRequests ?? MAX_REQUESTS;
  const windowMs = options?.windowMs ?? WINDOW_MS;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const clientId = request.ip;
    const now = Date.now();
    const entry = rateLimitStore.get(clientId);

    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
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

      throw new Error(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      );
    }

    reply.header("X-RateLimit-Limit", maxRequests.toString());
    reply.header(
      "X-RateLimit-Remaining",
      (maxRequests - entry.count).toString(),
    );
    reply.header("X-RateLimit-Reset", new Date(entry.resetTime).toISOString());
  };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, WINDOW_MS);
