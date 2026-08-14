/**
 * Tests for POST /api/jobs/:jobId/resolve
 *
 * Covers:
 *  - Successful resolution in favour of artisan
 *  - Successful resolution in favour of customer
 *  - contractTxHash persisted on success
 *  - Rejection when MEDIATOR_PUBLIC_KEY env var is not set
 *  - Rejection when mediator key does not match configured mediator
 *  - Rejection on invalid signature
 *  - Rejection on invalid `favour` value
 *  - Rejection when required fields are missing
 *  - Rejection when mediator is not a valid Stellar public key
 *  - 409 when job is not in Disputed state
 *  - 404 when job does not exist
 *  - Rollback + 502 when the Soroban contract call fails (both favour values)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// ─── Auth stub ───────────────────────────────────────────────────────────────

let _verifySigResult = true;

jest.mock("../utils/auth.js", () => ({
  verifySignature: (..._args: unknown[]) => _verifySigResult,
}));

// ─── Mutable service stubs ────────────────────────────────────────────────────

const jobSvc = {
  resolveDispute: (..._a: unknown[]) => Promise.resolve(null),
  revertDisputeResolution: (..._a: unknown[]) => Promise.resolve(),
  saveContractTxHash: (..._a: unknown[]) => Promise.resolve(),
} as Record<string, (...args: unknown[]) => unknown>;

const sorobanSvc = {
  resolveDispute: (..._a: unknown[]) => Promise.resolve(null),
} as Record<string, (...args: unknown[]) => unknown>;

jest.mock("../db.js", () => ({ default: {} }));

jest.mock("../services/jobs.js", () => ({
  jobService: jobSvc,
}));

jest.mock("../services/soroban.js", () => ({
  sorobanService: sorobanSvc,
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

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerJobRoutes } from "./jobs.js";
import type { JobRecord } from "../types.js";
import type { ContractResult } from "../services/soroban.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MEDIATOR_KEY = "GMEDIATOR0000000000000000000000000000000000000000000000000M";
const ARTISAN      = "GARTISAN00000000000000000000000000000000000000000000000000A";

function disputedJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    jobId: "OWO-TEST01",
    customer: "GCUSTOMER0000000000000000000000000000000000000000000000000C",
    artisan: ARTISAN,
    amount: "1000000",
    state: "Disputed",
    createdAt: new Date().toISOString(),
    disputeAt: new Date().toISOString(),
    jobHash: "abc12345",
    trade: "carpentry",
    ...overrides,
  };
}

function resolvedJob(state: "Completed" | "Refunded"): JobRecord {
  return { ...disputedJob(), state };
}

function contractOk(): ContractResult {
  return { network: "testnet", contractId: "abc", method: "resolve_dispute", hash: "txhash", status: "SUCCESS" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCallTracker() {
  const log: unknown[][] = [];
  return {
    fn: (...args: unknown[]) => { log.push(args); },
    calledWith: (...expected: unknown[]) => {
      const found = log.some((call) =>
        expected.every((arg, i) => JSON.stringify(call[i]) === JSON.stringify(arg)),
      );
      if (!found) throw new Error(`Expected call with ${JSON.stringify(expected)}\nActual: ${JSON.stringify(log)}`);
    },
    notCalled: () => { if (log.length) throw new Error(`Expected no calls but got: ${JSON.stringify(log)}`); },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("POST /api/jobs/:jobId/resolve", () => {
  let app: FastifyInstance;
  const originalMediatorKey = process.env.MEDIATOR_PUBLIC_KEY;

  beforeEach(async () => {
    process.env.MEDIATOR_PUBLIC_KEY = MEDIATOR_KEY;
    _verifySigResult = true;

    // Happy-path defaults
    jobSvc.resolveDispute = () => Promise.resolve(resolvedJob("Completed"));
    jobSvc.revertDisputeResolution = () => Promise.resolve();
    jobSvc.saveContractTxHash = () => Promise.resolve();
    sorobanSvc.resolveDispute = () => Promise.resolve(contractOk());

    app = Fastify({ logger: false });
    await registerJobRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env.MEDIATOR_PUBLIC_KEY = originalMediatorKey;
  });

  // ── Happy paths ──────────────────────────────────────────────────────────

  it("resolves in favour of artisan — 200 with Completed state", async () => {
    const resolveArgs: unknown[][] = [];
    jobSvc.resolveDispute = (...a: unknown[]) => { resolveArgs.push(a); return Promise.resolve(resolvedJob("Completed")); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().job.state).toBe("Completed");
    expect(res.json().contract.method).toBe("resolve_dispute");
    expect(resolveArgs[0]).toEqual(["OWO-TEST01", "artisan"]);
  });

  it("resolves in favour of customer — 200 with Refunded state", async () => {
    jobSvc.resolveDispute = () => Promise.resolve(resolvedJob("Refunded"));

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "customer", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().job.state).toBe("Refunded");
  });

  it("includes contract result (hash, status) in the response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.json().contract).toMatchObject({ method: "resolve_dispute", status: "SUCCESS", hash: "txhash" });
  });

  it("persists contractTxHash after a successful resolution", async () => {
    const tracker = makeCallTracker();
    jobSvc.saveContractTxHash = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(); };

    await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    tracker.calledWith("OWO-TEST01", "txhash");
  });

  // ── Mediator authorization ────────────────────────────────────────────────

  it("returns 401 when MEDIATOR_PUBLIC_KEY env var is not set", async () => {
    delete process.env.MEDIATOR_PUBLIC_KEY;
    const tracker = makeCallTracker();
    jobSvc.resolveDispute = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(resolvedJob("Completed")); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/unauthorized/i);
    tracker.notCalled();
  });

  it("returns 401 when mediator key does not match the configured mediator", async () => {
    const wrongKey = "GWRONG000000000000000000000000000000000000000000000000000W";
    const tracker = makeCallTracker();
    jobSvc.resolveDispute = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(resolvedJob("Completed")); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: wrongKey, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/unauthorized/i);
    tracker.notCalled();
  });

  // ── Signature verification ────────────────────────────────────────────────

  it("returns 400 when the signature is invalid", async () => {
    _verifySigResult = false;
    const tracker = makeCallTracker();
    jobSvc.resolveDispute = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(resolvedJob("Completed")); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "YmFkc2ln" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid signature/i);
    tracker.notCalled();
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 for an invalid favour value", async () => {
    const tracker = makeCallTracker();
    jobSvc.resolveDispute = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(resolvedJob("Completed")); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "nobody", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(400);
    tracker.notCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when mediator is not a valid Stellar public key", async () => {
    const tracker = makeCallTracker();
    jobSvc.resolveDispute = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(resolvedJob("Completed")); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: "not-a-key", favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(400);
    tracker.notCalled();
  });

  // ── Business-rule enforcement ─────────────────────────────────────────────

  it("returns 409 when the job is not in Disputed state", async () => {
    jobSvc.resolveDispute = () => Promise.reject(new Error("job must be Disputed, received Active"));

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("returns 404 when the job does not exist", async () => {
    jobSvc.resolveDispute = () => Promise.reject(new Error("job not found"));

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── Contract rollback on Soroban failure ──────────────────────────────────

  it("returns 502 and rolls back when Soroban fails (favour: artisan)", async () => {
    sorobanSvc.resolveDispute = () => Promise.reject(new Error("Contract execution failed: resolve_dispute"));
    const tracker = makeCallTracker();
    jobSvc.revertDisputeResolution = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "artisan", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(502);
    tracker.calledWith("OWO-TEST01", ARTISAN, "1000000", "artisan");
  });

  it("returns 502 and rolls back when Soroban fails (favour: customer)", async () => {
    jobSvc.resolveDispute = () => Promise.resolve(resolvedJob("Refunded"));
    sorobanSvc.resolveDispute = () => Promise.reject(new Error("Contract execution failed: resolve_dispute"));
    const tracker = makeCallTracker();
    jobSvc.revertDisputeResolution = (...a: unknown[]) => { tracker.fn(...a); return Promise.resolve(); };

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/OWO-TEST01/resolve",
      payload: { mediator: MEDIATOR_KEY, favour: "customer", signature: "dGVzdA==" },
    });

    expect(res.statusCode).toBe(502);
    tracker.calledWith("OWO-TEST01", ARTISAN, "1000000", "customer");
  });
});
