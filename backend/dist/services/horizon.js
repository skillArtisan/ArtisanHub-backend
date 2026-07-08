import { randomUUID } from "node:crypto";
import { config } from "../config.js";
const store = {
    keys: new Map(),
    events: new Map(),
};
function generateIdempotencyKey(jobId, operation) {
    const timestamp = Date.now();
    const random = randomUUID().slice(0, 8);
    return `${jobId}-${operation}-${timestamp}-${random}`;
}
function isIdempotencyKeyValid(key) {
    const now = new Date();
    const expiresAt = new Date(key.expiresAt);
    return now < expiresAt;
}
async function fetchHorizonAccount(publicKey) {
    const horizonUrl = config.soroban.horizonUrl;
    const response = await fetch(`${horizonUrl}/accounts/${publicKey}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch account: ${response.statusText}`);
    }
    return await response.json();
}
async function submitHorizonTransaction(transactionXdr, idempotencyKey) {
    const horizonUrl = config.soroban.horizonUrl;
    const response = await fetch(`${horizonUrl}/transactions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            tx: transactionXdr,
        }).toString(),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Transaction failed: ${error}`);
    }
    const result = await response.json();
    return {
        hash: result.hash,
        successful: true,
        createdAt: new Date().toISOString(),
    };
}
function buildPaymentTransaction(sourceAccount, operation, memo) {
    const sequence = BigInt(sourceAccount.sequence) + 1n;
    const paymentOp = {
        type: operation.type,
        source: sourceAccount.accountId,
        destination: operation.to,
        asset: operation.asset_type === "native"
            ? { type: "native" }
            : {
                type: "credit_alphanum4",
                asset_code: operation.asset_code,
                asset_issuer: operation.asset_issuer,
            },
        amount: operation.amount,
    };
    const transactionEnvelope = {
        tx: {
            source_account: sourceAccount.accountId,
            fee: 100,
            seq: sequence.toString(),
            memo: memo ? { type: "text", value: memo } : undefined,
            operations: [paymentOp],
            time_bounds: {
                min_time: 0,
                max_time: Math.floor(Date.now() / 1000) + 300,
            },
        },
    };
    return JSON.stringify(transactionEnvelope);
}
export const horizonService = {
    async processJobCompletionPayout(job, idempotencyKey) {
        const operation = "job_completion_payout";
        const key = idempotencyKey || generateIdempotencyKey(job.jobId, operation);
        const existingKey = store.keys.get(key);
        if (existingKey && isIdempotencyKeyValid(existingKey)) {
            const existingEvent = store.events.get(existingKey.jobId);
            if (existingEvent && existingEvent.status === "completed") {
                return {
                    transaction: {
                        hash: existingEvent.transactionHash,
                        successful: true,
                        createdAt: existingEvent.completedAt || existingEvent.createdAt,
                    },
                    event: existingEvent,
                };
            }
        }
        const eventId = randomUUID();
        const event = {
            id: eventId,
            jobId: job.jobId,
            type: "payout",
            amount: job.amount,
            from: job.customer,
            to: job.artisan,
            transactionHash: "",
            status: "pending",
            createdAt: new Date().toISOString(),
            completedAt: null,
        };
        store.events.set(eventId, event);
        try {
            const customerAccount = await fetchHorizonAccount(job.customer);
            const transactionXdr = buildPaymentTransaction(customerAccount, {
                type: "payment",
                from: job.customer,
                to: job.artisan,
                amount: job.amount,
                asset_type: "native",
            }, `Job completion payout: ${job.jobId}`);
            const transaction = await submitHorizonTransaction(transactionXdr, key);
            event.status = "completed";
            event.transactionHash = transaction.hash;
            event.completedAt = transaction.createdAt;
            store.keys.set(key, {
                key,
                jobId: job.jobId,
                operation,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
            return { transaction, event };
        }
        catch (error) {
            event.status = "failed";
            event.errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            // Don't throw - allow job state to be updated even if payment fails
            return {
                transaction: {
                    hash: "",
                    successful: false,
                    createdAt: new Date().toISOString(),
                },
                event,
            };
        }
    },
    async processDisputeRefund(job, idempotencyKey) {
        const operation = "dispute_refund";
        const key = idempotencyKey || generateIdempotencyKey(job.jobId, operation);
        const existingKey = store.keys.get(key);
        if (existingKey && isIdempotencyKeyValid(existingKey)) {
            const existingEvent = Array.from(store.events.values()).find((e) => e.jobId === job.jobId &&
                e.type === "dispute_refund" &&
                e.status === "completed");
            if (existingEvent) {
                return {
                    transaction: {
                        hash: existingEvent.transactionHash,
                        successful: true,
                        createdAt: existingEvent.completedAt || existingEvent.createdAt,
                    },
                    event: existingEvent,
                };
            }
        }
        const eventId = randomUUID();
        const event = {
            id: eventId,
            jobId: job.jobId,
            type: "dispute_refund",
            amount: job.amount,
            from: job.artisan,
            to: job.customer,
            transactionHash: "",
            status: "pending",
            createdAt: new Date().toISOString(),
            completedAt: null,
        };
        store.events.set(eventId, event);
        try {
            const artisanAccount = await fetchHorizonAccount(job.artisan);
            const transactionXdr = buildPaymentTransaction(artisanAccount, {
                type: "payment",
                from: job.artisan,
                to: job.customer,
                amount: job.amount,
                asset_type: "native",
            }, `Dispute refund: ${job.jobId}`);
            const transaction = await submitHorizonTransaction(transactionXdr, key);
            event.status = "completed";
            event.transactionHash = transaction.hash;
            event.completedAt = transaction.createdAt;
            store.keys.set(key, {
                key,
                jobId: job.jobId,
                operation,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
            return { transaction, event };
        }
        catch (error) {
            event.status = "failed";
            event.errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            // Don't throw - allow job state to be updated even if payment fails
            return {
                transaction: {
                    hash: "",
                    successful: false,
                    createdAt: new Date().toISOString(),
                },
                event,
            };
        }
    },
    getSettlementEvent(eventId) {
        return store.events.get(eventId);
    },
    getSettlementEventsByJob(jobId) {
        return Array.from(store.events.values()).filter((event) => event.jobId === jobId);
    },
    getSettlementEventsByStatus(status) {
        return Array.from(store.events.values()).filter((event) => event.status === status);
    },
    validateIdempotencyKey(key) {
        const existingKey = store.keys.get(key);
        if (!existingKey) {
            return false;
        }
        return isIdempotencyKeyValid(existingKey);
    },
    cleanupExpiredKeys() {
        const now = new Date();
        for (const [key, idempotencyKey] of store.keys.entries()) {
            if (new Date(idempotencyKey.expiresAt) < now) {
                store.keys.delete(key);
            }
        }
    },
};
