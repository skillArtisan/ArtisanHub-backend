import { config } from "../config.js";
function preview(method, args) {
    return {
        network: config.soroban.network,
        contractId: config.soroban.contractId || "not-configured",
        method,
        args
    };
}
export const sorobanService = {
    createJob(job) {
        return preview("create_job", {
            jobId: job.jobId,
            customer: job.customer,
            artisan: job.artisan,
            amount: job.amount,
            jobHash: job.jobHash,
            trade: job.trade
        });
    },
    acceptJob(jobId, artisan) {
        return preview("accept_job", { jobId, artisan });
    },
    confirmDone(jobId, customer) {
        return preview("confirm_done", { jobId, customer });
    },
    raiseDispute(jobId, customer) {
        return preview("raise_dispute", { jobId, customer });
    },
    resolveDispute(jobId, mediator, favour) {
        return preview("resolve_dispute", { jobId, mediator, favour });
    }
};
