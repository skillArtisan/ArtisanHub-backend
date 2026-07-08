import { randomUUID } from "node:crypto";
import type {
  JobRecord,
  JobState,
  Reputation,
  ResolveFavour,
} from "../types.js";
import { horizonService } from "./horizon.js";

type CreateJobInput = {
  customer: string;
  artisan: string;
  amount: string;
  jobHash: string;
  trade: string;
  description?: string;
};

const jobs = new Map<string, JobRecord>();
const reputations = new Map<string, Reputation>();

function assertJobState(job: JobRecord, expected: JobState) {
  if (job.state !== expected) {
    throw new Error(`job must be ${expected}, received ${job.state}`);
  }
}

function getExistingJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error("job not found");
  }

  return job;
}

function updateReputation(artisan: string, amount: string, success: boolean) {
  const current = reputations.get(artisan) ?? {
    artisan,
    completed: 0,
    disputed: 0,
    totalEarned: "0",
  };

  if (success) {
    current.completed += 1;
    current.totalEarned = (
      BigInt(current.totalEarned) + BigInt(amount)
    ).toString();
  } else {
    current.disputed += 1;
  }

  reputations.set(artisan, current);
  return current;
}

export const jobService = {
  listJobs() {
    return Array.from(jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  getJob(jobId: string) {
    return getExistingJob(jobId);
  },

  createJob(input: CreateJobInput) {
    const jobId = `OWO-${randomUUID().slice(0, 8).toUpperCase()}`;
    const job: JobRecord = {
      jobId,
      customer: input.customer,
      artisan: input.artisan,
      amount: input.amount,
      state: "Open",
      createdAt: new Date().toISOString(),
      disputeAt: null,
      jobHash: input.jobHash,
      trade: input.trade,
      description: input.description,
    };

    jobs.set(jobId, job);
    return job;
  },

  acceptJob(jobId: string, artisan: string) {
    const job = getExistingJob(jobId);
    assertJobState(job, "Open");

    if (job.artisan !== artisan) {
      throw new Error("wrong artisan");
    }

    job.state = "Active";
    jobs.set(jobId, job);
    return job;
  },

  async confirmDone(jobId: string, customer: string, idempotencyKey?: string) {
    const job = getExistingJob(jobId);
    assertJobState(job, "Active");

    if (job.customer !== customer) {
      throw new Error("wrong customer");
    }

    job.state = "Completed";
    jobs.set(jobId, job);
    updateReputation(job.artisan, job.amount, true);

    const { event } = await horizonService.processJobCompletionPayout(
      job,
      idempotencyKey,
    );

    return { job, settlementEvent: event };
  },

  raiseDispute(jobId: string, customer: string) {
    const job = getExistingJob(jobId);
    assertJobState(job, "Active");

    if (job.customer !== customer) {
      throw new Error("wrong customer");
    }

    job.state = "Disputed";
    job.disputeAt = new Date().toISOString();
    jobs.set(jobId, job);
    return job;
  },

  async resolveDispute(
    jobId: string,
    favour: ResolveFavour,
    idempotencyKey?: string,
  ) {
    const job = getExistingJob(jobId);
    assertJobState(job, "Disputed");

    if (favour === "artisan") {
      job.state = "Completed";
      updateReputation(job.artisan, job.amount, true);
    } else {
      job.state = "Refunded";
      updateReputation(job.artisan, "0", false);
    }

    jobs.set(jobId, job);

    let settlementEvent;
    if (favour === "customer") {
      const result = await horizonService.processDisputeRefund(
        job,
        idempotencyKey,
      );
      settlementEvent = result.event;
    }

    return { job, settlementEvent };
  },

  getReputation(artisan: string) {
    return (
      reputations.get(artisan) ?? {
        artisan,
        completed: 0,
        disputed: 0,
        totalEarned: "0",
      }
    );
  },
};
