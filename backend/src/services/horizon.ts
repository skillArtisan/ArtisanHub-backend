import { randomUUID } from "node:crypto";
import type {
  JobRecord,
  SettlementEvent,
  SettlementEventType,
  IdempotencyKey,
} from "../types.js";
import { config } from "../config.js";

type HorizonAccount = {
  accountId: string;
  sequence: string;
  balances: Array<{ asset_type: string; balance: string }>;
};

type HorizonTransaction = {
  hash: string;
  successful: boolean;
  createdAt: string;
};

type PaymentOperation = {
  type: "payment" | "path_payment_strict_receive";
  from: string;
  to: string;
  amount: string;
  asset_type: "native" | "credit_alphanum4" | "credit_alphanum12";
  asset_code?: string;
  asset_issuer?: string;
};

type IdempotencyStore = {
  keys: Map<string, IdempotencyKey>;
  events: Map<string, SettlementEvent>;
};

const store: IdempotencyStore = {
  keys: new Map(),
  events: new Map(),
};

function generateIdempotencyKey(jobId: string, operation: string): string {
  const timestamp = Date.now();
  const random = randomUUID().slice(0, 8);
  return `${jobId}-${operation}-${timestamp}-${random}`;
}

function isIdempotencyKeyValid(key: IdempotencyKey): boolean {
  const now = new Date();
  const expiresAt = new Date(key.expiresAt);
  return now < expiresAt;
}

async function fetchHorizonAccount(publicKey: string): Promise<HorizonAccount> {
  const horizonUrl = config.soroban.horizonUrl;
  const response = await fetch(`${horizonUrl}/accounts/${publicKey}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch account: ${response.statusText}`);
  }

  return await response.json();
}

async function submitHorizonTransaction(
  transactionXdr: string,
  idempotencyKey: string,
): Promise<HorizonTransaction> {
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

function buildPaymentTransaction(
  sourceAccount: HorizonAccount,
  operation: PaymentOperation,
  memo?: string,
): string {
  const sequence = BigInt(sourceAccount.sequence) + 1n;

  const paymentOp: any = {
    type: operation.type,
    source: sourceAccount.accountId,
    destination: operation.to,
    asset:
      operation.asset_type === "native"
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
  async processJobCompletionPayout(
    job: JobRecord,
    idempotencyKey?: string,
  ): Promise<{ transaction: HorizonTransaction; event: SettlementEvent }> {
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
    const event: SettlementEvent = {
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
      const transactionXdr = buildPaymentTransaction(
        customerAccount,
        {
          type: "payment",
          from: job.customer,
          to: job.artisan,
          amount: job.amount,
          asset_type: "native",
        },
        `Job completion payout: ${job.jobId}`,
      );

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
    } catch (error) {
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

  async processDisputeRefund(
    job: JobRecord,
    idempotencyKey?: string,
  ): Promise<{ transaction: HorizonTransaction; event: SettlementEvent }> {
    const operation = "dispute_refund";
    const key = idempotencyKey || generateIdempotencyKey(job.jobId, operation);

    const existingKey = store.keys.get(key);
    if (existingKey && isIdempotencyKeyValid(existingKey)) {
      const existingEvent = Array.from(store.events.values()).find(
        (e) =>
          e.jobId === job.jobId &&
          e.type === "dispute_refund" &&
          e.status === "completed",
      );
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
    const event: SettlementEvent = {
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
      const transactionXdr = buildPaymentTransaction(
        artisanAccount,
        {
          type: "payment",
          from: job.artisan,
          to: job.customer,
          amount: job.amount,
          asset_type: "native",
        },
        `Dispute refund: ${job.jobId}`,
      );

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
    } catch (error) {
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

  getSettlementEvent(eventId: string): SettlementEvent | undefined {
    return store.events.get(eventId);
  },

  getSettlementEventsByJob(jobId: string): SettlementEvent[] {
    return Array.from(store.events.values()).filter(
      (event) => event.jobId === jobId,
    );
  },

  getSettlementEventsByStatus(
    status: "pending" | "completed" | "failed",
  ): SettlementEvent[] {
    return Array.from(store.events.values()).filter(
      (event) => event.status === status,
    );
  },

  validateIdempotencyKey(key: string): boolean {
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
