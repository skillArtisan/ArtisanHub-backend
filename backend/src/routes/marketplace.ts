import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { artisanMarketplaceService, type SearchFilters } from "../services/artisanMarketplace.js";
import { verifySignature } from "../utils/auth.js";
import { validateStellarPublicKey } from "../utils/validation.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// ============ SCHEMAS ============

const searchQuerySchema = z.object({
  skill: z.string().optional(),
  trade: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  isAvailable: z.enum(["true", "false"]).optional().transform(v => v === "true"),
  isVerified: z.enum(["true", "false"]).optional().transform(v => v === "true"),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  sortBy: z.enum(["rating", "reviews", "completed", "newest"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  signature: z.string(),
});

// Rate limiters
const reviewLimiter = createRateLimiter({ maxRequests: 10, windowMs: 3600_000 }); // 10 per hour

export async function registerMarketplaceRoutes(app: FastifyInstance) {
  // ============ SEARCH & DISCOVERY ============

  app.get<{ Querystring: unknown }>(
    "/api/artisans",
    async (request, reply) => {
      try {
        const query = searchQuerySchema.parse(request.query);

        const filters: SearchFilters = {
          skill: query.skill,
          trade: query.trade,
          location: query.location,
          city: query.city,
          minRating: query.minRating,
          isAvailable: query.isAvailable,
          isVerified: query.isVerified,
          page: query.page || 1,
          limit: query.limit || 20,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        };

        const result = await artisanMarketplaceService.searchArtisans(filters);

        return {
          artisans: result.artisans,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            pages: Math.ceil(result.total / result.limit),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ ARTISAN PROFILE ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const profile = await artisanMarketplaceService.getArtisanProfile(artisanId);

        if (!profile) {
          return reply.code(404).send({ error: "Artisan not found or profile not available" });
        }

        // Get reputation
        const reputation = await artisanMarketplaceService.getReputation(artisanId);

        return {
          profile,
          reputation,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ REVIEWS ============

  app.get<{ Params: { artisanId: string }; Querystring: { page?: string; limit?: string } }>(
    "/api/artisans/:artisanId/reviews",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const page = Math.max(1, parseInt(request.query.page || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "20", 10)));

        const result = await artisanMarketplaceService.getArtisanReviews(artisanId, page, limit);

        return {
          reviews: result.reviews,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            pages: Math.ceil(result.total / result.limit),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/reviews",
    { preHandler: reviewLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = reviewSchema.parse(request.body);

        // Extract customer from signature (customer is the one making the review)
        const customerAddress = request.headers["x-customer-address"] as string | undefined;
        if (!customerAddress) {
          return reply.code(400).send({ error: "x-customer-address header required" });
        }

        validateStellarPublicKey(customerAddress);

        // Verify signature
        const payload = `ADD_REVIEW:${artisanId}:${validated.rating}${validated.comment ? `:${validated.comment}` : ""}`;
        if (!verifySignature(customerAddress, payload, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        // Get job ID from query (required for validation)
        const jobId = (request.query as any)?.jobId as string | undefined;
        if (!jobId) {
          return reply.code(400).send({ error: "jobId query parameter required" });
        }

        const review = await artisanMarketplaceService.addReview(
          artisanId,
          customerAddress,
          jobId,
          validated.rating,
          validated.comment
        );

        return reply.code(201).send({
          review,
          message: "Review added successfully",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("already exists") ? 409 : message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ REPUTATION ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/reputation",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const reputation = await artisanMarketplaceService.getReputation(artisanId);

        if (!reputation) {
          return reply.code(404).send({ error: "Artisan not found" });
        }

        return { reputation };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ CATEGORY BROWSING ============

  app.get<{ Querystring: { skill?: string; limit?: string } }>(
    "/api/artisans/browse/by-skill",
    async (request, reply) => {
      try {
        if (!request.query.skill) {
          return reply.code(400).send({ error: "skill query parameter required" });
        }

        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "20", 10)));
        const artisans = await artisanMarketplaceService.getArtisansBySkill(request.query.skill);

        return { artisans: artisans.slice(0, limit) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.get<{ Querystring: { city?: string; limit?: string } }>(
    "/api/artisans/browse/by-location",
    async (request, reply) => {
      try {
        if (!request.query.city) {
          return reply.code(400).send({ error: "city query parameter required" });
        }

        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "20", 10)));
        const artisans = await artisanMarketplaceService.getArtisansByLocation(request.query.city);

        return { artisans: artisans.slice(0, limit) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/api/artisans/browse/top-rated",
    async (request, reply) => {
      try {
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "10", 10)));
        const artisans = await artisanMarketplaceService.getTopRatedArtisans(limit);

        return { artisans };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/api/artisans/browse/new",
    async (request, reply) => {
      try {
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "10", 10)));
        const artisans = await artisanMarketplaceService.getNewArtisans(limit);

        return { artisans };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ AVAILABILITY CHECK ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/availability",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const isAvailable = await artisanMarketplaceService.checkAvailability(artisanId);

        return { isAvailable };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
