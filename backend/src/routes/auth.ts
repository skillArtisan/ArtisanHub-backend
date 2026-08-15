import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  register,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
  changePassword,
  getLoginHistory,
} from "../services/auth.js";
import {
  requestPasswordReset,
  verifyPasswordResetToken,
  resetPassword,
} from "../services/passwordReset.js";
import {
  getUserSessions,
  terminateSession,
  terminateOtherSessions,
  generateDeviceId,
  parseDeviceInfo,
} from "../services/session.js";
import { validatePasswordStrength } from "../utils/password.js";
import { extractTokenFromHeader } from "../utils/jwt.js";
import {
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRequestLimiter,
  passwordResetConfirmLimiter,
  emailVerificationLimiter,
  refreshTokenLimiter,
  sessionManagementLimiter,
} from "../middleware/rateLimiter.js";

// Request schemas
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().optional(),
  stellarPublicKey: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const passwordResetConfirmSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const verifyResetTokenSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  token: z.string().min(1, "Reset token is required"),
});

const terminateSessionSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

/**
 * Get client IP address from request
 */
function getClientIp(request: FastifyRequest): string {
  return (
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    (request.headers["x-real-ip"] as string) ||
    request.ip
  );
}

/**
 * Get user agent from request
 */
function getUserAgent(request: FastifyRequest): string {
  return (request.headers["user-agent"] as string) || "Unknown";
}

export async function registerAuthRoutes(app: FastifyInstance) {
  // Register new user
  app.post<{ Body: unknown }>(
    "/api/auth/register",
    { preHandler: registerRateLimiter },
    async (request, reply) => {
      try {
        const validated = registerSchema.parse(request.body);

        // Validate password strength
        const passwordValidation = validatePasswordStrength(validated.password);
        if (!passwordValidation.valid) {
          return reply.code(400).send({
            error: "Weak password",
            details: passwordValidation.errors,
          });
        }

        const result = await register({
          email: validated.email,
          password: validated.password,
          fullName: validated.fullName,
          stellarPublicKey: validated.stellarPublicKey,
        });

        return reply.code(201).send({
          success: true,
          message: "Registration successful. Please check your email to verify your account.",
          userId: result.userId,
          email: result.email,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Registration failed";
        const statusCode = message.includes("already registered") ? 409 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Login
  app.post<{ Body: unknown }>(
    "/api/auth/login",
    { preHandler: loginRateLimiter },
    async (request, reply) => {
      try {
        const validated = loginSchema.parse(request.body);
        const ipAddress = getClientIp(request);
        const userAgent = getUserAgent(request);

        const result = await login(
          validated.email,
          validated.password,
          userAgent,
          ipAddress
        );

        return reply.code(200).send({
          success: true,
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          session: result.session,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Login failed";
        const statusCode = message.includes("Rate limit") ? 429 : 401;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Refresh access token
  app.post<{ Body: unknown }>(
    "/api/auth/refresh",
    { preHandler: refreshTokenLimiter },
    async (request, reply) => {
      try {
        const validated = refreshTokenSchema.parse(request.body);
        const ipAddress = getClientIp(request);
        const userAgent = getUserAgent(request);

        const result = await refreshAccessToken(
          validated.refreshToken,
          userAgent,
          ipAddress
        );

        return reply.code(200).send({
          success: true,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Token refresh failed";
        return reply.code(401).send({ error: message });
      }
    }
  );

  // Logout
  app.post<{ Body: unknown }>(
    "/api/auth/logout",
    async (request, reply) => {
      try {
        const validated = logoutSchema.parse(request.body);
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        // Extract userId from token (we'll need to decode it)
        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        await logout(decoded.userId, accessToken, validated.refreshToken);

        return reply.code(200).send({
          success: true,
          message: "Logged out successfully",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Logout failed";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Logout from all devices
  app.post(
    "/api/auth/logout-all",
    async (request, reply) => {
      try {
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        const terminated = await logoutAll(decoded.userId, accessToken);

        return reply.code(200).send({
          success: true,
          message: `Logged out from ${terminated} device(s)`,
          devicesTerminated: terminated,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Logout failed";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Change password
  app.post<{ Body: unknown }>(
    "/api/auth/change-password",
    async (request, reply) => {
      try {
        const validated = changePasswordSchema.parse(request.body);
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        // Validate new password strength
        const passwordValidation = validatePasswordStrength(validated.newPassword);
        if (!passwordValidation.valid) {
          return reply.code(400).send({
            error: "Weak password",
            details: passwordValidation.errors,
          });
        }

        const ipAddress = getClientIp(request);

        await changePassword(
          decoded.userId,
          validated.currentPassword,
          validated.newPassword,
          ipAddress
        );

        return reply.code(200).send({
          success: true,
          message: "Password changed successfully. You have been logged out from all devices.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Password change failed";
        const statusCode = message.includes("incorrect") ? 401 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Request password reset
  app.post<{ Body: unknown }>(
    "/api/auth/password-reset/request",
    { preHandler: passwordResetRequestLimiter },
    async (request, reply) => {
      try {
        const validated = passwordResetRequestSchema.parse(request.body);
        const ipAddress = getClientIp(request);

        const result = await requestPasswordReset(validated.email, ipAddress);

        return reply.code(200).send({
          success: result.success,
          message: result.message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Password reset request failed";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Verify password reset token
  app.post<{ Body: unknown }>(
    "/api/auth/password-reset/verify",
    async (request, reply) => {
      try {
        const validated = verifyResetTokenSchema.parse(request.body);

        const result = await verifyPasswordResetToken(
          validated.userId,
          validated.token
        );

        if (!result.valid) {
          return reply.code(400).send({
            valid: false,
            error: result.message,
          });
        }

        return reply.code(200).send({
          valid: true,
          message: "Token is valid",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Token verification failed";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Confirm password reset
  app.post<{ Body: unknown }>(
    "/api/auth/password-reset/confirm",
    { preHandler: passwordResetConfirmLimiter },
    async (request, reply) => {
      try {
        const validated = passwordResetConfirmSchema.parse(request.body);

        // Validate new password strength
        const passwordValidation = validatePasswordStrength(validated.newPassword);
        if (!passwordValidation.valid) {
          return reply.code(400).send({
            error: "Weak password",
            details: passwordValidation.errors,
          });
        }

        const ipAddress = getClientIp(request);

        await resetPassword(
          validated.userId,
          validated.token,
          validated.newPassword,
          ipAddress
        );

        return reply.code(200).send({
          success: true,
          message: "Password reset successfully. Please log in with your new password.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Password reset failed";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get user sessions
  app.get(
    "/api/auth/sessions",
    { preHandler: sessionManagementLimiter },
    async (request, reply) => {
      try {
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        const userAgent = getUserAgent(request);
        const ipAddress = getClientIp(request);
        const currentDeviceId = generateDeviceId(userAgent, ipAddress);

        const sessions = await getUserSessions(decoded.userId, currentDeviceId);

        return reply.code(200).send({
          success: true,
          sessions,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch sessions";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Terminate a specific session
  app.delete<{ Body: unknown }>(
    "/api/auth/sessions/:sessionId",
    { preHandler: sessionManagementLimiter },
    async (request, reply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        await terminateSession(decoded.userId, sessionId);

        return reply.code(200).send({
          success: true,
          message: "Session terminated successfully",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to terminate session";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Terminate all other sessions
  app.post(
    "/api/auth/sessions/terminate-others",
    { preHandler: sessionManagementLimiter },
    async (request, reply) => {
      try {
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        // Get current session ID
        const userAgent = getUserAgent(request);
        const ipAddress = getClientIp(request);
        const deviceInfo = parseDeviceInfo(userAgent, ipAddress);
        const deviceId = generateDeviceId(userAgent, ipAddress);

        const sessions = await getUserSessions(decoded.userId, deviceId);
        const currentSession = sessions.find(s => s.isCurrent);

        if (!currentSession) {
          return reply.code(400).send({ error: "Current session not found" });
        }

        const terminated = await terminateOtherSessions(
          decoded.userId,
          currentSession.id
        );

        return reply.code(200).send({
          success: true,
          message: `Terminated ${terminated} other session(s)`,
          sessionsTerminated: terminated,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to terminate sessions";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get login history
  app.get(
    "/api/auth/login-history",
    async (request, reply) => {
      try {
        const accessToken = extractTokenFromHeader(
          request.headers.authorization as string
        );

        if (!accessToken) {
          return reply.code(401).send({ error: "Access token required" });
        }

        const jwt = await import("jsonwebtoken");
        const decoded = jwt.decode(accessToken) as any;

        if (!decoded || !decoded.userId) {
          return reply.code(401).send({ error: "Invalid access token" });
        }

        const history = await getLoginHistory(decoded.userId);

        return reply.code(200).send({
          success: true,
          history,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch login history";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
