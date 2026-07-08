import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { jobService } from "../services/jobs.js";
import { sorobanService } from "../services/soroban.js";
import { horizonService } from "../services/horizon.js";

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

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/settlements/:eventId", async (request, reply) => {
    try {
      const { eventId } = request.params as { eventId: string };
      const event = horizonService.getSettlementEvent(eventId);

      if (!event) {
        return reply.code(404).send({ error: "settlement event not found" });
      }

      return { event };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unexpected error";
      return reply.code(500).send({ error: message });
    }
  });

  app.get("/api/jobs/:jobId/settlements", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const events = horizonService.getSettlementEventsByJob(jobId);
      return { events };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unexpected error";
      return reply.code(500).send({ error: message });
    }
  });

  app.get("/api/settlements", async (request, reply) => {
    try {
      const { status } = request.query as {
        status?: "pending" | "completed" | "failed";
      };

      let events;
      if (status) {
        events = horizonService.getSettlementEventsByStatus(status);
      } else {
        events = Array.from((horizonService as any).store.events.values());
      }

      return { events };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unexpected error";
      return reply.code(500).send({ error: message });
    }
  });
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

  app.post("/api/jobs", async (request, reply) => {
    try {
      const payload = createJobSchema.parse(request.body);
      const job = jobService.createJob(payload);

      return reply.code(201).send({
        job,
        contract: sorobanService.createJob(job),
      });
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/accept", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { actor } = actorSchema.parse(request.body);
      const job = jobService.acceptJob(jobId, actor);

      return {
        job,
        contract: sorobanService.acceptJob(jobId, actor),
      };
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/confirm", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { actor, idempotencyKey } = request.body as {
        actor: string;
        idempotencyKey?: string;
      };
      const result = await jobService.confirmDone(jobId, actor, idempotencyKey);

      return {
        job: result.job,
        settlementEvent: result.settlementEvent,
        contract: sorobanService.confirmDone(jobId, actor),
      };
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/dispute", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { actor } = actorSchema.parse(request.body);
      const job = jobService.raiseDispute(jobId, actor);

      return {
        job,
        contract: sorobanService.raiseDispute(jobId, actor),
      };
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/resolve", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { mediator, favour, idempotencyKey } = request.body as {
        mediator: string;
        favour: "artisan" | "customer";
        idempotencyKey?: string;
      };
      const result = await jobService.resolveDispute(
        jobId,
        favour,
        idempotencyKey,
      );

      return {
        job: result.job,
        settlementEvent: result.settlementEvent,
        contract: sorobanService.resolveDispute(jobId, mediator, favour),
      };
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });
}
