import { config } from "../config.js";
import type { JobRecord, ResolveFavour } from "../types.js";

export type ContractInvocationPreview = {
  network: string;
  contractId: string;
  method: string;
  args: Record<string, string>;
};

function preview(method: string, args: Record<string, string>): ContractInvocationPreview {
  return {
    network: config.soroban.network,
    contractId: config.soroban.contractId || "not-configured",
    method,
    args
  };
}

export const sorobanService = {
  createJob(job: JobRecord) {
    return preview("create_job", {
      jobId: job.jobId,
      customer: job.customer,
      artisan: job.artisan,
      amount: job.amount,
      jobHash: job.jobHash,
      trade: job.trade
    });
  },

  acceptJob(jobId: string, artisan: string) {
    return preview("accept_job", { jobId, artisan });
  },

  confirmDone(jobId: string, customer: string) {
    return preview("confirm_done", { jobId, customer });
  },

  raiseDispute(jobId: string, customer: string) {
    return preview("raise_dispute", { jobId, customer });
  },

  resolveDispute(jobId: string, mediator: string, favour: ResolveFavour) {
    return preview("resolve_dispute", { jobId, mediator, favour });
  }
};
