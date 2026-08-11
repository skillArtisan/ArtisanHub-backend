import { randomUUID } from "node:crypto";
import db from "../db.js";
import type { JobRecord, JobState } from "../types.js";

// ============ TYPES ============

export type JobSearchFilters = {
  status?: JobState;
  customer?: string;
  artisan?: string;
  trade?: string;
  minAmount?: string;
  maxAmount?: string;
  createdAfter?: string;
  createdBefore?: string;
  page?: number;
  limit?: number;
  sortBy?: "created" | "amount" | "updated";
  sortOrder?: "asc" | "desc";
};

export type JobHistoryEntry = {
  id: string;
  jobId: string;
  previousState: JobState | null;
  newState: JobState;
  triggeredBy: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  transactionHash: string | null;
  timestamp: string;
  ipAddress: string | null;
  userAgent: string | null;
};

// Valid state transitions
const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  Open: ["Active", "Cancelled"],
  Active: ["Completed", "Disputed", "Cancelled"],
  Completed: ["Disputed"], // Can be disputed after completion
  Disputed: ["Completed", "Refunded"],
  Refunded: [],
  Cancelled: [],
};

// ============ JOB PERSISTENCE SERVICE ============

export const jobPersistenceService = {
  // ============ SEARCH & FILTER ============

  async searchJobs(filters: JobSearchFilters = {}): Promise<{
    jobs: JobRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    let query = db("jobs").select("*").where("jobs.id", "!=", "");

    // Apply filters
    if (filters.status) {
      query = query.where("state", filters.status);
    }

    if (filters.customer) {
      query = query.where("customer", filters.customer);
    }

    if (filters.artisan) {
      query = query.where("artisan", filters.artisan);
    }

    if (filters.trade) {
      query = query.where("trade", "ilike", `%${filters.trade}%`);
    }

    if (filters.minAmount) {
      query = query.where("amount", ">=", filters.minAmount);
    }

    if (filters.maxAmount) {
      query = query.where("amount", "<=", filters.maxAmount);
    }

    if (filters.createdAfter) {
      query = query.where("created_at", ">=", filters.createdAfter);
    }

    if (filters.createdBefore) {
      query = query.where("created_at", "<=", filters.createdBefore);
    }

    // Get total count
    const countResult = await query.clone().count("* as count").first();
    const total = parseInt(countResult?.count || "0", 10);

    // Apply sorting
    const sortBy = filters.sortBy || "created";
    const sortOrder = filters.sortOrder || "desc";

    switch (sortBy) {
      case "created":
        query = query.orderBy("created_at", sortOrder);
        break;
      case "amount":
        query = query.orderBy("amount", sortOrder);
        break;
      case "updated":
        query = query.orderBy("last_status_change", sortOrder);
        break;
      default:
        query = query.orderBy("created_at", "desc");
    }

    query = query.offset(offset).limit(limit);

    const results = await query;

    const jobs: JobRecord[] = results.map(job => ({
      jobId: job.job_id,
      customer: job.customer,
      artisan: job.artisan,
      amount: job.amount,
      state: job.state,
      createdAt: new Date(job.created_at).toISOString(),
      disputeAt: job.dispute_at ? new Date(job.dispute_at).toISOString() : null,
      jobHash: job.job_hash,
      trade: job.trade,
      description: job.description,
      contractTxHash: job.contract_tx_hash,
    }));

    return { jobs, total, page, limit };
  },

  // ============ JOB RETRIEVAL ============

  async getJob(jobId: string): Promise<JobRecord | null> {
    const job = await db("jobs").where({ job_id: jobId }).first();
    if (!job) return null;

    return {
      jobId: job.job_id,
      customer: job.customer,
      artisan: job.artisan,
      amount: job.amount,
      state: job.state,
      createdAt: new Date(job.created_at).toISOString(),
      disputeAt: job.dispute_at ? new Date(job.dispute_at).toISOString() : null,
      jobHash: job.job_hash,
      trade: job.trade,
      description: job.description,
      contractTxHash: job.contract_tx_hash,
    };
  },

  // ============ JOB HISTORY ============

  async getJobHistory(jobId: string, page: number = 1, limit: number = 50): Promise<{
    history: JobHistoryEntry[];
    total: number;
  }> {
    const offset = (page - 1) * limit;

    const countResult = await db("job_history")
      .where({ job_id: jobId })
      .count("* as count")
      .first();

    const total = parseInt(countResult?.count || "0", 10);

    const history = await db("job_history")
      .where({ job_id: jobId })
      .orderBy("timestamp", "desc")
      .offset(offset)
      .limit(limit);

    return {
      history: history.map(h => ({
        id: h.id,
        jobId: h.job_id,
        previousState: h.previous_state,
        newState: h.new_state,
        triggeredBy: h.triggered_by,
        reason: h.reason,
        metadata: h.metadata || {},
        transactionHash: h.transaction_hash,
        timestamp: new Date(h.timestamp).toISOString(),
        ipAddress: h.ip_address,
        userAgent: h.user_agent,
      })),
      total,
    };
  },

  // ============ STATUS TRANSITIONS ============

  async validateTransition(currentState: JobState, newState: JobState): Promise<boolean> {
    const validNextStates = VALID_TRANSITIONS[currentState];
    return validNextStates ? validNextStates.includes(newState) : false;
  }

,

  async transitionJobStatus(
    jobId: string,
    newState: JobState,
    triggeredBy: string,
    reason?: string,
    metadata?: Record<string, unknown>,
    transactionHash?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<JobHistoryEntry> {
    // Get current job
    const job = await db("jobs").where({ job_id: jobId }).first();
    if (!job) {
      throw new Error("Job not found");
    }

    const currentState = job.state;

    // Validate transition
    const isValid = await this.validateTransition(currentState, newState);
    if (!isValid) {
      throw new Error(`Invalid transition from ${currentState} to ${newState}`);
    }

    // Create history entry
    const historyId = randomUUID();
    const now = new Date().toISOString();

    await db("job_history").insert({
      id: historyId,
      job_id: jobId,
      previous_state: currentState,
      new_state: newState,
      triggered_by: triggeredBy,
      reason: reason || null,
      metadata: metadata || {},
      transaction_hash: transactionHash || null,
      timestamp: now,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

    // Update job status
    const updateData: Record<string, unknown> = {
      state: newState,
      last_status_change: now,
    };

    if (newState === "Disputed") {
      updateData.dispute_at = now;
      if (reason) {
        updateData.dispute_reason = reason;
      }
    }

    if (newState === "Cancelled") {
      updateData.cancelled_by = triggeredBy;
      if (reason) {
        updateData.cancellation_reason = reason;
      }
    }

    await db("jobs").where({ job_id: jobId }).update(updateData);

    return {
      id: historyId,
      jobId,
      previousState: currentState,
      newState,
      triggeredBy,
      reason: reason || null,
      metadata: metadata || {},
      transactionHash: transactionHash || null,
      timestamp: now,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    };
  },

  // ============ AUTHORIZATION ============

  async isJobAccessible(jobId: string, userAddress: string): Promise<boolean> {
    const job = await db("jobs").where({ job_id: jobId }).first();
    if (!job) return false;

    return job.customer === userAddress || job.artisan === userAddress;
  },

  async isJobOwner(jobId: string, userAddress: string): Promise<boolean> {
    const job = await db("jobs").where({ job_id: jobId }).first();
    if (!job) return false;

    return job.customer === userAddress;
  },

  async isJobArtisan(jobId: string, artisanAddress: string): Promise<boolean> {
    const job = await db("jobs").where({ job_id: jobId }).first();
    if (!job) return false;

    return job.artisan === artisanAddress;
  },

  // ============ STATISTICS ============

  async getUserJobStats(userAddress: string): Promise<{
    asCustomer: {
      total: number;
      open: number;
      active: number;
      completed: number;
      disputed: number;
      cancelled: number;
    };
    asArtisan: {
      total: number;
      open: number;
      active: number;
      completed: number;
      disputed: number;
      cancelled: number;
    };
  }> {
    // Customer stats
    const customerJobs = await db("jobs").where({ customer: userAddress }).select("state");
    const customerStats = {
      total: customerJobs.length,
      open: customerJobs.filter(j => j.state === "Open").length,
      active: customerJobs.filter(j => j.state === "Active").length,
      completed: customerJobs.filter(j => j.state === "Completed").length,
      disputed: customerJobs.filter(j => j.state === "Disputed").length,
      cancelled: customerJobs.filter(j => j.state === "Cancelled").length,
    };

    // Artisan stats
    const artisanJobs = await db("jobs").where({ artisan: userAddress }).select("state");
    const artisanStats = {
      total: artisanJobs.length,
      open: artisanJobs.filter(j => j.state === "Open").length,
      active: artisanJobs.filter(j => j.state === "Active").length,
      completed: artisanJobs.filter(j => j.state === "Completed").length,
      disputed: artisanJobs.filter(j => j.state === "Disputed").length,
      cancelled: artisanJobs.filter(j => j.state === "Cancelled").length,
    };

    return {
      asCustomer: customerStats,
      asArtisan: artisanStats,
    };
  },

  async getJobsByState(state: JobState, limit: number = 100): Promise<JobRecord[]> {
    const jobs = await db("jobs")
      .where({ state })
      .orderBy("created_at", "desc")
      .limit(limit);

    return jobs.map(job => ({
      jobId: job.job_id,
      customer: job.customer,
      artisan: job.artisan,
      amount: job.amount,
      state: job.state,
      createdAt: new Date(job.created_at).toISOString(),
      disputeAt: job.dispute_at ? new Date(job.dispute_at).toISOString() : null,
      jobHash: job.job_hash,
      trade: job.trade,
      description: job.description,
      contractTxHash: job.contract_tx_hash,
    }));
  },
};
