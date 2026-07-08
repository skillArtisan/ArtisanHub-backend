import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { jobService } from "../services/jobs.js";
import { sorobanService } from "../services/soroban.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { auditTrail } from "../services/auditTrail.js";

const createJobSchema = z.object({
  customer: z.string().min(1),
  artisan: z.string().min(1),
  amount: z.string().regex(/^\d+$/, "amount must be a stroop integer string"),
  jobHash: z.string().min(8),
  trade: z.string().min(1).max(32),
  description: z.string().max(1000).optional(),
});

const actorSchema = z.object({
  actor: z.string().min(1),
});

const resolveSchema = z.object({
  mediator: z.string().min(1),
  favour: z.enum(["artisan", "customer"]),
});

function toErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      body: { error: "validation failed", issues: error.flatten() },
    };
  }

  const message = error instanceof Error ? error.message : "unexpected error";
  const statusCode = message.includes("not found") ? 404 : 409;
  return { statusCode, body: { error: message } };
}

const sensitiveRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
});

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/jobs", async () => {
    return { jobs: jobService.listJobs() };
  });

  app.get("/api/jobs/:jobId", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      return { job: jobService.getJob(jobId) };
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post(
    "/api/jobs",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await sensitiveRateLimiter(request, reply);

        const payload = createJobSchema.parse(request.body);
        const job = jobService.createJob(payload);

        // Audit log
        auditTrail.log(
          "job_created",
          job.jobId,
          payload.customer,
          { amount: payload.amount, trade: payload.trade },
          request.ip,
          request.headers["user-agent"],
        );

        return reply.code(201).send({
          job,
          contract: sorobanService.createJob(job),
        });
      } catch (error) {
        const response = toErrorResponse(error);
        return reply.code(response.statusCode).send(response.body);
      }
    },
  );

  app.post(
    "/api/jobs/:jobId/accept",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await sensitiveRateLimiter(request, reply);

        const { jobId } = request.params as { jobId: string };
        const { actor } = actorSchema.parse(request.body);
        const job = jobService.acceptJob(jobId, actor);

        // Audit log
        auditTrail.log(
          "job_accepted",
          jobId,
          actor,
          { previousState: "Open", newState: "Active" },
          request.ip,
          request.headers["user-agent"],
        );

        return {
          job,
          contract: sorobanService.acceptJob(jobId, actor),
        };
      } catch (error) {
        const response = toErrorResponse(error);
        return reply.code(response.statusCode).send(response.body);
      }
    },
  );

  app.post(
    "/api/jobs/:jobId/confirm",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await sensitiveRateLimiter(request, reply);

        const { jobId } = request.params as { jobId: string };
        const { actor } = actorSchema.parse(request.body);
        const job = jobService.confirmDone(jobId, actor);

        // Audit log
        auditTrail.log(
          "job_confirmed",
          jobId,
          actor,
          {
            previousState: "Active",
            newState: "Completed",
            amount: job.amount,
          },
          request.ip,
          request.headers["user-agent"],
        );

        return {
          job,
          contract: sorobanService.confirmDone(jobId, actor),
        };
      } catch (error) {
        const response = toErrorResponse(error);
        return reply.code(response.statusCode).send(response.body);
      }
    },
  );

  app.post(
    "/api/jobs/:jobId/dispute",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await sensitiveRateLimiter(request, reply);

        const { jobId } = request.params as { jobId: string };
        const { actor } = actorSchema.parse(request.body);
        const job = jobService.raiseDispute(jobId, actor);

        // Audit log
        auditTrail.log(
          "dispute_raised",
          jobId,
          actor,
          { previousState: "Active", newState: "Disputed" },
          request.ip,
          request.headers["user-agent"],
        );

        return {
          job,
          contract: sorobanService.raiseDispute(jobId, actor),
        };
      } catch (error) {
        const response = toErrorResponse(error);
        return reply.code(response.statusCode).send(response.body);
      }
    },
  );

  app.post(
    "/api/jobs/:jobId/resolve",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await sensitiveRateLimiter(request, reply);

        const { jobId } = request.params as { jobId: string };
        const { mediator, favour } = resolveSchema.parse(request.body);
        const job = jobService.resolveDispute(jobId, favour);

        // Audit log
        auditTrail.log(
          "dispute_resolved",
          jobId,
          mediator,
          { favour, newState: job.state },
          request.ip,
          request.headers["user-agent"],
        );

        return {
          job,
          contract: sorobanService.resolveDispute(jobId, mediator, favour),
        };
      } catch (error) {
        const response = toErrorResponse(error);
        return reply.code(response.statusCode).send(response.body);
      }
    },
  );
}
