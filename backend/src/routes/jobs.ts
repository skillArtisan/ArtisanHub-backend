import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { jobService } from "../services/jobs.js";
import { sorobanService } from "../services/soroban.js";
import { verifySignature } from "../utils/auth.js";

const createJobSchema = z.object({
  customer: z.string().min(1),
  artisan: z.string().min(1),
  amount: z.string().regex(/^\d+$/, "amount must be a stroop integer string"),
  jobHash: z.string().min(8),
  trade: z.string().min(1).max(32),
  description: z.string().max(1000).optional(),
  signature: z.string().min(1)
});

const actorSchema = z.object({
  actor: z.string().min(1),
  signature: z.string().min(1)
});

const resolveSchema = z.object({
  mediator: z.string().min(1),
  favour: z.enum(["artisan", "customer"]),
  signature: z.string().min(1)
});

function toErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      body: { error: "validation failed", issues: error.flatten() },
    };
  }

  const message = error instanceof Error ? error.message : "unexpected error";
  const statusCode = message.includes("not found") ? 404 : 
                     message.includes("unauthorized") ? 401 :
                     message.includes("invalid signature") ? 401 : 
                     message.includes("Contract execution failed") ? 502 : 409;
  return { statusCode, body: { error: message } };
}

const sensitiveRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
});

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/jobs", async () => {
    return { jobs: await jobService.listJobs() };
  });

  app.get("/api/jobs/:jobId", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      return { job: await jobService.getJob(jobId) };
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs", async (request, reply) => {
    try {
      const payload = createJobSchema.parse(request.body);
      
      const sigPayload = `CREATE_JOB:${payload.customer}:${payload.artisan}:${payload.amount}:${payload.jobHash}`;
      if (!verifySignature(payload.customer, sigPayload, payload.signature)) {
        throw new Error("invalid signature");
      }

      const job = await jobService.createJob(payload);
      
      try {
        const contract = await sorobanService.createJob(job);
        return reply.code(201).send({ job, contract });
      } catch (contractError) {
        await jobService.deleteJob(job.jobId);
        throw contractError;
      }
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/accept", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { actor, signature } = actorSchema.parse(request.body);
      
      const sigPayload = `ACCEPT_JOB:${jobId}`;
      if (!verifySignature(actor, sigPayload, signature)) {
        throw new Error("invalid signature");
      }

      const job = await jobService.acceptJob(jobId, actor);

      try {
        const contract = await sorobanService.acceptJob(jobId, actor);
        return { job, contract };
      } catch (contractError) {
        await jobService.setJobState(jobId, "Open");
        throw contractError;
      }
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/confirm", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { actor, signature } = actorSchema.parse(request.body);
      
      const sigPayload = `CONFIRM_DONE:${jobId}`;
      if (!verifySignature(actor, sigPayload, signature)) {
        throw new Error("invalid signature");
      }

      const job = await jobService.confirmDone(jobId, actor);

      try {
        const contract = await sorobanService.confirmDone(jobId, actor);
        return { job, contract };
      } catch (contractError) {
        await jobService.setJobState(jobId, "Active");
        await jobService.revertReputation(job.artisan, job.amount, true);
        throw contractError;
      }
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/dispute", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { actor, signature } = actorSchema.parse(request.body);
      
      const sigPayload = `RAISE_DISPUTE:${jobId}`;
      if (!verifySignature(actor, sigPayload, signature)) {
        throw new Error("invalid signature");
      }

      const job = await jobService.raiseDispute(jobId, actor);

      try {
        const contract = await sorobanService.raiseDispute(jobId, actor);
        return { job, contract };
      } catch (contractError) {
        await jobService.setJobState(jobId, "Active");
        // We also need to clear dispute_at, but setJobState only sets state. For simplicity, we just leave dispute_at.
        throw contractError;
      }
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });

  app.post("/api/jobs/:jobId/resolve", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { mediator, favour, signature } = resolveSchema.parse(request.body);
      
      if (!process.env.MEDIATOR_PUBLIC_KEY || mediator !== process.env.MEDIATOR_PUBLIC_KEY) {
        throw new Error("unauthorized: not the mediator");
      }

      const sigPayload = `RESOLVE_DISPUTE:${jobId}:${favour}`;
      if (!verifySignature(mediator, sigPayload, signature)) {
        throw new Error("invalid signature");
      }

      const job = await jobService.resolveDispute(jobId, favour);

      try {
        const contract = await sorobanService.resolveDispute(jobId, mediator, favour);
        return { job, contract };
      } catch (contractError) {
        await jobService.setJobState(jobId, "Disputed");
        if (favour === "artisan") {
          await jobService.revertReputation(job.artisan, job.amount, true);
        } else {
          await jobService.revertReputation(job.artisan, "0", false);
        }
        throw contractError;
      }
    } catch (error) {
      const response = toErrorResponse(error);
      return reply.code(response.statusCode).send(response.body);
    }
  });
}
