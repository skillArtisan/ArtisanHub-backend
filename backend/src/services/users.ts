import { randomUUID } from "node:crypto";
import { randomBytes } from "node:crypto";
import db from "../db.js";
import type { UserProfile, UserPreferences, ProfileImage, AccountDeletionRequest } from "../types.js";

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 30;

type CreateUserInput = {
  id: string; // Stellar public key
  email: string;
  fullName?: string;
};

type UpdateProfileInput = {
  fullName?: string;
  email?: string;
};

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function getExpiryTime(hoursFromNow: number): string {
  const now = new Date();
  now.setHours(now.getHours() + hoursFromNow);
  return now.toISOString();
}

function getDeletionGracePeriod(): string {
  const now = new Date();
  now.setDate(now.getDate() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS);
  return now.toISOString();
}

export const userService = {
  // User Profile Management
  async createUser(input: CreateUserInput): Promise<UserProfile> {
    const existing = await db("users").where({ id: input.id }).first();
    if (existing) {
      throw new Error("User already exists");
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error("Invalid email format");
    }

    const verificationToken = generateToken();
    const verificationTokenExpiresAt = getExpiryTime(VERIFICATION_TOKEN_EXPIRY_HOURS);

    const user: UserProfile = {
      id: input.id,
      email: input.email,
      fullName: input.fullName || null,
      profileImageUrl: null,
      preferences: {},
      emailVerified: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db("users").insert({
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      profile_image_url: user.profileImageUrl,
      preferences: user.preferences,
      email_verified: user.emailVerified,
      is_active: user.isActive,
      verification_token: verificationToken,
      verification_token_expires_at: verificationTokenExpiresAt,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    });

    // Create default preferences
    await db("user_preferences").insert({
      user_id: user.id,
      notifications_enabled: true,
      email_notifications: true,
      preferred_language: "en",
      timezone: "UTC",
      receive_promotional_emails: false,
      notification_settings: {},
    });

    return user;
  },

  async getUser(userId: string): Promise<UserProfile | null> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      profileImageUrl: user.profile_image_url,
      preferences: user.preferences,
      emailVerified: user.email_verified,
      isActive: user.is_active,
      createdAt: new Date(user.created_at).toISOString(),
      updatedAt: new Date(user.updated_at).toISOString(),
    };
  },

  async updateProfile(userId: string, updates: UpdateProfileInput): Promise<UserProfile> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      throw new Error("User not found");
    }

    // Validate email if provided
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      throw new Error("Invalid email format");
    }

    // Check email uniqueness if updating email
    if (updates.email && updates.email !== user.email) {
      const existingEmail = await db("users").where({ email: updates.email }).first();
      if (existingEmail) {
        throw new Error("Email already in use");
      }
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (updates.fullName !== undefined) {
      updateData.full_name = updates.fullName;
    }
    if (updates.email !== undefined) {
      updateData.email = updates.email;
    }

    await db("users").where({ id: userId }).update(updateData);

    const updated = await db("users").where({ id: userId }).first();
    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.full_name,
      profileImageUrl: updated.profile_image_url,
      preferences: updated.preferences,
      emailVerified: updated.email_verified,
      isActive: updated.is_active,
      createdAt: new Date(updated.created_at).toISOString(),
      updatedAt: new Date(updated.updated_at).toISOString(),
    };
  },

  // Profile Image Management
  async uploadProfileImage(userId: string, imageUrl: string, mimeType: string, fileSize: number): Promise<ProfileImage> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      throw new Error("User not found");
    }

    // Validate file size (max 5MB)
    const maxFileSize = 5 * 1024 * 1024;
    if (fileSize > maxFileSize) {
      throw new Error("File size exceeds 5MB limit");
    }

    // Validate MIME type
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(mimeType)) {
      throw new Error("Invalid image type. Allowed: JPEG, PNG, WebP");
    }

    // Mark previous images as not current
    await db("user_profile_images")
      .where({ user_id: userId, is_current: true })
      .update({ is_current: false });

    const imageId = randomUUID();
    const now = new Date().toISOString();

    const profileImage: ProfileImage = {
      id: imageId,
      userId,
      imageUrl,
      mimeType,
      fileSize,
      isCurrent: true,
      createdAt: now,
    };

    await db("user_profile_images").insert({
      id: profileImage.id,
      user_id: profileImage.userId,
      image_url: profileImage.imageUrl,
      mime_type: profileImage.mimeType,
      file_size: profileImage.fileSize,
      is_current: profileImage.isCurrent,
      created_at: profileImage.createdAt,
    });

    // Update user profile image URL
    await db("users").where({ id: userId }).update({
      profile_image_url: imageUrl,
      updated_at: now,
    });

    return profileImage;
  },

  async getProfileImage(userId: string): Promise<ProfileImage | null> {
    const image = await db("user_profile_images")
      .where({ user_id: userId, is_current: true, deleted_at: null })
      .first();

    if (!image) {
      return null;
    }

    return {
      id: image.id,
      userId: image.user_id,
      imageUrl: image.image_url,
      mimeType: image.mime_type,
      fileSize: image.file_size,
      isCurrent: image.is_current,
      createdAt: new Date(image.created_at).toISOString(),
    };
  },

  // User Preferences
  async getPreferences(userId: string): Promise<UserPreferences | null> {
    const prefs = await db("user_preferences").where({ user_id: userId }).first();
    if (!prefs) {
      return null;
    }

    return {
      notificationsEnabled: prefs.notifications_enabled,
      emailNotifications: prefs.email_notifications,
      preferredLanguage: prefs.preferred_language,
      timezone: prefs.timezone,
      receivePromotionalEmails: prefs.receive_promotional_emails,
      notificationSettings: prefs.notification_settings,
    };
  },

  async updatePreferences(userId: string, updates: Partial<UserPreferences>): Promise<UserPreferences> {
    const existing = await db("user_preferences").where({ user_id: userId }).first();
    if (!existing) {
      throw new Error("Preferences not found");
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.notificationsEnabled !== undefined) {
      updateData.notifications_enabled = updates.notificationsEnabled;
    }
    if (updates.emailNotifications !== undefined) {
      updateData.email_notifications = updates.emailNotifications;
    }
    if (updates.preferredLanguage !== undefined) {
      updateData.preferred_language = updates.preferredLanguage;
    }
    if (updates.timezone !== undefined) {
      updateData.timezone = updates.timezone;
    }
    if (updates.receivePromotionalEmails !== undefined) {
      updateData.receive_promotional_emails = updates.receivePromotionalEmails;
    }
    if (updates.notificationSettings !== undefined) {
      updateData.notification_settings = updates.notificationSettings;
    }

    await db("user_preferences").where({ user_id: userId }).update(updateData);

    const updated = await db("user_preferences").where({ user_id: userId }).first();
    return {
      notificationsEnabled: updated.notifications_enabled,
      emailNotifications: updated.email_notifications,
      preferredLanguage: updated.preferred_language,
      timezone: updated.timezone,
      receivePromotionalEmails: updated.receive_promotional_emails,
      notificationSettings: updated.notification_settings,
    };
  },

  // Email Verification
  async verifyEmail(userId: string, token: string): Promise<boolean> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      throw new Error("User not found");
    }

    if (user.verification_token !== token) {
      throw new Error("Invalid verification token");
    }

    const expiresAt = new Date(user.verification_token_expires_at);
    if (expiresAt < new Date()) {
      throw new Error("Verification token has expired");
    }

    await db("users").where({ id: userId }).update({
      email_verified: true,
      verification_token: null,
      verification_token_expires_at: null,
      updated_at: new Date().toISOString(),
    });

    return true;
  },

  async resendVerificationEmail(userId: string): Promise<string> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      throw new Error("User not found");
    }

    if (user.email_verified) {
      throw new Error("Email already verified");
    }

    const verificationToken = generateToken();
    const verificationTokenExpiresAt = getExpiryTime(VERIFICATION_TOKEN_EXPIRY_HOURS);

    await db("users").where({ id: userId }).update({
      verification_token: verificationToken,
      verification_token_expires_at: verificationTokenExpiresAt,
      updated_at: new Date().toISOString(),
    });

    return verificationToken;
  },

  // Account Deletion
  async requestAccountDeletion(userId: string, reason?: string): Promise<AccountDeletionRequest> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      throw new Error("User not found");
    }

    // Check if deletion already pending
    const existing = await db("account_deletion_requests")
      .where({ user_id: userId, status: "pending" })
      .first();

    if (existing) {
      throw new Error("Account deletion already requested");
    }

    const confirmationToken = generateToken();
    const deletionRequestId = randomUUID();
    const expiresAt = getDeletionGracePeriod();
    const now = new Date().toISOString();

    const deletionRequest: AccountDeletionRequest = {
      id: deletionRequestId,
      userId,
      status: "pending",
      confirmationToken,
      requestedAt: now,
      confirmedAt: null,
      completionAt: null,
      expiresAt,
      reason: reason || null,
    };

    await db("account_deletion_requests").insert({
      id: deletionRequest.id,
      user_id: deletionRequest.userId,
      status: deletionRequest.status,
      confirmation_token: deletionRequest.confirmationToken,
      requested_at: deletionRequest.requestedAt,
      expires_at: deletionRequest.expiresAt,
      reason: deletionRequest.reason,
    });

    return deletionRequest;
  },

  async confirmAccountDeletion(userId: string, token: string): Promise<AccountDeletionRequest> {
    const deletionRequest = await db("account_deletion_requests")
      .where({ user_id: userId, status: "pending" })
      .first();

    if (!deletionRequest) {
      throw new Error("No pending deletion request found");
    }

    if (deletionRequest.confirmation_token !== token) {
      throw new Error("Invalid confirmation token");
    }

    const expiresAt = new Date(deletionRequest.expires_at);
    if (expiresAt < new Date()) {
      throw new Error("Deletion request has expired");
    }

    const now = new Date().toISOString();
    await db("account_deletion_requests")
      .where({ id: deletionRequest.id })
      .update({
        status: "confirmed",
        confirmed_at: now,
      });

    return {
      id: deletionRequest.id,
      userId: deletionRequest.user_id,
      status: "confirmed" as const,
      confirmationToken: deletionRequest.confirmation_token,
      requestedAt: new Date(deletionRequest.requested_at).toISOString(),
      confirmedAt: now,
      completionAt: null,
      expiresAt: new Date(deletionRequest.expires_at).toISOString(),
      reason: deletionRequest.reason,
    };
  },

  async cancelAccountDeletion(userId: string): Promise<void> {
    const deletionRequest = await db("account_deletion_requests")
      .where({ user_id: userId, status: "pending" })
      .first();

    if (!deletionRequest) {
      throw new Error("No pending deletion request found");
    }

    await db("account_deletion_requests")
      .where({ id: deletionRequest.id })
      .update({
        status: "cancelled",
      });
  },

  async completeAccountDeletion(userId: string): Promise<void> {
    const deletionRequest = await db("account_deletion_requests")
      .where({ user_id: userId, status: "confirmed" })
      .first();

    if (!deletionRequest) {
      throw new Error("Account deletion not confirmed");
    }

    // Soft delete user account
    await db("users").where({ id: userId }).update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Mark deletion as completed
    const now = new Date().toISOString();
    await db("account_deletion_requests")
      .where({ id: deletionRequest.id })
      .update({
        status: "completed",
        completion_at: now,
      });
  },

  async deleteUser(userId: string): Promise<UserProfile> {
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      throw new Error("User not found");
    }

    // Hard delete - this is irreversible
    const now = new Date().toISOString();
    await db("users").where({ id: userId }).update({
      is_active: false,
      deleted_at: now,
      updated_at: now,
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      profileImageUrl: user.profile_image_url,
      preferences: user.preferences,
      emailVerified: user.email_verified,
      isActive: false,
      createdAt: new Date(user.created_at).toISOString(),
      updatedAt: now,
    };
  },
};
