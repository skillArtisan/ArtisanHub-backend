import { randomUUID } from "node:crypto";
import db from "../db.js";
import type { JobRecord, JobState, Reputation, ResolveFavour } from "../types.js";

type CreateJobInput = {
  customer: string;
  artisan: string;
  amount: string;
  jobHash: string;
  trade: string;
  description?: string;
};

function assertJobState(job: JobRecord, expected: JobState) {
  if (job.state !== expected) {
    throw new Error(`job must be ${expected}, received ${job.state}`);
  }
}

async function getExistingJob(jobId: string): Promise<JobRecord> {
  const job = await db("jobs").where({ job_id: jobId }).first();
  if (!job) {
    throw new Error("job not found");
  }

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
    contractTxHash: job.contract_tx_hash
  };
}

async function ensureArtisan(artisan: string) {
  const existing = await db("artisans").where({ id: artisan }).first();
  if (!existing) {
    await db("artisans").insert({ id: artisan }).onConflict("id").ignore();
  }
}

async function updateReputation(artisan: string, amount: string, success: boolean) {
  await ensureArtisan(artisan);
  
  const current = await db("reputations").where({ artisan }).first();
  const currentRep = current ?? {
    artisan,
    completed: 0,
    disputed: 0,
    total_earned: "0"
  };

  if (success) {
    currentRep.completed += 1;
    currentRep.total_earned = (BigInt(currentRep.total_earned) + BigInt(amount)).toString();
  } else {
    currentRep.disputed += 1;
  }

  await db("reputations").insert({
    artisan,
    completed: currentRep.completed,
    disputed: currentRep.disputed,
    total_earned: currentRep.total_earned
  }).onConflict("artisan").merge();

  return {
    artisan: currentRep.artisan,
    completed: currentRep.completed,
    disputed: currentRep.disputed,
    totalEarned: currentRep.total_earned
  };
}

export const jobService = {
  async listJobs(): Promise<JobRecord[]> {
    const jobs = await db("jobs").orderBy("created_at", "desc");
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
      contractTxHash: job.contract_tx_hash
    }));
  },

  async getJob(jobId: string): Promise<JobRecord> {
    return getExistingJob(jobId);
  },

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    await ensureArtisan(input.artisan);
    
    const jobId = `OWO-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();
    
    await db("jobs").insert({
      job_id: jobId,
      customer: input.customer,
      artisan: input.artisan,
      amount: input.amount,
      state: "Open",
      created_at: now,
      job_hash: input.jobHash,
      trade: input.trade,
      description: input.description
    });

    return {
      jobId,
      customer: input.customer,
      artisan: input.artisan,
      amount: input.amount,
      state: "Open",
      createdAt: now.toISOString(),
      disputeAt: null,
      jobHash: input.jobHash,
      trade: input.trade,
      description: input.description
    };
  },

  async acceptJob(jobId: string, artisan: string): Promise<JobRecord> {
    const job = await getExistingJob(jobId);
    assertJobState(job, "Open");

    if (job.artisan !== artisan) {
      throw new Error("wrong artisan");
    }

    await db("jobs").where({ job_id: jobId }).update({ state: "Active" });
    job.state = "Active";
    return job;
  },

  async confirmDone(jobId: string, customer: string): Promise<JobRecord> {
    const job = await getExistingJob(jobId);
    assertJobState(job, "Active");

    if (job.customer !== customer) {
      throw new Error("wrong customer");
    }

    await db("jobs").where({ job_id: jobId }).update({ state: "Completed" });
    job.state = "Completed";
    
    await updateReputation(job.artisan, job.amount, true);
    return job;
  },

  async raiseDispute(jobId: string, customer: string): Promise<JobRecord> {
    const job = await getExistingJob(jobId);
    assertJobState(job, "Active");

    if (job.customer !== customer) {
      throw new Error("wrong customer");
    }

    const now = new Date();
    await db("jobs").where({ job_id: jobId }).update({ 
      state: "Disputed",
      dispute_at: now
    });
    
    job.state = "Disputed";
    job.disputeAt = now.toISOString();
    return job;
  },

  async resolveDispute(jobId: string, favour: ResolveFavour): Promise<JobRecord> {
    const job = await getExistingJob(jobId);
    assertJobState(job, "Disputed");

    if (favour === "artisan") {
      await db("jobs").where({ job_id: jobId }).update({ state: "Completed" });
      job.state = "Completed";
      await updateReputation(job.artisan, job.amount, true);
    } else {
      await db("jobs").where({ job_id: jobId }).update({ state: "Refunded" });
      job.state = "Refunded";
      await updateReputation(job.artisan, "0", false);
    }

    return job;
  },

  async getReputation(artisan: string): Promise<Reputation> {
    const current = await db("reputations").where({ artisan }).first();
    
    if (!current) {
      return {
        artisan,
        completed: 0,
        disputed: 0,
        totalEarned: "0"
      };
    }
    
    return {
      artisan: current.artisan,
      completed: current.completed,
      disputed: current.disputed,
      totalEarned: current.total_earned
    };
  },

  async deleteJob(jobId: string) {
    await db("jobs").where({ job_id: jobId }).delete();
  },

  async setJobState(jobId: string, state: JobState) {
    await db("jobs").where({ job_id: jobId }).update({ state });
  },

  async revertReputation(artisan: string, amount: string, wasSuccess: boolean) {
    const current = await db("reputations").where({ artisan }).first();
    if (!current) return;

    if (wasSuccess) {
      current.completed = Math.max(0, current.completed - 1);
      current.total_earned = (BigInt(current.total_earned) - BigInt(amount)).toString();
    } else {
      current.disputed = Math.max(0, current.disputed - 1);
    }

    await db("reputations").where({ artisan }).update({
      completed: current.completed,
      disputed: current.disputed,
      total_earned: current.total_earned
    });
  }
};
