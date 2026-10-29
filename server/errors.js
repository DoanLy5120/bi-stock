export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new HttpError(400, 'BAD_REQUEST', message);
export const notFound = (message) => new HttpError(404, 'NOT_FOUND', message);
export const internalError = (message) => new HttpError(500, 'INTERNAL_ERROR', message);

/**
 * Response shape kept identical to the Miaoda build so the client helper
 * `getStockErrorMessage` keeps reading `error.message` / `error.fieldErrors`.
 */
export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  req.log?.error?.(`Unhandled error on ${req.method} ${req.originalUrl}: ${error.message}`);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
  });
};

export const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
