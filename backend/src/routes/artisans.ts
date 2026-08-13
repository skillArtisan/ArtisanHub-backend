import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { artisanService } from "../services/artisans.js";
import { verifySignature } from "../utils/auth.js";
import { validateStellarPublicKey } from "../utils/validation.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// Schemas
const profileUpdateSchema = z.object({
  bio: z.string().optional(),
  experienceYears: z.string().optional(),
  education: z.string().optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  signature: z.string(),
});

const createServiceSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  basePrice: z.string(),
  currency: z.string().default("XLM"),
  estimatedDurationMinutes: z.number().optional(),
  serviceDetails: z.record(z.unknown()).optional(),
  signature: z.string(),
});

const updateServiceSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  basePrice: z.string().optional(),
  currency: z.string().optional(),
  isAvailable: z.boolean().optional(),
  estimatedDurationMinutes: z.number().optional(),
  serviceDetails: z.record(z.unknown()).optional(),
  signature: z.string(),
});

const portfolioItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  images: z.array(z.string().url()).optional(),
  category: z.string().optional(),
  completionDate: z.string().optional(),
  projectUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  signature: z.string(),
});

const workingHoursSchema = z.object({
  dayOfWeek: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  signature: z.string(),
});

const specialHoursSchema = z.object({
  type: z.enum(["holiday", "vacation", "special_closure"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
  signature: z.string(),
});

const locationSchema = z.object({
  locationName: z.string(),
  streetAddress: z.string(),
  city: z.string(),
  stateProvince: z.string(),
  postalCode: z.string(),
  country: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  phoneNumber: z.string().optional(),
  isPrimary: z.boolean().optional().default(false),
  isServiceLocation: z.boolean().optional().default(true),
  signature: z.string(),
});

// Rate limiters
const updateLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

export async function registerArtisanRoutes(app: FastifyInstance) {
  // ============ ARTISAN PROFILE ROUTES ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/profile",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const profile = await artisanService.getProfile(artisanId);
        if (!profile) {
          return reply.code(404).send({ error: "Profile not found. Create one first." });
        }

        return { profile };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/profile",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = profileUpdateSchema.parse(request.body);

        if (!verifySignature(artisanId, `CREATE_PROFILE:${artisanId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const profile = await artisanService.createProfile(artisanId, {
          bio: validated.bio,
          experienceYears: validated.experienceYears,
          education: validated.education,
          skills: validated.skills,
          languages: validated.languages,
        });

        return reply.code(201).send({ profile });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("already exists") ? 409 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.put<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/profile",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = profileUpdateSchema.parse(request.body);

        if (!verifySignature(artisanId, `UPDATE_PROFILE:${artisanId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const profile = await artisanService.updateProfile(artisanId, {
          bio: validated.bio,
          experienceYears: validated.experienceYears,
          education: validated.education,
          skills: validated.skills,
          languages: validated.languages,
        });

        return { profile };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ SERVICES ROUTES ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/services",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const services = await artisanService.listServices(artisanId);
        return { services };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.get<{ Params: { serviceId: string } }>(
    "/api/artisans/services/:serviceId",
    async (request, reply) => {
      try {
        const { serviceId } = request.params;

        const service = await artisanService.getService(serviceId);
        if (!service) {
          return reply.code(404).send({ error: "Service not found" });
        }

        return { service };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/services",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = createServiceSchema.parse(request.body);

        if (!verifySignature(artisanId, `CREATE_SERVICE:${artisanId}:${validated.name}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const service = await artisanService.createService(artisanId, validated.categoryId, {
          name: validated.name,
          description: validated.description,
          basePrice: validated.basePrice,
          currency: validated.currency,
          estimatedDurationMinutes: validated.estimatedDurationMinutes,
          serviceDetails: validated.serviceDetails,
        });

        return reply.code(201).send({ service });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.put<{ Params: { serviceId: string }; Body: unknown }>(
    "/api/artisans/services/:serviceId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { serviceId } = request.params;

        const service = await artisanService.getService(serviceId);
        if (!service) {
          return reply.code(404).send({ error: "Service not found" });
        }

        const validated = updateServiceSchema.parse(request.body);

        if (!verifySignature(service.artisanId, `UPDATE_SERVICE:${serviceId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const updated = await artisanService.updateService(serviceId, {
          name: validated.name,
          description: validated.description,
          basePrice: validated.basePrice,
          currency: validated.currency,
          isAvailable: validated.isAvailable,
          estimatedDurationMinutes: validated.estimatedDurationMinutes,
          serviceDetails: validated.serviceDetails,
        });

        return { service: updated };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.delete<{ Params: { artisanId: string; serviceId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/services/:serviceId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId, serviceId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = z.object({ signature: z.string() }).parse(request.body);

        const service = await artisanService.getService(serviceId);
        if (!service) {
          return reply.code(404).send({ error: "Service not found" });
        }

        if (service.artisanId !== artisanId) {
          return reply.code(403).send({ error: "Unauthorized" });
        }

        if (!verifySignature(artisanId, `DELETE_SERVICE:${serviceId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        await artisanService.deleteService(serviceId);

        return { message: "Service deleted successfully" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ PORTFOLIO ROUTES ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/portfolio",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const items = await artisanService.listPortfolio(artisanId);
        return { portfolio: items };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/portfolio",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = portfolioItemSchema.parse(request.body);

        if (!verifySignature(artisanId, `CREATE_PORTFOLIO:${artisanId}:${validated.title}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const item = await artisanService.createPortfolioItem(artisanId, {
          title: validated.title,
          description: validated.description,
          images: validated.images,
          category: validated.category,
          completionDate: validated.completionDate,
          projectUrl: validated.projectUrl,
          tags: validated.tags,
        });

        return reply.code(201).send({ portfolioItem: item });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.put<{ Params: { itemId: string }; Body: unknown }>(
    "/api/artisans/portfolio/:itemId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { itemId } = request.params;

        const validated = portfolioItemSchema.partial().parse(request.body);

        const item = await artisanService.updatePortfolioItem(itemId, {
          title: validated.title,
          description: validated.description,
          images: validated.images,
          category: validated.category,
          completionDate: validated.completionDate,
          projectUrl: validated.projectUrl,
          tags: validated.tags,
        });

        return { portfolioItem: item };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.delete<{ Params: { artisanId: string; itemId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/portfolio/:itemId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId, itemId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = z.object({ signature: z.string() }).parse(request.body);

        if (!verifySignature(artisanId, `DELETE_PORTFOLIO:${itemId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        await artisanService.deletePortfolioItem(itemId);

        return { message: "Portfolio item deleted successfully" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ WORKING HOURS ROUTES ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/working-hours",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const hours = await artisanService.getWorkingHours(artisanId);
        return { workingHours: hours };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/working-hours",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = workingHoursSchema.parse(request.body);

        if (!verifySignature(artisanId, `SET_HOURS:${artisanId}:${validated.dayOfWeek}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const hours = await artisanService.setWorkingHours(
          artisanId,
          validated.dayOfWeek,
          validated.startTime,
          validated.endTime
        );

        return reply.code(201).send({ workingHours: hours });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.put<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/working-hours/:dayOfWeek",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId, dayOfWeek } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = z.object({ isAvailable: z.boolean(), signature: z.string() }).parse(request.body);

        if (!verifySignature(artisanId, `TOGGLE_DAY:${artisanId}:${dayOfWeek}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const hours = await artisanService.toggleWorkingDay(artisanId, dayOfWeek, validated.isAvailable);

        return { workingHours: hours };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not set") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ SPECIAL HOURS ROUTES ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/special-hours",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const hours = await artisanService.listSpecialHours(artisanId);
        return { specialHours: hours };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/special-hours",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = specialHoursSchema.parse(request.body);

        if (!verifySignature(artisanId, `ADD_SPECIAL:${artisanId}:${validated.startDate}:${validated.endDate}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const specialHours = await artisanService.addSpecialHours(
          artisanId,
          validated.type,
          validated.startDate,
          validated.endDate,
          validated.reason
        );

        return reply.code(201).send({ specialHours });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.delete<{ Params: { artisanId: string; specialHoursId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/special-hours/:specialHoursId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId, specialHoursId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = z.object({ signature: z.string() }).parse(request.body);

        if (!verifySignature(artisanId, `REMOVE_SPECIAL:${specialHoursId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        await artisanService.removeSpecialHours(specialHoursId);

        return { message: "Special hours removed successfully" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ LOCATIONS ROUTES ============

  app.get<{ Params: { artisanId: string } }>(
    "/api/artisans/:artisanId/locations",
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const locations = await artisanService.listLocations(artisanId);
        return { locations };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { artisanId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/locations",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = locationSchema.parse(request.body);

        if (!verifySignature(artisanId, `CREATE_LOCATION:${artisanId}:${validated.city}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const location = await artisanService.createLocation(artisanId, {
          locationName: validated.locationName,
          streetAddress: validated.streetAddress,
          city: validated.city,
          stateProvince: validated.stateProvince,
          postalCode: validated.postalCode,
          country: validated.country,
          latitude: validated.latitude,
          longitude: validated.longitude,
          phoneNumber: validated.phoneNumber,
          isPrimary: validated.isPrimary || false,
          isServiceLocation: validated.isServiceLocation !== false,
        });

        return reply.code(201).send({ location });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  app.put<{ Params: { locationId: string }; Body: unknown }>(
    "/api/artisans/locations/:locationId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { locationId } = request.params;

        const validated = locationSchema.partial().parse(request.body);

        const location = await artisanService.updateLocation(locationId, {
          locationName: validated.locationName,
          streetAddress: validated.streetAddress,
          city: validated.city,
          stateProvince: validated.stateProvince,
          postalCode: validated.postalCode,
          country: validated.country,
          latitude: validated.latitude,
          longitude: validated.longitude,
          phoneNumber: validated.phoneNumber,
          isPrimary: validated.isPrimary,
          isServiceLocation: validated.isServiceLocation,
        });

        return { location };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.delete<{ Params: { artisanId: string; locationId: string }; Body: unknown }>(
    "/api/artisans/:artisanId/locations/:locationId",
    { preHandler: updateLimiter },
    async (request, reply) => {
      try {
        const { artisanId, locationId } = request.params;
        validateStellarPublicKey(artisanId);

        const validated = z.object({ signature: z.string() }).parse(request.body);

        if (!verifySignature(artisanId, `DELETE_LOCATION:${locationId}`, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        await artisanService.deleteLocation(locationId);

        return { message: "Location deleted successfully" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );
}
