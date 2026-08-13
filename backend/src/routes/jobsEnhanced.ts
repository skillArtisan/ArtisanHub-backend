import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { jobPersistenceService, type JobSearchFilters } from "../services/jobPersistence.js";
import { jobService } from "../services/jobs.js";
import { verifySignature } from "../utils/auth.js";
import { validateStellarPublicKey } from "../utils/validation.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// ============ SCHEMAS ============

const searchQuerySchema = z.object({
  status: z.enum(["Open", "Active", "Completed", "Disputed", "Refunded", "Cancelled"]).optional(),
  customer: z.string().optional(),
  artisan: z.string().optional(),
  trade: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  sortBy: z.enum(["created", "amount", "updated"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const transitionSchema = z.object({
  newState: z.enum(["Open", "Active", "Completed", "Disputed", "Refunded", "Cancelled"]),
  reason: z.string().max(1000).optional(),
  transactionHash: z.string().optional(),
  signature: z.string(),
});

// Rate limiters
const jobLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

export async function registerEnhancedJobRoutes(app: FastifyInstance) {
  // ============ SEARCH & FILTER ============

  app.get<{ Querystring: unknown }>(
    "/api/jobs",
    async (request, reply) => {
      try {
        const query = searchQuerySchema.parse(request.query);

        const filters: JobSearchFilters = {
          status: query.status,
          customer: query.customer,
          artisan: query.artisan,
          trade: query.trade,
          minAmount: query.minAmount,
          maxAmount: query.maxAmount,
          createdAfter: query.createdAfter,
          createdBefore: query.createdBefore,
          page: query.page || 1,
          limit: query.limit || 20,
          sortBy: query.sortBy || "created",
          sortOrder: query.sortOrder || "desc",
        };

        const result = await jobPersistenceService.searchJobs(filters);

        return {
          jobs: result.jobs,
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

  // ============ JOB DETAILS ============

  app.get<{ Params: { jobId: string } }>(
    "/api/jobs/:jobId",
    async (request, reply) => {
      try {
        const { jobId } = request.params;

        const job = await jobPersistenceService.getJob(jobId);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }

        // Get history
        const { history } = await jobPersistenceService.getJobHistory(jobId, 1, 50);

        return { job, history };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ JOB HISTORY ============

  app.get<{ Params: { jobId: string }; Querystring: { page?: string; limit?: string } }>(
    "/api/jobs/:jobId/history",
    async (request, reply) => {
      try {
        const { jobId } = request.params;

        const page = Math.max(1, parseInt(request.query.page || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "50", 10)));

        // Check if user has access to this job
        const userAddress = request.headers["x-user-address"] as string | undefined;
        if (userAddress) {
          const hasAccess = await jobPersistenceService.isJobAccessible(jobId, userAddress);
          if (!hasAccess) {
            return reply.code(403).send({ error: "Not authorized to view this job" });
          }
        }

        const { history, total } = await jobPersistenceService.getJobHistory(jobId, page, limit);

        return {
          history,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ MY JOBS ============

  app.get<{ Querystring: { status?: string; role?: string; page?: string; limit?: string } }>(
    "/api/jobs/my-jobs",
    async (request, reply) => {
      try {
        const userAddress = request.headers["x-user-address"] as string | undefined;
        if (!userAddress) {
          return reply.code(400).send({ error: "x-user-address header required" });
        }

        validateStellarPublicKey(userAddress);

        const role = (request.query.role as string) || "both"; // customer, artisan, or both
        const status = request.query.status as string | undefined;
        const page = Math.max(1, parseInt(request.query.page || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "20", 10)));

        const filters: JobSearchFilters = {
          status: status as any,
          page,
          limit,
          sortOrder: "desc",
        };

        let jobs: any = [];

        if (role === "customer" || role === "both") {
          filters.customer = userAddress;
          const customerResult = await jobPersistenceService.searchJobs(filters);
          jobs = jobs.concat(customerResult.jobs);
        }

        if (role === "artisan" || role === "both") {
          filters.customer = undefined;
          filters.artisan = userAddress;
          const artisanResult = await jobPersistenceService.searchJobs(filters);
          jobs = jobs.concat(artisanResult.jobs);
        }

        // Remove duplicates and sort
        const uniqueJobs = Array.from(
          new Map(jobs.map(j => [j.jobId, j])).values()
        ).sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const paginatedJobs = uniqueJobs.slice((page - 1) * limit, page * limit);

        return {
          jobs: paginatedJobs,
          pagination: {
            page,
            limit,
            total: uniqueJobs.length,
            pages: Math.ceil(uniqueJobs.length / limit),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ JOB STATISTICS ============

  app.get<{ Querystring: { userAddress?: string } }>(
    "/api/jobs/stats",
    async (request, reply) => {
      try {
        const userAddress = (request.query.userAddress as string) || 
          (request.headers["x-user-address"] as string);

        if (!userAddress) {
          return reply.code(400).send({ error: "userAddress required" });
        }

        validateStellarPublicKey(userAddress);

        const stats = await jobPersistenceService.getUserJobStats(userAddress);

        return { stats };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ STATUS TRANSITION ============

  app.post<{ Params: { jobId: string }; Body: unknown }>(
    "/api/jobs/:jobId/transition",
    { preHandler: jobLimiter },
    async (request, reply) => {
      try {
        const { jobId } = request.params;
        const userAddress = request.headers["x-user-address"] as string | undefined;

        if (!userAddress) {
          return reply.code(400).send({ error: "x-user-address header required" });
        }

        validateStellarPublicKey(userAddress);

        const validated = transitionSchema.parse(request.body);

        // Verify signature
        const payload = `TRANSITION_JOB:${jobId}:${validated.newState}${validated.reason ? `:${validated.reason}` : ""}`;
        if (!verifySignature(userAddress, payload, validated.signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        // Check access
        const hasAccess = await jobPersistenceService.isJobAccessible(jobId, userAddress);
        if (!hasAccess) {
          return reply.code(403).send({ error: "Not authorized to modify this job" });
        }

        // Get job to check current state
        const job = await jobPersistenceService.getJob(jobId);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }

        // Validate transition
        const isValid = await jobPersistenceService.validateTransition(job.state, validated.newState);
        if (!isValid) {
          return reply.code(409).send({
            error: `Cannot transition from ${job.state} to ${validated.newState}`,
          });
        }

        // Create history entry
        const history = await jobPersistenceService.transitionJobStatus(
          jobId,
          validated.newState,
          userAddress,
          validated.reason,
          {},
          validated.transactionHash,
          request.ip,
          request.headers["user-agent"]
        );

        const updatedJob = await jobPersistenceService.getJob(jobId);

        return {
          job: updatedJob,
          history,
          message: `Job transitioned to ${validated.newState}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        const statusCode = message.includes("not found") ? 404 : 
                          message.includes("authorized") ? 403 : 
                          message.includes("Invalid transition") ? 409 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  // ============ VALIDATION ============

  app.post<{ Params: { jobId: string }; Body: unknown }>(
    "/api/jobs/:jobId/validate-transition",
    async (request, reply) => {
      try {
        const { jobId } = request.params;
        const validated = z.object({ newState: z.string() }).parse(request.body);

        const job = await jobPersistenceService.getJob(jobId);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }

        const isValid = await jobPersistenceService.validateTransition(
          job.state,
          validated.newState as any
        );

        return { isValid, currentState: job.state, requestedState: validated.newState };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ============ JOBS BY STATUS ============

  app.get<{ Querystring: { status?: string; limit?: string } }>(
    "/api/jobs/by-status",
    async (request, reply) => {
      try {
        const status = request.query.status as string;
        if (!status) {
          return reply.code(400).send({ error: "status query parameter required" });
        }

        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "50", 10)));

        const jobs = await jobPersistenceService.getJobsByState(status as any, limit);

        return { jobs };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
