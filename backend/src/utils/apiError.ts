export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, true, details);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, true);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, true);
  }

  static notFound(message: string = 'Resource not found'): AppError {
    return new AppError(message, 404, true);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, true);
  }

  static internal(message: string = 'Internal server error', details?: unknown): AppError {
    return new AppError(message, 500, false, details);
  }
}
