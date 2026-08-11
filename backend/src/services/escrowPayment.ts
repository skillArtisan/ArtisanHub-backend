import db from "../db.js";
import type { EscrowState, PaymentEvent, EscrowStatus, PaymentEventType, PaymentIdempotencyKey } from "../types.js";

/**
 * Escrow and Payment Status Service
 * Tracks job escrow states through the complete lifecycle
 * Prevents duplicate operations and maintains audit trail
 */
export const escrowPaymentService = {
  /**
   * Initialize escrow state for a new job
   */
  async initializeEscrow(jobId: string, amountStroops: string, contractTxHash: string): Promise<EscrowState> {
    const now = new Date().toISOString();
    
    const result = await (db as any)("escrow_states")
      .insert({
        job_id: jobId,
        status: "funding_pending",
        contract_tx_hash: contractTxHash,
        amount_stroops: amountStroops,
        created_at: now,
        updated_at: now,
      })
      .returning("*");

    await this.recordPaymentEvent({
      jobId,
      eventType: "funding_initiated",
      status: "completed",
      transactionHash: contractTxHash,
      initiatedBy: "system",
    });

    return this.formatEscrowState(result[0]);
  },

  /**
   * Get current escrow status for a job
   */
  async getEscrowStatus(jobId: string): Promise<EscrowState> {
    const escrow = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .first();

    if (!escrow) {
      throw new Error(`Escrow state not found for job ${jobId}`);
    }

    return this.formatEscrowState(escrow);
  },

  /**
   * Mark funds as locked (contract execution confirmed)
   */
  async markFundsLocked(jobId: string, txHash: string): Promise<EscrowState> {
    // Check for idempotency
    const existingEvent = await (db as any)("payment_events")
      .where({ job_id: jobId, event_type: "funds_locked" })
      .where("status", "completed")
      .first();

    if (existingEvent) {
      await this.recordPaymentEvent({
        jobId,
        eventType: "idempotency_detected",
        status: "completed",
        transactionHash: txHash,
        initiatedBy: "system",
        metadata: { previousTxHash: existingEvent.transaction_hash },
      });
      return this.getEscrowStatus(jobId);
    }

    const now = new Date().toISOString();
    const escrow = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .update({
        status: "funds_locked",
        funding_tx_hash: txHash,
        locked_at: now,
        updated_at: now,
      })
      .returning("*");

    await this.recordPaymentEvent({
      jobId,
      eventType: "funds_locked",
      status: "completed",
      transactionHash: txHash,
      amountStroops: escrow[0].amount_stroops,
      initiatedBy: "system",
    });

    return this.formatEscrowState(escrow[0]);
  },

  /**
   * Initiate fund release (on job completion)
   */
  async initiateRelease(jobId: string, releasedBy: string, ipAddress?: string, userAgent?: string): Promise<EscrowState> {
    // Validate job state
    const escrow = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .first();

    if (!escrow) {
      throw new Error(`Escrow state not found for job ${jobId}`);
    }

    // Can only release from funds_locked or dispute_resolved (favoring artisan)
    if (!["funds_locked", "disputed"].includes(escrow.status)) {
      throw new Error(
        `Cannot initiate release from status: ${escrow.status}. Must be funds_locked or disputed.`
      );
    }

    // Check for idempotency
    const idempotencyKey = `release_${jobId}_${Math.floor(Date.now() / 60000)}`; // 1-minute window
    const existingKey = await this.checkIdempotencyKey(idempotencyKey);
    if (existingKey) {
      await this.recordPaymentEvent({
        jobId,
        eventType: "idempotency_detected",
        status: "completed",
        initiatedBy: releasedBy,
        ipAddress,
        userAgent,
        metadata: { keyContext: "release_initiated" },
      });
      return this.getEscrowStatus(jobId);
    }

    const now = new Date().toISOString();
    const updated = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .update({
        status: "release_pending",
        release_initiated_at: now,
        updated_at: now,
      })
      .returning("*");

    await this.recordIdempotencyKey(idempotencyKey, jobId, "release", {});
    
    await this.recordPaymentEvent({
      jobId,
      eventType: "release_initiated",
      status: "pending",
      amountStroops: escrow.amount_stroops,
      initiatedBy: releasedBy,
      ipAddress,
      userAgent,
    });

    return this.formatEscrowState(updated[0]);
  },

  /**
   * Confirm fund release (payment completed)
   */
  async confirmRelease(jobId: string, txHash: string, ipAddress?: string, userAgent?: string): Promise<EscrowState> {
    // Check for idempotency
    const existingEvent = await (db as any)("payment_events")
      .where({ job_id: jobId, event_type: "released" })
      .where("status", "completed")
      .first();

    if (existingEvent) {
      await this.recordPaymentEvent({
        jobId,
        eventType: "idempotency_detected",
        status: "completed",
        transactionHash: txHash,
        initiatedBy: "system",
        ipAddress,
        userAgent,
        metadata: { previousTxHash: existingEvent.transaction_hash },
      });
      return this.getEscrowStatus(jobId);
    }

    const now = new Date().toISOString();
    const escrow = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .update({
        status: "released",
        release_tx_hash: txHash,
        released_at: now,
        updated_at: now,
      })
      .returning("*");

    await this.recordPaymentEvent({
      jobId,
      eventType: "released",
      status: "completed",
      transactionHash: txHash,
      amountStroops: escrow[0].amount_stroops,
      initiatedBy: "system",
      ipAddress,
      userAgent,
    });

    return this.formatEscrowState(escrow[0]);
  },

  /**
   * Initiate refund (on dispute resolution favoring customer)
   */
  async initiateRefund(jobId: string, reason: string, initiatedBy: string, ipAddress?: string, userAgent?: string): Promise<EscrowState> {
    const escrow = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .first();

    if (!escrow) {
      throw new Error(`Escrow state not found for job ${jobId}`);
    }

    // Can only refund from disputed or release_pending
    if (!["disputed", "release_pending"].includes(escrow.status)) {
      throw new Error(`Cannot refund from status: ${escrow.status}`);
    }

    // Check for idempotency
    const idempotencyKey = `refund_${jobId}_${Math.floor(Date.now() / 60000)}`;
    const existingKey = await this.checkIdempotencyKey(idempotencyKey);
    if (existingKey) {
      await this.recordPaymentEvent({
        jobId,
        eventType: "idempotency_detected",
        status: "completed",
        initiatedBy,
        ipAddress,
        userAgent,
        metadata: { keyContext: "refund_initiated" },
      });
      return this.getEscrowStatus(jobId);
    }

    const now = new Date().toISOString();
    const updated = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .update({
        status: "refunded",
        refunded_at: now,
        updated_at: now,
      })
      .returning("*");

    await this.recordIdempotencyKey(idempotencyKey, jobId, "refund", { reason });

    await this.recordPaymentEvent({
      jobId,
      eventType: "refund_initiated",
      status: "pending",
      amountStroops: escrow.amount_stroops,
      initiatedBy,
      ipAddress,
      userAgent,
      metadata: { reason },
    });

    return this.formatEscrowState(updated[0]);
  },

  /**
   * Mark dispute status
   */
  async markDisputed(jobId: string, ipAddress?: string, userAgent?: string): Promise<EscrowState> {
    const now = new Date().toISOString();
    const escrow = await (db as any)("escrow_states")
      .where({ job_id: jobId })
      .update({
        status: "disputed",
        disputed_at: now,
        updated_at: now,
      })
      .returning("*");

    await this.recordPaymentEvent({
      jobId,
      eventType: "dispute_raised",
      status: "completed",
      initiatedBy: "system",
      ipAddress,
      userAgent,
    });

    return this.formatEscrowState(escrow[0]);
  },

  /**
   * Record a payment event for audit trail
   */
  async recordPaymentEvent(event: {
    jobId: string;
    eventType: PaymentEventType;
    status: "pending" | "completed" | "failed";
    transactionHash?: string | null;
    fromWallet?: string | null;
    toWallet?: string | null;
    amountStroops?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, any> | null;
    initiatedBy: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<PaymentEvent> {
    const now = new Date().toISOString();
    const result = await (db as any)("payment_events")
      .insert({
        job_id: event.jobId,
        event_type: event.eventType,
        status: event.status,
        transaction_hash: event.transactionHash || null,
        from_wallet: event.fromWallet || null,
        to_wallet: event.toWallet || null,
        amount_stroops: event.amountStroops || null,
        error_message: event.errorMessage || null,
        metadata: event.metadata || null,
        initiated_by: event.initiatedBy,
        ip_address: event.ipAddress || null,
        user_agent: event.userAgent || null,
        created_at: now,
        updated_at: now,
      })
      .returning("*");

    return this.formatPaymentEvent(result[0]);
  },

  /**
   * Get payment history for a job
   */
  async getPaymentHistory(jobId: string, limit = 50, offset = 0): Promise<PaymentEvent[]> {
    const events = await (db as any)("payment_events")
      .where({ job_id: jobId })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    return events.map((e: any) => this.formatPaymentEvent(e));
  },

  /**
   * Create idempotency key to prevent duplicate operations
   */
  async recordIdempotencyKey(
    key: string,
    jobId: string,
    operation: "fund" | "lock" | "release" | "refund" | "dispute" | "resolve",
    requestPayload: Record<string, any>,
    responsePayload?: Record<string, any>
  ): Promise<PaymentIdempotencyKey> {
    const now = new Date().toISOString();
    // Expire after 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await (db as any)("payment_idempotency_keys")
      .insert({
        key,
        job_id: jobId,
        operation,
        request_payload: requestPayload,
        response_payload: responsePayload || null,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      })
      .returning("*");

    return this.formatIdempotencyKey(result[0]);
  },

  /**
   * Check if operation already processed (idempotency)
   */
  async checkIdempotencyKey(key: string): Promise<PaymentIdempotencyKey | null> {
    const now = new Date().toISOString();
    const result = await (db as any)("payment_idempotency_keys")
      .where({ key })
      .where("expires_at", ">", now)
      .first();

    return result ? this.formatIdempotencyKey(result) : null;
  },

  /**
   * Get all escrow states (admin/monitoring)
   */
  async getAllEscrowStates(status?: EscrowStatus, limit = 100, offset = 0): Promise<EscrowState[]> {
    let query = (db as any)("escrow_states");
    
    if (status) {
      query = query.where({ status });
    }

    const states = await query
      .orderBy("updated_at", "desc")
      .limit(limit)
      .offset(offset);

    return states.map((s: any) => this.formatEscrowState(s));
  },

  /**
   * Get payment statistics for monitoring
   */
  async getPaymentStatistics(): Promise<{
    totalFunded: number;
    totalLocked: number;
    totalReleased: number;
    totalRefunded: number;
    totalDisputed: number;
    pendingActions: number;
    failedOperations: number;
  }> {
    const statuses = await (db as any)("escrow_states")
      .select("status")
      .count("* as count")
      .groupBy("status");

    const statusMap: Record<string, number> = {};
    statuses.forEach((s: any) => {
      statusMap[s.status] = Number(s.count);
    });

    const failedEvents = await (db as any)("payment_events")
      .where({ status: "failed" })
      .count("* as count")
      .first();

    const pendingEvents = await (db as any)("payment_events")
      .where({ status: "pending" })
      .count("* as count")
      .first();

    return {
      totalFunded: statusMap["funding_pending"] || 0,
      totalLocked: statusMap["funds_locked"] || 0,
      totalReleased: statusMap["released"] || 0,
      totalRefunded: statusMap["refunded"] || 0,
      totalDisputed: statusMap["disputed"] || 0,
      pendingActions: Number(pendingEvents?.count) || 0,
      failedOperations: Number(failedEvents?.count) || 0,
    };
  },

  /**
   * Handle failed transaction gracefully
   */
  async handleTransactionFailure(
    jobId: string,
    txHash: string,
    errorMessage: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PaymentEvent> {
    return this.recordPaymentEvent({
      jobId,
      eventType: "transaction_failed",
      status: "failed",
      transactionHash: txHash,
      errorMessage,
      initiatedBy: "system",
      ipAddress,
      userAgent,
    });
  },

  formatEscrowState(raw: any): EscrowState {
    return {
      jobId: raw.job_id,
      status: raw.status,
      contractTxHash: raw.contract_tx_hash,
      fundingTxHash: raw.funding_tx_hash,
      releaseTxHash: raw.release_tx_hash,
      refundTxHash: raw.refund_tx_hash,
      amountStroops: raw.amount_stroops,
      fundedAt: raw.funded_at,
      lockedAt: raw.locked_at,
      releaseInitiatedAt: raw.release_initiated_at,
      releasedAt: raw.released_at,
      refundedAt: raw.refunded_at,
      disputedAt: raw.disputed_at,
      contractResponse: raw.contract_response,
      errorMessage: raw.error_message,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  },

  formatPaymentEvent(raw: any): PaymentEvent {
    return {
      id: raw.id,
      jobId: raw.job_id,
      eventType: raw.event_type,
      status: raw.status,
      transactionHash: raw.transaction_hash,
      fromWallet: raw.from_wallet,
      toWallet: raw.to_wallet,
      amountStroops: raw.amount_stroops,
      metadata: raw.metadata,
      errorMessage: raw.error_message,
      initiatedBy: raw.initiated_by,
      ipAddress: raw.ip_address,
      userAgent: raw.user_agent,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  },

  formatIdempotencyKey(raw: any): PaymentIdempotencyKey {
    return {
      key: raw.key,
      jobId: raw.job_id,
      operation: raw.operation,
      requestPayload: raw.request_payload,
      responsePayload: raw.response_payload,
      expiresAt: raw.expires_at,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  },
};
