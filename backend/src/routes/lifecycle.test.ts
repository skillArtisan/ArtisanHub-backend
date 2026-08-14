/**
 * Job Lifecycle Integration Tests
 *
 * Paths covered:
 *   A — create → accept → confirm (Completed)
 *   B — dispute → resolve (artisan wins)
 *   C — dispute → resolve (customer wins / Refunded)
 *
 * Also verifies:
 *   - 502 + DB rollback on Soroban failure (all 5 operations)
 *   - 400 on bad signature / invalid key
 *   - 409 on wrong state transition
 *   - 404 on missing job
 *   - contractTxHash persisted after every successful call
 *   - SKIPPED_NO_CONFIG flows through without error
 *   - MEDIATOR_PUBLIC_KEY env var gates the resolve endpoint
 */

// NOTE: Jest hoists jest.mock() calls. To share state between the factory
// and the test body we use module-level objects whose *properties* are mutated
// in beforeEach. The factory references the same object, so property mutations
// are visible across the module boundary.

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ─── Shared stub objects (defined before jest.mock hoisting runs) ─────────────

// Auth module exports a named function; we expose it as a property on an object
// so the factory can delegate to whichever implementation is active.
const authStub = {
  verifySignature: (..._args: unknown[]): boolean => true,
};

// Service stubs — keys are populated in beforeEach
const jobStub: Record<string, (...args: unknown[]) => unknown> = Object.create(null);
const sorobanStub: Record<string, (...args: unknown[]) => unknown> = Object.create(null);

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../db.js", () => ({ default: {} }));

// Auth: delegate to the mutable authStub so tests can flip verifySignature
jest.mock("../utils/auth.js", () => ({
  get verifySignature() {
    return authStub.verifySignature;
  },
}));

// Services: proxy through Proxy so per-test property mutations are visible
jest.mock("../services/jobs.js", () => ({
  jobService: new Proxy(jobStub, {
    get(target, prop) { return target[prop as string]; },
  }),
}));

jest.mock("../services/soroban.js", () => ({
  sorobanService: new Proxy(sorobanStub, {
    get(target, prop) { return target[prop as string]; },
  }),
}));

jest.mock("../services/auditTrail.js", () => ({
  auditTrail: { log: () => Promise.resolve() },
}));

jest.mock("../services/horizon.js", () => ({
  horizonService: {},
}));

jest.mock("../middleware/rateLimiter.js", () => ({
  createRateLimiter: () => async () => {},
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerJobRoutes } from "./jobs.js";
import type { JobRecord } from "../types.js";
import type { ContractResult } from "../services/soroban.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CUSTOMER = "GCUSTOMER0000000000000000000000000000000000000000000000000C";
const ARTISAN  = "GARTISAN00000000000000000000000000000000000000000000000000A";
const MEDIATOR = "GMEDIATOR0000000000000000000000000000000000000000000000000M";
const SIG      = "dGVzdA==";
const JOB_ID   = "OWO-LIFE01";

function makeJob(state: JobRecord["state"], extra: Partial<JobRecord> = {}): JobRecord {
  return {
    jobId: JOB_ID, customer: CUSTOMER, artisan: ARTISAN, amount: "5000000",
    state, createdAt: new Date().toISOString(),
    disputeAt: state === "Disputed" ? new Date().toISOString() : null,
    jobHash: "deadbeef", trade: "plumbing", ...extra,
  };
}

function contractOk(method: string, hash = `tx_${method}`): ContractResult {
  return { network: "testnet", contractId: "ctrlabc", method, hash, status: "SUCCESS" };
}

function contractSkipped(method: string): ContractResult {
  return { network: "testnet", contractId: "not-configured", method, status: "SKIPPED_NO_CONFIG" };
}

// Simple call tracker
function makeTracker() {
  const log: unknown[][] = [];
  return {
    fn: (...args: unknown[]) => { log.push(args); },
    calledWith(...expected: unknown[]) {
      const found = log.some((call) => expected.every((a, i) => JSON.stringify(call[i]) === JSON.stringify(a)));
      if (!found) throw new Error(`Expected ${JSON.stringify(expected)}\nGot: ${JSON.stringify(log)}`);
    },
    notCalled() {
      if (log.length) throw new Error(`Expected 0 calls, got: ${JSON.stringify(log)}`);
    },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Job lifecycle integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.MEDIATOR_PUBLIC_KEY = MEDIATOR;
    authStub.verifySignature = () => true;

    // Reset stubs to happy-path defaults
    jobStub.createJob              = () => Promise.resolve(makeJob("Open"));
    jobStub.acceptJob              = () => Promise.resolve(makeJob("Active"));
    jobStub.confirmDone            = () => Promise.resolve(makeJob("Completed"));
    jobStub.raiseDispute           = () => Promise.resolve(makeJob("Disputed"));
    jobStub.resolveDispute         = () => Promise.resolve(makeJob("Completed"));
    jobStub.deleteJob              = () => Promise.resolve();
    jobStub.setJobState            = () => Promise.resolve();
    jobStub.clearDisputeTimestamp  = () => Promise.resolve();
    jobStub.revertJobCompletion    = () => Promise.resolve();
    jobStub.revertDisputeResolution = () => Promise.resolve();
    jobStub.saveContractTxHash     = () => Promise.resolve();

    sorobanStub.createJob    = () => Promise.resolve(contractOk("create_job",    "txCreate"));
    sorobanStub.acceptJob    = () => Promise.resolve(contractOk("accept_job",    "txAccept"));
    sorobanStub.confirmDone  = () => Promise.resolve(contractOk("confirm_done",  "txConfirm"));
    sorobanStub.raiseDispute = () => Promise.resolve(contractOk("raise_dispute", "txDispute"));
    sorobanStub.resolveDispute = () => Promise.resolve(contractOk("resolve_dispute", "txResolve"));

    app = Fastify({ logger: false });
    await registerJobRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PATH A  —  create → accept → confirm
  // ══════════════════════════════════════════════════════════════════════════

  describe("Path A: create → accept → confirm", () => {
    it("POST /api/jobs — creates a job and calls the contract", async () => {
      const t = makeTracker();
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: "/api/jobs",
        payload: { customer: CUSTOMER, artisan: ARTISAN, amount: "5000000", jobHash: "deadbeef", trade: "plumbing", signature: SIG },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().job.state).toBe("Open");
      expect(res.json().contract.method).toBe("create_job");
      expect(res.json().contract.hash).toBe("txCreate");
      t.calledWith(JOB_ID, "txCreate");
    });

    it("POST /api/jobs/:jobId/accept — accepts and calls the contract", async () => {
      const t = makeTracker();
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/accept`,
        payload: { actor: ARTISAN, signature: SIG },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().job.state).toBe("Active");
      expect(res.json().contract.method).toBe("accept_job");
      t.calledWith(JOB_ID, "txAccept");
    });

    it("POST /api/jobs/:jobId/confirm — confirms completion and calls the contract", async () => {
      const t = makeTracker();
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/confirm`,
        payload: { actor: CUSTOMER, signature: SIG },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().job.state).toBe("Completed");
      expect(res.json().contract.method).toBe("confirm_done");
      t.calledWith(JOB_ID, "txConfirm");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PATH B  —  dispute → resolve (artisan wins)
  // ══════════════════════════════════════════════════════════════════════════

  describe("Path B: dispute → resolve (favour: artisan)", () => {
    it("POST /api/jobs/:jobId/dispute — raises a dispute and calls the contract", async () => {
      const t = makeTracker();
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/dispute`,
        payload: { actor: CUSTOMER, signature: SIG },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().job.state).toBe("Disputed");
      expect(res.json().contract.method).toBe("raise_dispute");
      t.calledWith(JOB_ID, "txDispute");
    });

    it("POST /api/jobs/:jobId/resolve — resolves in favour of artisan → Completed", async () => {
      const resolveArgs: unknown[][] = [];
      const t = makeTracker();
      jobStub.resolveDispute = (...a) => { resolveArgs.push(a); return Promise.resolve(makeJob("Completed")); };
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/resolve`,
        payload: { mediator: MEDIATOR, favour: "artisan", signature: SIG },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().job.state).toBe("Completed");
      expect(res.json().contract.method).toBe("resolve_dispute");
      expect(resolveArgs[0]).toEqual([JOB_ID, "artisan"]);
      t.calledWith(JOB_ID, "txResolve");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PATH C  —  dispute → resolve (customer wins → Refunded)
  // ══════════════════════════════════════════════════════════════════════════

  describe("Path C: resolve in favour of customer (Refunded)", () => {
    it("returns 200 with Refunded state when customer wins", async () => {
      jobStub.resolveDispute = () => Promise.resolve(makeJob("Refunded"));
      const t = makeTracker();
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/resolve`,
        payload: { mediator: MEDIATOR, favour: "customer", signature: SIG },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().job.state).toBe("Refunded");
      t.calledWith(JOB_ID, "txResolve");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CONTRACT ERROR HANDLING
  // ══════════════════════════════════════════════════════════════════════════

  describe("Contract error handling (502 + rollback)", () => {
    it("create_job failure → deletes DB record", async () => {
      sorobanStub.createJob = () => Promise.reject(new Error("Contract execution failed: create_job"));
      const t = makeTracker();
      jobStub.deleteJob = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: "/api/jobs",
        payload: { customer: CUSTOMER, artisan: ARTISAN, amount: "5000000", jobHash: "deadbeef", trade: "plumbing", signature: SIG },
      });

      expect(res.statusCode).toBe(502);
      t.calledWith(JOB_ID);
    });

    it("accept_job failure → reverts state to Open", async () => {
      sorobanStub.acceptJob = () => Promise.reject(new Error("Contract execution failed: accept_job"));
      const t = makeTracker();
      jobStub.setJobState = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/accept`,
        payload: { actor: ARTISAN, signature: SIG },
      });

      expect(res.statusCode).toBe(502);
      t.calledWith(JOB_ID, "Open");
    });

    it("confirm_done failure → reverts job completion", async () => {
      sorobanStub.confirmDone = () => Promise.reject(new Error("Contract execution failed: confirm_done"));
      const t = makeTracker();
      jobStub.revertJobCompletion = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/confirm`,
        payload: { actor: CUSTOMER, signature: SIG },
      });

      expect(res.statusCode).toBe(502);
      t.calledWith(JOB_ID, ARTISAN, "5000000");
    });

    it("raise_dispute failure → clears dispute timestamp", async () => {
      sorobanStub.raiseDispute = () => Promise.reject(new Error("Contract execution failed: raise_dispute"));
      const t = makeTracker();
      jobStub.clearDisputeTimestamp = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/dispute`,
        payload: { actor: CUSTOMER, signature: SIG },
      });

      expect(res.statusCode).toBe(502);
      t.calledWith(JOB_ID);
    });

    it("resolve_dispute failure → reverts dispute resolution", async () => {
      sorobanStub.resolveDispute = () => Promise.reject(new Error("Contract execution failed: resolve_dispute"));
      const t = makeTracker();
      jobStub.revertDisputeResolution = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/resolve`,
        payload: { mediator: MEDIATOR, favour: "artisan", signature: SIG },
      });

      expect(res.statusCode).toBe(502);
      t.calledWith(JOB_ID, ARTISAN, "5000000", "artisan");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SKIPPED_NO_CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  describe("SKIPPED_NO_CONFIG", () => {
    it("returns 201 and does not persist txHash when Soroban is not configured", async () => {
      sorobanStub.createJob = () => Promise.resolve(contractSkipped("create_job"));
      const t = makeTracker();
      jobStub.saveContractTxHash = (...a) => { t.fn(...a); return Promise.resolve(); };

      const res = await app.inject({
        method: "POST", url: "/api/jobs",
        payload: { customer: CUSTOMER, artisan: ARTISAN, amount: "5000000", jobHash: "deadbeef", trade: "plumbing", signature: SIG },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().contract.status).toBe("SKIPPED_NO_CONFIG");
      t.notCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH / VALIDATION ERRORS
  // ══════════════════════════════════════════════════════════════════════════

  describe("Auth and validation guards", () => {
    it("returns 400 on invalid signature for create", async () => {
      authStub.verifySignature = () => false;
      const t = makeTracker();
      jobStub.createJob = (...a) => { t.fn(...a); return Promise.resolve(makeJob("Open")); };

      const res = await app.inject({
        method: "POST", url: "/api/jobs",
        payload: { customer: CUSTOMER, artisan: ARTISAN, amount: "5000000", jobHash: "deadbeef", trade: "plumbing", signature: "badsig" },
      });

      expect(res.statusCode).toBe(400);
      t.notCalled();
    });

    it("returns 400 on invalid signature for accept", async () => {
      authStub.verifySignature = () => false;
      const t = makeTracker();
      jobStub.acceptJob = (...a) => { t.fn(...a); return Promise.resolve(makeJob("Active")); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/accept`,
        payload: { actor: ARTISAN, signature: "badsig" },
      });

      expect(res.statusCode).toBe(400);
      t.notCalled();
    });

    it("returns 400 on invalid signature for confirm", async () => {
      authStub.verifySignature = () => false;
      const t = makeTracker();
      jobStub.confirmDone = (...a) => { t.fn(...a); return Promise.resolve(makeJob("Completed")); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/confirm`,
        payload: { actor: CUSTOMER, signature: "badsig" },
      });

      expect(res.statusCode).toBe(400);
      t.notCalled();
    });

    it("returns 400 on invalid signature for dispute", async () => {
      authStub.verifySignature = () => false;
      const t = makeTracker();
      jobStub.raiseDispute = (...a) => { t.fn(...a); return Promise.resolve(makeJob("Disputed")); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/dispute`,
        payload: { actor: CUSTOMER, signature: "badsig" },
      });

      expect(res.statusCode).toBe(400);
      t.notCalled();
    });

    it("returns 400 when actor is not a valid Stellar public key", async () => {
      const t = makeTracker();
      jobStub.acceptJob = (...a) => { t.fn(...a); return Promise.resolve(makeJob("Active")); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/accept`,
        payload: { actor: "not-a-stellar-key", signature: SIG },
      });

      expect(res.statusCode).toBe(400);
      t.notCalled();
    });

    it("returns 409 when accepting a non-Open job", async () => {
      jobStub.acceptJob = () => Promise.reject(new Error("job must be Open, received Active"));

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/accept`,
        payload: { actor: ARTISAN, signature: SIG },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 409 when confirming a non-Active job", async () => {
      jobStub.confirmDone = () => Promise.reject(new Error("job must be Active, received Open"));

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/confirm`,
        payload: { actor: CUSTOMER, signature: SIG },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 409 when disputing a non-Active job", async () => {
      jobStub.raiseDispute = () => Promise.reject(new Error("job must be Active, received Completed"));

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/dispute`,
        payload: { actor: CUSTOMER, signature: SIG },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 404 when job does not exist", async () => {
      jobStub.acceptJob = () => Promise.reject(new Error("job not found"));

      const res = await app.inject({
        method: "POST", url: "/api/jobs/OWO-MISSING/accept",
        payload: { actor: ARTISAN, signature: SIG },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ENV CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  describe("Environment variable configuration", () => {
    it("uses MEDIATOR_PUBLIC_KEY env var to gate the resolve endpoint", async () => {
      process.env.MEDIATOR_PUBLIC_KEY = "GDIFFERENT0000000000000000000000000000000000000000000000000D";
      const t = makeTracker();
      jobStub.resolveDispute = (...a) => { t.fn(...a); return Promise.resolve(makeJob("Completed")); };

      const res = await app.inject({
        method: "POST", url: `/api/jobs/${JOB_ID}/resolve`,
        payload: { mediator: MEDIATOR, favour: "artisan", signature: SIG },
      });

      expect(res.statusCode).toBe(401);
      t.notCalled();
    });
  });
});
