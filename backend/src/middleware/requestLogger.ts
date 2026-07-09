import type { FastifyRequest, FastifyReply } from "fastify";

interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  statusCode: number;
  responseTime: number;
  requestSize?: number;
  responseSize?: number;
}

const requestLogs: LogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

export function requestLogger() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const requestSize = request.raw.headers["content-length"]
      ? parseInt(request.raw.headers["content-length"] as string)
      : undefined;

    // Log request details
    request.log.info({
      type: "request",
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      requestSize,
    });

    // Capture response
    const originalSend = reply.raw.write;
    let responseSize = 0;

    reply.raw.write = function (chunk: any, encoding?: BufferEncoding) {
      responseSize += Buffer.byteLength(chunk);
      return originalSend.call(this, chunk, encoding);
    };

    // Wait for reply to finish
    reply.raw.on("finish", () => {
      const responseTime = Date.now() - startTime;
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
        statusCode: reply.statusCode,
        responseTime,
        requestSize,
        responseSize,
      };

      requestLogs.push(logEntry);

      // Keep only the last MAX_LOG_ENTRIES
      if (requestLogs.length > MAX_LOG_ENTRIES) {
        requestLogs.shift();
      }

      request.log.info({
        type: "response",
        statusCode: reply.statusCode,
        responseTime,
        responseSize,
      });
    });
  };
}

export function getRequestLogs(limit?: number): LogEntry[] {
  const logs = [...requestLogs].reverse();
  if (limit) {
    return logs.slice(0, limit);
  }
  return logs;
}
