import type { ErrorRequestHandler, RequestHandler } from 'express';
import { errorId, serializeError, type Logger } from '@nexora/logger';
import { AppError, ERROR_CODES } from '../lib/errors';

interface BodyParserError extends SyntaxError {
  status?: number;
  statusCode?: number;
}

/**
 * 404 handler — returns the standard error envelope for unknown routes.
 */
export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res.status(404).json({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`,
        requestId: req.requestId,
      },
    });
  };
}

/**
 * Global error handler. All errors (AppError, zod failures, Prisma errors,
 * unexpected exceptions) funnel through here and are returned as:
 *
 *   { "error": { "code": string, "message": string, "requestId": string } }
 *
 * Unexpected errors get a short `errorId` that is correlated with the
 * structured error log entry, so support can find the exact stack trace
 * without ever exposing it to the client.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, requestId: req.requestId },
      });
      return;
    }

    // Malformed JSON body from express.json.
    const parserErr = err as BodyParserError;
    if (err instanceof SyntaxError && (parserErr.status === 400 || parserErr.statusCode === 400)) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_JSON,
          message: 'Request body is not valid JSON',
          requestId: req.requestId,
        },
      });
      return;
    }

    // Prisma unique-constraint violation -> 409 CONFLICT (e.g. duplicate names).
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({
        error: {
          code: ERROR_CODES.CONFLICT,
          message: 'A resource with this unique value already exists',
          requestId: req.requestId,
        },
      });
      return;
    }

    const log = req.log ?? logger;
    const id = errorId();
    log.error({ err: serializeError(err), errorId: id }, 'Unhandled error');
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `Internal server error (ref: ${id})`,
        requestId: req.requestId,
      },
    });
  };
}
