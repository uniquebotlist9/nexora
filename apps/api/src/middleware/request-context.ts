import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from '@nexora/logger';

/**
 * Assigns a request id (echoed in the X-Request-Id response header and in
 * every error envelope), binds a child logger, and writes a structured access
 * log line when the response finishes.
 *
 * Deliberately runs before body parsing so even malformed-JSON errors carry a
 * request id. Only the path is logged — never the query string — so search
 * terms or accidentally placed tokens never end up in logs.
 */
export function requestContext(logger: Logger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    req.log = logger.child({ requestId });

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      req.log.info(
        {
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        },
        'request completed',
      );
    });

    next();
  };
}
