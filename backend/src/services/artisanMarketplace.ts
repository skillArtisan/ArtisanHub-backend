import { randomUUID } from "node:crypto";
import db from "../db.js";
import type { ArtisanProfile, ArtisanReview } from "../types.js";

// ============ TYPES ============

export type SearchFilters = {
  skill?: string;
  trade?: string;
  location?: string;
  city?: string;
  minRating?: number;
  isAvailable?: boolean;
  isVerified?: boolean;
  page?: number;
  limit?: number;
  sortBy?: "rating" | "reviews" | "completed" | "newest";
  sortOrder?: "asc" | "desc";
};

export type ArtisanMarketplaceProfile = {
  artisanId: string;
  name: string;
  bio: string | null;
  skills: string[];
  location: string | null;
  experience: string | null;
  averageRating: number;
  totalReviews: number;
  completedJobs: number;
  isVerified: boolean;
  isAvailable: boolean;
  profileImage: string | null;
  languages: string[];
  joinedDate: string;
};

export type Reputation = {
  artisanId: string;
  averageRating: number;
  totalReviews: number;
  completedJobs: number;
  isVerified: boolean;
  verificationDate?: string;
};

// ============ MARKETPLACE SERVICE ============

export const artisanMarketplaceService = {
  // ============ SEARCH & DISCOVERY ============

  async searchArtisans(filters: SearchFilters = {}): Promise<{
    artisans: ArtisanMarketplaceProfile[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    let query = db("users")
      .join("artisan_profiles", "users.id", "artisan_profiles.artisan_id")
      .join("reputations", "users.id", "reputations.artisan")
      .select(
        "users.id as artisan_id",
        "users.full_name as name",
        "artisan_profiles.bio",
        "artisan_profiles.skills",
        "artisan_locations.city",
        "artisan_profiles.experience_years as experience",
        "artisan_profiles.average_rating",
        "artisan_profiles.total_reviews",
        "reputations.completed",
        "artisan_profiles.is_verified",
        "artisan_profiles.is_active as is_available",
        "users.profile_image_url as profile_image",
        "artisan_profiles.languages",
        "users.created_at as joined_date"
      )
      .leftJoin("artisan_locations", function () {
        this.on("users.id", "artisan_locations.artisan_id").andOn(
          "artisan_locations.is_primary",
          "=",
          db.raw("true")
        );
      })
      .where("artisan_profiles.is_active", true)
      .where("users.is_active", true);

    // Apply filters
    if (filters.skill) {
      query = query.whereRaw("artisan_profiles.skills @> ?", [JSON.stringify([filters.skill])]);
    }

    if (filters.trade) {
      query = query.whereRaw("artisan_profiles.skills @> ?", [JSON.stringify([filters.trade])]);
    }

    if (filters.location && filters.city) {
      query = query.where("artisan_locations.city", "ilike", `%${filters.city}%`);
    } else if (filters.location) {
      query = query.where("artisan_locations.street_address", "ilike", `%${filters.location}%`);
    }

    if (filters.minRating !== undefined) {
      query = query.where("artisan_profiles.average_rating", ">=", filters.minRating);
    }

    if (filters.isAvailable !== undefined) {
      query = query.where("artisan_profiles.is_active", filters.isAvailable);
    }

    if (filters.isVerified !== undefined) {
      query = query.where("artisan_profiles.is_verified", filters.isVerified);
    }

    // Get total count before pagination
    const countResult = await query.clone().count("* as count").first();
    const total = parseInt(countResult?.count || "0", 10);

    // Apply sorting
    const sortBy = filters.sortBy || "rating";
    const sortOrder = filters.sortOrder || "desc";

    switch (sortBy) {
      case "rating":
        query = query.orderBy("artisan_profiles.average_rating", sortOrder);
        break;
      case "reviews":
        query = query.orderBy("artisan_profiles.total_reviews", sortOrder);
        break;
      case "completed":
        query = query.orderBy("reputations.completed", sortOrder);
        break;
      case "newest":
        query = query.orderBy("users.created_at", sortOrder);
        break;
      default:
        query = query.orderBy("artisan_profiles.average_rating", "desc");
    }

    query = query.offset(offset).limit(limit);

    const results = await query;

    const artisans: ArtisanMarketplaceProfile[] = results.map(row => ({
      artisanId: row.artisan_id,
      name: row.name,
      bio: row.bio,
      skills: row.skills || [],
      location: row.city || row.street_address,
      experience: row.experience,
      averageRating: row.average_rating,
      totalReviews: row.total_reviews,
      completedJobs: row.completed,
      isVerified: row.is_verified,
      isAvailable: row.is_available,
      profileImage: row.profile_image,
      languages: row.languages || [],
      joinedDate: new Date(row.joined_date).toISOString(),
    }));

    return { artisans, total, page, limit };
  },

  // ============ ARTISAN PROFILE ============

  async getArtisanProfile(artisanId: string): Promise<ArtisanMarketplaceProfile | null> {
    const result = await db("users")
      .join("artisan_profiles", "users.id", "artisan_profiles.artisan_id")
      .join("reputations", "users.id", "reputations.artisan")
      .leftJoin("artisan_locations", function () {
        this.on("users.id", "artisan_locations.artisan_id").andOn(
          "artisan_locations.is_primary",
          "=",
          db.raw("true")
        );
      })
      .select(
        "users.id as artisan_id",
        "users.full_name as name",
        "artisan_profiles.bio",
        "artisan_profiles.skills",
        "artisan_locations.city",
        "artisan_profiles.experience_years as experience",
        "artisan_profiles.average_rating",
        "artisan_profiles.total_reviews",
        "reputations.completed",
        "artisan_profiles.is_verified",
        "artisan_profiles.is_active as is_available",
        "users.profile_image_url as profile_image",
        "artisan_profiles.languages",
        "users.created_at as joined_date"
      )
      .where("users.id", artisanId)
      .where("artisan_profiles.is_active", true)
      .where("users.is_active", true)
      .first();

    if (!result) return null;

    return {
      artisanId: result.artisan_id,
      name: result.name,
      bio: result.bio,
      skills: result.skills || [],
      location: result.city,
      experience: result.experience,
      averageRating: result.average_rating,
      totalReviews: result.total_reviews,
      completedJobs: result.completed,
      isVerified: result.is_verified,
      isAvailable: result.is_available,
      profileImage: result.profile_image,
      languages: result.languages || [],
      joinedDate: new Date(result.joined_date).toISOString(),
    };
  },

  // ============ REVIEWS ============

  async addReview(
    artisanId: string,
    customerAddress: string,
    jobId: string,
    rating: number,
    comment?: string
  ): Promise<ArtisanReview> {
    // Validate rating
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error("Rating must be an integer between 1 and 5");
    }

    // Check if artisan exists
    const artisan = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    if (!artisan) {
      throw new Error("Artisan not found");
    }

    // Check if job exists and is completed
    const job = await db("jobs").where({ job_id: jobId }).first();
    if (!job) {
      throw new Error("Job not found");
    }

    if (job.state !== "Completed") {
      throw new Error("Can only review completed jobs");
    }

    if (job.customer !== customerAddress) {
      throw new Error("Only the customer can review this job");
    }

    // Check for duplicate review
    const existing = await db("artisan_reviews")
      .where({ artisan_id: artisanId, job_id: jobId })
      .first();

    if (existing) {
      throw new Error("Review already exists for this job");
    }

    const reviewId = randomUUID();
    const now = new Date().toISOString();

    await db("artisan_reviews").insert({
      id: reviewId,
      artisan_id: artisanId,
      customer: customerAddress,
      job_id: jobId,
      rating,
      comment: comment || null,
      is_verified_job: true, // Verified because linked to completed job
      created_at: now,
    });

    // Update artisan's average rating
    await this.updateArtisanRating(artisanId);

    return {
      id: reviewId,
      artisanId,
      customer: customerAddress,
      jobId,
      rating,
      comment: comment || null,
      isVerifiedJob: true,
      createdAt: now,
    };
  },

  async getArtisanReviews(artisanId: string, page: number = 1, limit: number = 20): Promise<{
    reviews: ArtisanReview[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;

    const countResult = await db("artisan_reviews")
      .where({ artisan_id: artisanId })
      .count("* as count")
      .first();

    const total = parseInt(countResult?.count || "0", 10);

    const reviews = await db("artisan_reviews")
      .where({ artisan_id: artisanId })
      .orderBy("created_at", "desc")
      .offset(offset)
      .limit(limit);

    return {
      reviews: reviews.map(r => ({
        id: r.id,
        artisanId: r.artisan_id,
        customer: r.customer,
        jobId: r.job_id,
        rating: r.rating,
        comment: r.comment,
        isVerifiedJob: r.is_verified_job,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      total,
      page,
      limit,
    };
  },

  // ============ REPUTATION ============

  async getReputation(artisanId: string): Promise<Reputation | null> {
    const profile = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    if (!profile) return null;

    const reputation = await db("reputations").where({ artisan: artisanId }).first();

    return {
      artisanId,
      averageRating: profile.average_rating,
      totalReviews: profile.total_reviews,
      completedJobs: reputation?.completed || 0,
      isVerified: profile.is_verified,
      verificationDate: profile.is_verified ? profile.profile_updated_at : undefined,
    };
  },

  async updateArtisanRating(artisanId: string): Promise<void> {
    const reviewStats = await db("artisan_reviews")
      .where({ artisan_id: artisanId })
      .select(
        db.raw("AVG(rating) as average_rating"),
        db.raw("COUNT(*) as total_reviews")
      )
      .first();

    const averageRating = reviewStats?.average_rating ? Math.round(reviewStats.average_rating * 10) / 10 : 0;
    const totalReviews = parseInt(reviewStats?.total_reviews || "0", 10);

    await db("artisan_profiles").where({ artisan_id: artisanId }).update({
      average_rating: averageRating,
      total_reviews: totalReviews,
      profile_updated_at: new Date().toISOString(),
    });
  },

  // ============ AVAILABILITY CHECK ============

  async checkAvailability(artisanId: string): Promise<boolean> {
    const profile = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    return profile?.is_active === true;
  },

  async getArtisansBySkill(skill: string): Promise<ArtisanMarketplaceProfile[]> {
    return this.searchArtisans({ skill, limit: 100 }).then(r => r.artisans);
  },

  async getArtisansByLocation(city: string): Promise<ArtisanMarketplaceProfile[]> {
    return this.searchArtisans({ city, limit: 100 }).then(r => r.artisans);
  },

  async getTopRatedArtisans(limit: number = 10): Promise<ArtisanMarketplaceProfile[]> {
    return this.searchArtisans({
      sortBy: "rating",
      sortOrder: "desc",
      limit,
    }).then(r => r.artisans);
  },

  async getNewArtisans(limit: number = 10): Promise<ArtisanMarketplaceProfile[]> {
    return this.searchArtisans({
      sortBy: "newest",
      sortOrder: "desc",
      limit,
    }).then(r => r.artisans);
  },

  // ============ VERIFICATION ============

  async verifyArtisan(artisanId: string): Promise<void> {
    const profile = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    if (!profile) {
      throw new Error("Artisan profile not found");
    }

    await db("artisan_profiles").where({ artisan_id: artisanId }).update({
      is_verified: true,
      profile_updated_at: new Date().toISOString(),
    });
  },

  async unverifyArtisan(artisanId: string): Promise<void> {
    await db("artisan_profiles").where({ artisan_id: artisanId }).update({
      is_verified: false,
      profile_updated_at: new Date().toISOString(),
    });
  },
};
