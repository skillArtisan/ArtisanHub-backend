import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { userService } from "../services/users.js";
import { verifySignature } from "../utils/auth.js";
import { validateStellarPublicKey } from "../utils/validation.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// Request schemas
const createUserSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().optional(),
  signature: z.string().min(1),
});

const updateProfileSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  signature: z.string().min(1),
});

const uploadProfileImageSchema = z.object({
  imageUrl: z.string().url(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSize: z.number().positive().max(5 * 1024 * 1024),
  signature: z.string().min(1),
});

const updatePreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  preferredLanguage: z.string().optional(),
  timezone: z.string().optional(),
  receivePromotionalEmails: z.boolean().optional(),
  notificationSettings: z.record(z.unknown()).optional(),
  signature: z.string().min(1),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const requestDeletionSchema = z.object({
  reason: z.string().optional(),
  signature: z.string().min(1),
});

const confirmDeletionSchema = z.object({
  token: z.string().min(1),
  signature: z.string().min(1),
});

// Rate limiters
const userModificationLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

const deletionLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 3600_000, // 1 hour
});

export async function registerUserRoutes(app: FastifyInstance) {
  // Create user
  app.post<{ Body: unknown }>(
    "/api/users",
    { preHandler: userModificationLimiter },
    async (request, reply) => {
      try {
        const validated = createUserSchema.parse(request.body);

        // Validate Stellar public key
        validateStellarPublicKey(validated.userId);

        // Verify signature
        const payload = `CREATE_USER:${validated.userId}:${validated.email}${validated.fullName ? `:${validated.fullName}` : ""}`;
        if (!verifySignature(validated.userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        const user = await userService.createUser({
          id: validated.userId,
          email: validated.email,
          fullName: validated.fullName,
        });

        return reply.code(201).send({
          user,
          message: "User created successfully. Please verify your email.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("already exists") ? 409 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Get user profile
  app.get<{ Params: { userId: string } }>(
    "/api/users/:userId",
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const user = await userService.getUser(userId);
        if (!user) {
          return reply.code(404).send({ error: "User not found" });
        }

        return { user };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Update user profile
  app.put<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId",
    { preHandler: userModificationLimiter },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = updateProfileSchema.parse(request.body);

        // Verify signature
        const payload = `UPDATE_PROFILE:${userId}${validated.fullName ? `:${validated.fullName}` : ""}${validated.email ? `:${validated.email}` : ""}`;
        if (!verifySignature(userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        const user = await userService.updateProfile(userId, {
          fullName: validated.fullName,
          email: validated.email,
        });

        return { user };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Upload profile image
  app.post<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId/profile-image",
    { preHandler: userModificationLimiter },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = uploadProfileImageSchema.parse(request.body);

        // Verify signature
        const payload = `UPLOAD_IMAGE:${userId}:${validated.imageUrl}:${validated.mimeType}:${validated.fileSize}`;
        if (!verifySignature(userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        const profileImage = await userService.uploadProfileImage(
          userId,
          validated.imageUrl,
          validated.mimeType,
          validated.fileSize
        );

        return reply.code(201).send({
          profileImage,
          message: "Profile image uploaded successfully",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Get profile image
  app.get<{ Params: { userId: string } }>(
    "/api/users/:userId/profile-image",
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const profileImage = await userService.getProfileImage(userId);
        if (!profileImage) {
          return reply.code(404).send({ error: "Profile image not found" });
        }

        return { profileImage };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get user preferences
  app.get<{ Params: { userId: string } }>(
    "/api/users/:userId/preferences",
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const preferences = await userService.getPreferences(userId);
        if (!preferences) {
          return reply.code(404).send({ error: "Preferences not found" });
        }

        return { preferences };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Update user preferences
  app.put<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId/preferences",
    { preHandler: userModificationLimiter },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = updatePreferencesSchema.parse(request.body);

        // Verify signature
        const payload = `UPDATE_PREFERENCES:${userId}`;
        if (!verifySignature(userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        const preferences = await userService.updatePreferences(userId, {
          notificationsEnabled: validated.notificationsEnabled,
          emailNotifications: validated.emailNotifications,
          preferredLanguage: validated.preferredLanguage,
          timezone: validated.timezone,
          receivePromotionalEmails: validated.receivePromotionalEmails,
          notificationSettings: validated.notificationSettings,
        });

        return { preferences };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Verify email
  app.post<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId/verify-email",
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = verifyEmailSchema.parse(request.body);

        await userService.verifyEmail(userId, validated.token);

        return {
          message: "Email verified successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : message.includes("expired") ? 410 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Resend verification email
  app.post<{ Params: { userId: string } }>(
    "/api/users/:userId/resend-verification",
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const token = await userService.resendVerificationEmail(userId);

        return reply.code(200).send({
          message: "Verification email resent",
          verificationToken: token,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Request account deletion
  app.post<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId/request-deletion",
    { preHandler: deletionLimiter },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = requestDeletionSchema.parse(request.body);

        // Verify signature
        const payload = `REQUEST_DELETE:${userId}${validated.reason ? `:${validated.reason}` : ""}`;
        if (!verifySignature(userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        const deletionRequest = await userService.requestAccountDeletion(userId, validated.reason);

        return reply.code(202).send({
          deletionRequest,
          message: `Account deletion requested. You have ${new Date(deletionRequest.expiresAt).toLocaleDateString()} to confirm deletion.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 409;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Confirm account deletion
  app.post<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId/confirm-deletion",
    { preHandler: deletionLimiter },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = confirmDeletionSchema.parse(request.body);

        // Verify signature
        const payload = `CONFIRM_DELETE:${userId}:${validated.token}`;
        if (!verifySignature(userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        const deletionRequest = await userService.confirmAccountDeletion(userId, validated.token);

        // Schedule actual deletion (could be async job in production)
        await userService.completeAccountDeletion(userId);

        return {
          message: "Account deletion confirmed and initiated",
          deletionRequest,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : message.includes("expired") ? 410 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // Cancel account deletion
  app.post<{ Params: { userId: string }; Body: unknown }>(
    "/api/users/:userId/cancel-deletion",
    async (request, reply) => {
      try {
        const { userId } = request.params;
        validateStellarPublicKey(userId);

        const validated = z.object({ signature: z.string().min(1) }).parse(request.body);

        // Verify signature
        const payload = `CANCEL_DELETE:${userId}`;
        if (!verifySignature(userId, payload, validated.signature)) {
          return reply.code(401).send({
            error: "Invalid signature",
          });
        }

        await userService.cancelAccountDeletion(userId);

        return {
          message: "Account deletion cancelled",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );
}
