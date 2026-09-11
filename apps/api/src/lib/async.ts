import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wrap an async route handler / middleware so that rejections are forwarded to
 * the global error handler. Express 4 does not natively catch rejected promises
 * from middleware, so every async handler must go through this wrapper.
 */
export function asyncH(handler: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch((err: unknown): void => {
      next(err);
    });
  };
}
