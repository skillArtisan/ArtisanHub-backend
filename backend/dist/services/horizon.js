import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import db from "../db.js";
// Kept for backwards compatibility but data is now in database
const store = {
    keys: new Map(),
    events: new Map(),
};
function generateIdempotencyKey(jobId, operation) {
    const timestamp = Date.now();
    const random = randomUUID().slice(0, 8);
    return `${jobId}-${operation}-${timestamp}-${random}`;
}
async function isIdempotencyKeyValid(key) {
    const existing = await db("idempotency_keys").where({ key }).first();
    if (!existing)
        return false;
    const now = new Date();
    const expiresAt = new Date(existing.expires_at);
    return now < expiresAt;
}
async function saveIdempotencyKey(idempotencyKey) {
    await db("idempotency_keys").insert({
        key: idempotencyKey.key,
        job_id: idempotencyKey.jobId,
        operation: idempotencyKey.operation,
        created_at: new Date(idempotencyKey.createdAt),
        expires_at: new Date(idempotencyKey.expiresAt),
    }).onConflict("key").ignore();
}
async function saveSettlementEvent(event) {
    await db("settlement_events").insert({
        id: event.id,
        job_id: event.jobId,
        type: event.type,
        amount: event.amount,
        from_address: event.from,
        to_address: event.to,
        transaction_hash: event.transactionHash,
        status: event.status,
        error_message: event.errorMessage,
        created_at: new Date(event.createdAt),
        completed_at: event.completedAt ? new Date(event.completedAt) : null,
    }).onConflict("id").merge();
}
async function updateSettlementEvent(eventId, updates) {
    const dbUpdates = {};
    if (updates.status)
        dbUpdates.status = updates.status;
    if (updates.transactionHash)
        dbUpdates.transaction_hash = updates.transactionHash;
    if (updates.completedAt)
        dbUpdates.completed_at = new Date(updates.completedAt);
    if (updates.errorMessage)
        dbUpdates.error_message = updates.errorMessage;
    await db("settlement_events").where({ id: eventId }).update(dbUpdates);
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
        // Check for existing idempotency key
        const existingKey = await db("idempotency_keys").where({ key }).first();
        if (existingKey && await isIdempotencyKeyValid(key)) {
            const existingEvent = await db("settlement_events")
                .where({ job_id: job.jobId, type: "payout", status: "completed" })
                .first();
            if (existingEvent) {
                return {
                    transaction: {
                        hash: existingEvent.transaction_hash,
                        successful: true,
                        createdAt: existingEvent.completed_at || existingEvent.created_at,
                    },
                    event: {
                        id: existingEvent.id,
                        jobId: existingEvent.job_id,
                        type: existingEvent.type,
                        amount: existingEvent.amount,
                        from: existingEvent.from_address,
                        to: existingEvent.to_address,
                        transactionHash: existingEvent.transaction_hash,
                        status: existingEvent.status,
                        createdAt: new Date(existingEvent.created_at).toISOString(),
                        completedAt: existingEvent.completed_at ? new Date(existingEvent.completed_at).toISOString() : null,
                        errorMessage: existingEvent.error_message,
                    },
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
        await saveSettlementEvent(event);
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
            await updateSettlementEvent(eventId, {
                status: "completed",
                transactionHash: transaction.hash,
                completedAt: transaction.createdAt,
            });
            await saveIdempotencyKey({
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
            event.errorMessage = error instanceof Error ? error.message : "Unknown error";
            await updateSettlementEvent(eventId, {
                status: "failed",
                errorMessage: event.errorMessage,
            });
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
        const existingKey = await db("idempotency_keys").where({ key }).first();
        if (existingKey && await isIdempotencyKeyValid(key)) {
            const existingEvent = await db("settlement_events")
                .where({ job_id: job.jobId, type: "dispute_refund", status: "completed" })
                .first();
            if (existingEvent) {
                return {
                    transaction: {
                        hash: existingEvent.transaction_hash,
                        successful: true,
                        createdAt: existingEvent.completed_at || existingEvent.created_at,
                    },
                    event: {
                        id: existingEvent.id,
                        jobId: existingEvent.job_id,
                        type: existingEvent.type,
                        amount: existingEvent.amount,
                        from: existingEvent.from_address,
                        to: existingEvent.to_address,
                        transactionHash: existingEvent.transaction_hash,
                        status: existingEvent.status,
                        createdAt: new Date(existingEvent.created_at).toISOString(),
                        completedAt: existingEvent.completed_at ? new Date(existingEvent.completed_at).toISOString() : null,
                        errorMessage: existingEvent.error_message,
                    },
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
        await saveSettlementEvent(event);
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
            await updateSettlementEvent(eventId, {
                status: "completed",
                transactionHash: transaction.hash,
                completedAt: transaction.createdAt,
            });
            await saveIdempotencyKey({
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
            event.errorMessage = error instanceof Error ? error.message : "Unknown error";
            await updateSettlementEvent(eventId, {
                status: "failed",
                errorMessage: event.errorMessage,
            });
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
    async getSettlementEvent(eventId) {
        const event = await db("settlement_events").where({ id: eventId }).first();
        if (!event)
            return undefined;
        return {
            id: event.id,
            jobId: event.job_id,
            type: event.type,
            amount: event.amount,
            from: event.from_address,
            to: event.to_address,
            transactionHash: event.transaction_hash,
            status: event.status,
            createdAt: new Date(event.created_at).toISOString(),
            completedAt: event.completed_at ? new Date(event.completed_at).toISOString() : null,
            errorMessage: event.error_message,
        };
    },
    async getSettlementEventsByJob(jobId) {
        const events = await db("settlement_events")
            .where({ job_id: jobId })
            .orderBy("created_at", "desc");
        return events.map(event => ({
            id: event.id,
            jobId: event.job_id,
            type: event.type,
            amount: event.amount,
            from: event.from_address,
            to: event.to_address,
            transactionHash: event.transaction_hash,
            status: event.status,
            createdAt: new Date(event.created_at).toISOString(),
            completedAt: event.completed_at ? new Date(event.completed_at).toISOString() : null,
            errorMessage: event.error_message,
        }));
    },
    async getSettlementEventsByStatus(status) {
        const events = await db("settlement_events")
            .where({ status })
            .orderBy("created_at", "desc");
        return events.map(event => ({
            id: event.id,
            jobId: event.job_id,
            type: event.type,
            amount: event.amount,
            from: event.from_address,
            to: event.to_address,
            transactionHash: event.transaction_hash,
            status: event.status,
            createdAt: new Date(event.created_at).toISOString(),
            completedAt: event.completed_at ? new Date(event.completed_at).toISOString() : null,
            errorMessage: event.error_message,
        }));
    },
    async validateIdempotencyKey(key) {
        return await isIdempotencyKeyValid(key);
    },
    async cleanupExpiredKeys() {
        const now = new Date();
        await db("idempotency_keys").where("expires_at", "<", now).delete();
    },
};
