import { pino } from 'pino';
import type { Logger, LoggerOptions } from 'pino';

export type { Logger };

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Opções compartilhadas pela API (Fastify) e pelo worker: JSON estruturado em stdout. */
export function loggerOptions(service: string, level: LogLevel): LoggerOptions {
  return {
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };
}

export function createLogger(service: string, level: LogLevel): Logger {
  return pino(loggerOptions(service, level));
}
