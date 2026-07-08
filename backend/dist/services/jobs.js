import { randomUUID } from "node:crypto";
import { horizonService } from "./horizon.js";
const jobs = new Map();
const reputations = new Map();
function assertJobState(job, expected) {
    if (job.state !== expected) {
        throw new Error(`job must be ${expected}, received ${job.state}`);
    }
}
function getExistingJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) {
        throw new Error("job not found");
    }
    return job;
}
function updateReputation(artisan, amount, success) {
    const current = reputations.get(artisan) ?? {
        artisan,
        completed: 0,
        disputed: 0,
        totalEarned: "0",
    };
    if (success) {
        current.completed += 1;
        current.totalEarned = (BigInt(current.totalEarned) + BigInt(amount)).toString();
    }
    else {
        current.disputed += 1;
    }
    reputations.set(artisan, current);
    return current;
}
export const jobService = {
    listJobs() {
        return Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getJob(jobId) {
        return getExistingJob(jobId);
    },
    createJob(input) {
        const jobId = `OWO-${randomUUID().slice(0, 8).toUpperCase()}`;
        const job = {
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
    acceptJob(jobId, artisan) {
        const job = getExistingJob(jobId);
        assertJobState(job, "Open");
        if (job.artisan !== artisan) {
            throw new Error("wrong artisan");
        }
        job.state = "Active";
        jobs.set(jobId, job);
        return job;
    },
    async confirmDone(jobId, customer, idempotencyKey) {
        const job = getExistingJob(jobId);
        assertJobState(job, "Active");
        if (job.customer !== customer) {
            throw new Error("wrong customer");
        }
        job.state = "Completed";
        jobs.set(jobId, job);
        updateReputation(job.artisan, job.amount, true);
        const { event } = await horizonService.processJobCompletionPayout(job, idempotencyKey);
        return { job, settlementEvent: event };
    },
    raiseDispute(jobId, customer) {
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
    async resolveDispute(jobId, favour, idempotencyKey) {
        const job = getExistingJob(jobId);
        assertJobState(job, "Disputed");
        if (favour === "artisan") {
            job.state = "Completed";
            updateReputation(job.artisan, job.amount, true);
        }
        else {
            job.state = "Refunded";
            updateReputation(job.artisan, "0", false);
        }
        jobs.set(jobId, job);
        let settlementEvent;
        if (favour === "customer") {
            const result = await horizonService.processDisputeRefund(job, idempotencyKey);
            settlementEvent = result.event;
        }
        return { job, settlementEvent };
    },
    getReputation(artisan) {
        return (reputations.get(artisan) ?? {
            artisan,
            completed: 0,
            disputed: 0,
            totalEarned: "0",
        });
    },
};
