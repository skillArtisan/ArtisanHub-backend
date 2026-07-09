import type { FastifyRequest, FastifyReply } from "fastify";

export async function securityHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // CORS headers (if not already set by @fastify/cors)
  reply.header("Access-Control-Allow-Origin", request.headers.origin || "*");
  reply.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  reply.header("Access-Control-Max-Age", "86400");

  // HSTS - Force HTTPS for 1 year
  reply.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // CSP - Content Security Policy
  reply.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'",
  );

  // Additional security headers
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "1; mode=block");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
}
