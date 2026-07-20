import { randomUUID } from "node:crypto";
import db from "../db.js";

export type AuditAction =
  | "job_created"
  | "job_accepted"
  | "job_confirmed"
  | "dispute_raised"
  | "dispute_resolved"
  | "job_updated";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  jobId: string;
  actor: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditTrailService {
  private entries: AuditEntry[] = []; // Kept for backwards compatibility
  private readonly MAX_ENTRIES = 10000;

  async log(
    action: AuditAction,
    jobId: string,
    actor: string,
    details: Record<string, unknown> = {},
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      jobId,
      actor,
      details,
      ipAddress,
      userAgent,
    };

    // Persist to database
    await db("audit_entries").insert({
      id: entry.id,
      timestamp: new Date(entry.timestamp),
      action: entry.action,
      job_id: entry.jobId,
      actor: entry.actor,
      details: JSON.stringify(entry.details),
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
    });

    // Keep in memory for backwards compatibility
    this.entries.push(entry);
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries.shift();
    }

    console.log(
      `[AUDIT] ${entry.timestamp} | ${action} | Job: ${jobId} | Actor: ${actor}`,
      {
        details,
        ipAddress,
      },
    );

    return entry;
  }

  async getEntries(
    jobId?: string,
    action?: AuditAction,
    limit?: number,
  ): Promise<AuditEntry[]> {
    let query = db("audit_entries").orderBy("timestamp", "desc");

    if (jobId) {
      query = query.where({ job_id: jobId });
    }

    if (action) {
      query = query.where({ action });
    }

    if (limit) {
      query = query.limit(limit);
    }

    const entries = await query;
    
    return entries.map(entry => ({
      id: entry.id,
      timestamp: new Date(entry.timestamp).toISOString(),
      action: entry.action,
      jobId: entry.job_id,
      actor: entry.actor,
      details: typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details,
      ipAddress: entry.ip_address,
      userAgent: entry.user_agent,
    }));
  }

  async getJobHistory(jobId: string): Promise<AuditEntry[]> {
    return this.getEntries(jobId);
  }

  async clear(): Promise<void> {
    await db("audit_entries").delete();
    this.entries = [];
  }
}

export const auditTrail = new AuditTrailService();
