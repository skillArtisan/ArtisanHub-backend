import { randomUUID } from "node:crypto";

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
  private entries: AuditEntry[] = [];
  private readonly MAX_ENTRIES = 10000;

  log(
    action: AuditAction,
    jobId: string,
    actor: string,
    details: Record<string, unknown> = {},
    ipAddress?: string,
    userAgent?: string,
  ) {
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

    this.entries.push(entry);

    // Keep only the last MAX_ENTRIES
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

  getEntries(
    jobId?: string,
    action?: AuditAction,
    limit?: number,
  ): AuditEntry[] {
    let filtered = this.entries;

    if (jobId) {
      filtered = filtered.filter((entry) => entry.jobId === jobId);
    }

    if (action) {
      filtered = filtered.filter((entry) => entry.action === action);
    }

    const result = [...filtered].reverse();

    if (limit) {
      return result.slice(0, limit);
    }

    return result;
  }

  getJobHistory(jobId: string): AuditEntry[] {
    return this.getEntries(jobId);
  }

  clear() {
    this.entries = [];
  }
}

export const auditTrail = new AuditTrailService();
