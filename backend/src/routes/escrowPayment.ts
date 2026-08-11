import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { escrowPaymentService } from "../services/escrowPayment.js";
import { jobService } from "../services/jobs.js";
import { verifySignature } from "../utils/auth.js";
import { validateStellarPublicKey } from "../utils/validation.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// Validation schemas
const escrowQuerySchema = z.object({
  jobId: z.string().min(1, "Job ID required"),
});

const releaseInitiateSchema = z.object({
  actor: z.string().min(1),
  signature: z.string().min(1),
});

const releaseConfirmSchema = z.object({
  transactionHash: z.string().min(1),
});

const refundSchema = z.object({
  reason: z.string().max(500),
  mediator: z.string().min(1),
  signature: z.string().min(1),
});

const handleFailureSchema = z.object({
  transactionHash: z.string().min(1),
  errorMessage: z.string().max(1000),
});

const statsQuerySchema = z.object({
  status: z
    .enum(["funding_pending", "funds_locked", "release_pending", "released", "refunded", "disputed"])
    .optional(),
  limit: z.number().min(1).max(500).optional().default(100),
  offset: z.number().min(0).optional().default(0),
});

// Rate limiters
const basicRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
});

const paymentRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
});

export async function registerEscrowPaymentRoutes(app: FastifyInstance) {
  /**
   * GET /api/jobs/:jobId/escrow
   * Retrieve current escrow status for a job
   */
  app.get(
    "/api/jobs/:jobId/escrow",
    { preHandler: basicRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };

        // Verify job exists
        const job = await jobService.getJob(jobId).catch(() => null);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }

        // Get escrow status
        const escrow = await escrowPaymentService.getEscrowStatus(jobId);
        
        // Get payment history
        const history = await escrowPaymentService.getPaymentHistory(jobId, 20, 0);

        return {
          escrow,
          history,
          _links: {
            job: `/api/jobs/${jobId}`,
            jobHistory: `/api/jobs/${jobId}/history`,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const statusCode = message.includes("not found") ? 404 : 500;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  /**
   * POST /api/jobs/:jobId/escrow/release-initiate
   * Initiate fund release (customer confirms job completion)
   */
  app.post(
    "/api/jobs/:jobId/escrow/release-initiate",
    { preHandler: paymentRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        const { actor, signature } = releaseInitiateSchema.parse(request.body);

        // Validate Stellar key
        validateStellarPublicKey(actor, "actor");

        // Verify signature
        const sigPayload = `RELEASE_INITIATE:${jobId}`;
        if (!verifySignature(actor, sigPayload, signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        // Verify job exists and actor is authorized
        const job = await jobService.getJob(jobId);
        if (job.customer !== actor && job.artisan !== actor) {
          return reply.code(403).send({ error: "Unauthorized: not job customer or artisan" });
        }

        // Initiate release
        const escrow = await escrowPaymentService.initiateRelease(
          jobId,
          actor,
          (request.ip as string) || undefined,
          request.headers["user-agent"]
        );

        return reply.code(202).send({
          message: "Release initiated",
          escrow,
          _links: {
            confirmRelease: `/api/jobs/${jobId}/escrow/release-confirm`,
            escrowStatus: `/api/jobs/${jobId}/escrow`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const statusCode = message.includes("not found")
          ? 404
          : message.includes("Invalid") || message.includes("Unauthorized")
            ? 401
            : message.includes("Cannot")
              ? 409
              : 500;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  /**
   * POST /api/jobs/:jobId/escrow/release-confirm
   * Confirm fund release with transaction hash (system endpoint)
   */
  app.post(
    "/api/jobs/:jobId/escrow/release-confirm",
    { preHandler: paymentRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        const { transactionHash } = releaseConfirmSchema.parse(request.body);

        // Confirm release
        const escrow = await escrowPaymentService.confirmRelease(
          jobId,
          transactionHash,
          (request.ip as string) || undefined,
          request.headers["user-agent"]
        );

        return {
          message: "Release confirmed",
          escrow,
          _links: {
            escrowStatus: `/api/jobs/${jobId}/escrow`,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const statusCode = message.includes("not found") ? 404 : message.includes("duplicate") ? 409 : 500;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  /**
   * POST /api/jobs/:jobId/escrow/refund
   * Initiate refund (dispute resolution favoring customer)
   */
  app.post(
    "/api/jobs/:jobId/escrow/refund",
    { preHandler: paymentRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        const { reason, mediator, signature } = refundSchema.parse(request.body);

        // Validate Stellar key
        validateStellarPublicKey(mediator, "mediator");

        // Verify signature
        const sigPayload = `REFUND:${jobId}:${reason}`;
        if (!verifySignature(mediator, sigPayload, signature)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        // Verify job exists
        const job = await jobService.getJob(jobId);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }

        // Initiate refund
        const escrow = await escrowPaymentService.initiateRefund(
          jobId,
          reason,
          mediator,
          (request.ip as string) || undefined,
          request.headers["user-agent"]
        );

        return reply.code(202).send({
          message: "Refund initiated",
          escrow,
          _links: {
            escrowStatus: `/api/jobs/${jobId}/escrow`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const statusCode = message.includes("not found")
          ? 404
          : message.includes("Invalid")
            ? 401
            : message.includes("Cannot")
              ? 409
              : 500;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  /**
   * GET /api/jobs/:jobId/escrow/history
   * Get payment history for a job
   */
  app.get(
    "/api/jobs/:jobId/escrow/history",
    { preHandler: basicRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        const query = z
          .object({
            limit: z.coerce.number().min(1).max(500).optional().default(50),
            offset: z.coerce.number().min(0).optional().default(0),
          })
          .parse(request.query);

        // Verify job exists
        const job = await jobService.getJob(jobId).catch(() => null);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }

        // Get history
        const history = await escrowPaymentService.getPaymentHistory(jobId, query.limit, query.offset);

        return {
          jobId,
          events: history,
          pagination: {
            limit: query.limit,
            offset: query.offset,
            hasMore: history.length === query.limit,
          },
          _links: {
            escrowStatus: `/api/jobs/${jobId}/escrow`,
            job: `/api/jobs/${jobId}`,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const statusCode = message.includes("not found") ? 404 : 500;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  /**
   * POST /api/jobs/:jobId/escrow/transaction-failed
   * Report failed transaction (system endpoint)
   */
  app.post(
    "/api/jobs/:jobId/escrow/transaction-failed",
    { preHandler: paymentRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        const { transactionHash, errorMessage } = handleFailureSchema.parse(request.body);

        // Record failure
        const event = await escrowPaymentService.handleTransactionFailure(
          jobId,
          transactionHash,
          errorMessage,
          (request.ip as string) || undefined,
          request.headers["user-agent"]
        );

        return reply.code(202).send({
          message: "Transaction failure recorded",
          event,
          _links: {
            escrowStatus: `/api/jobs/${jobId}/escrow`,
            retryRelease: `/api/jobs/${jobId}/escrow/release-initiate`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const statusCode = message.includes("not found") ? 404 : 500;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  /**
   * GET /api/escrow/statistics
   * Get payment statistics (admin/monitoring)
   */
  app.get(
    "/api/escrow/statistics",
    { preHandler: basicRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await escrowPaymentService.getPaymentStatistics();
        const allStates = await escrowPaymentService.getAllEscrowStates(undefined, 1000, 0);

        return {
          statistics: stats,
          summary: {
            totalJobs: allStates.length,
            avgAmountStroops: allStates.length > 0
              ? (
                  BigInt(
                    allStates.reduce((sum, s) => sum + BigInt(s.amountStroops), BigInt(0)).toString()
                  ) / BigInt(allStates.length)
                ).toString()
              : "0",
            statusDistribution: {
              fundingPending: stats.totalFunded,
              fundsLocked: stats.totalLocked,
              releasePending: stats.pendingActions,
              released: stats.totalReleased,
              refunded: stats.totalRefunded,
              disputed: stats.totalDisputed,
            },
          },
          _links: {
            allJobs: "/api/jobs",
            jobDetails: "/api/jobs/{jobId}",
            escrowStatus: "/api/jobs/{jobId}/escrow",
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        return reply.code(500).send({ error: message });
      }
    }
  );

  /**
   * GET /api/escrow/states
   * Get all escrow states with filtering (admin)
   */
  app.get(
    "/api/escrow/states",
    { preHandler: basicRateLimiter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = statsQuerySchema.parse(request.query);
        const states = await escrowPaymentService.getAllEscrowStates(query.status, query.limit, query.offset);

        return {
          states,
          pagination: {
            limit: query.limit,
            offset: query.offset,
            hasMore: states.length === query.limit,
          },
          filter: {
            status: query.status || "all",
          },
          _links: {
            statistics: "/api/escrow/statistics",
            nextPage:
              states.length === query.limit
                ? `/api/escrow/states?status=${query.status || "all"}&limit=${query.limit}&offset=${query.offset + query.limit}`
                : null,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
