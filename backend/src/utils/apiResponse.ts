import { ApiResponseEnvelope } from '../types/api.types.js';

export class ApiResponse {
  static success<T>(data?: T, message: string = 'Success', correlationId?: string): ApiResponseEnvelope<T> {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    };
  }

  static error(message: string, correlationId?: string): ApiResponseEnvelope<null> {
    return {
      success: false,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    };
  }
}
