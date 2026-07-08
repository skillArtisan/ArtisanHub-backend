import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { jobService } from "../services/jobs.js";
import { sorobanService } from "../services/soroban.js";
import { config } from "../config.js";
import {
  validateStellarPublicKey,
  validateContractId,
  validateAmount,
  sanitizeText,
  ValidationError,
} from "../utils/validation.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FastifyRequest = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FastifyReply = any;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toErrorResponse(error: any): {
  statusCode: number;
  body: Record<string, any>;
} {
  if (error && error.constructor && error.constructor.name === "ZodError") {
    return {
      statusCode: 400,
      body: {
        error: "validation failed",
        issues: error.flatten(),
      },
    };
  }

  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      body: {
        error: error.message,
        field: error.field,
        code: error.code,
      },
    };
  }

  const message = error instanceof Error ? error.message : "unexpected error";
  const statusCode = message.includes("not found") ? 404 : 409;
  return { statusCode, body: { error: message } };
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/jobs", async () => {
    return { jobs: jobService.listJobs() };
  });

  app.get(
    "/api/jobs/:jobId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        return { job: jobService.getJob(jobId) };
      } catch (error) {
        const response = toErrorResponse(error);
        return reply.code(response.statusCode).send(response.body);
      }
    },
  );

  app.post(
    "/api/jobs",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = createJobSchema.parse(request.body);

        // Validate Stellar public keys
        validateStellarPublicKey(payload.customer, "customer");
        validateStellarPublicKey(payload.artisan, "artisan");

        // Validate amount
        validateAmount(payload.amount, "amount");

        // Validate contract ID if configured
        if (config.soroban.contractId) {
          validateContractId(config.soroban.contractId, "contractId");
        }

        // Sanitize description
        const sanitizedPayload = {
          ...payload,
          description: payload.description
            ? sanitizeText(payload.description, 1000)
            : undefined,
        };

        const job = jobService.createJob(sanitizedPayload);

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
        const { jobId } = request.params as { jobId: string };
        const { actor } = actorSchema.parse(request.body);

        // Validate Stellar public key
        validateStellarPublicKey(actor, "actor");

        const job = jobService.acceptJob(jobId, actor);

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
        const { jobId } = request.params as { jobId: string };
        const { actor } = actorSchema.parse(request.body);

        // Validate Stellar public key
        validateStellarPublicKey(actor, "actor");

        const job = jobService.confirmDone(jobId, actor);

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
        const { jobId } = request.params as { jobId: string };
        const { actor } = actorSchema.parse(request.body);

        // Validate Stellar public key
        validateStellarPublicKey(actor, "actor");

        const job = jobService.raiseDispute(jobId, actor);

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
        const { jobId } = request.params as { jobId: string };
        const { mediator, favour } = resolveSchema.parse(request.body);

        // Validate Stellar public key for mediator
        validateStellarPublicKey(mediator, "mediator");

        const job = jobService.resolveDispute(jobId, favour);

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
