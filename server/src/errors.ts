import type { NextFunction, Request, Response } from 'express';

/** Error carrying the HTTP status and machine-readable code from SPEC §5. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'validation') =>
  new HttpError(400, code, message);
export const unauthorized = (message = 'This event needs a password') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Your role does not allow that') =>
  new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);

/** Terminal error handler: shapes every failure as `{ error: { code, message } }`. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
