import pino, { type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

/**
 * Structured JSON logging in production, pretty console output in development.
 * Child loggers bind context (guildId, requestId, shard, ...) automatically.
 */
export function createLogger(name: string, context: Record<string, unknown> = {}): Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');
  return pino({
    name,
    level,
    base: { service: name },
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,service' },
          },
        }
      : {
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: { level: (label) => ({ level: label }) },
        }),
    ...context,
  });
}

/**
 * Attach stable, short error IDs so user-facing messages can reference a log
 * entry without leaking stack traces.
 */
export function errorId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function serializeError(err: unknown): { message: string; stack?: string; code?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, code: (err as { code?: string }).code };
  }
  return { message: String(err) };
}
