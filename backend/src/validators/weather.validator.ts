/**
 * Module 5: Weather Request Validators
 * Provides Zod validation schemas and Express middlewares for weather routes.
 *
 * Traceability & Attribution:
 * Stores the centroid coordinates used for the weather query, preserving query-location traceability.
 * Model-derived weather data for the farm centroid coordinates.
 * Not an on-site physical weather-station measurement.
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ISO-8601 regex accepting YYYY-MM-DD or full ISO-8601 date-time with optional milliseconds and timezone offset
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const isValidIso8601 = (val: string): boolean => {
  if (!ISO_8601_REGEX.test(val)) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
};

/**
 * Validates :farmId path parameter as a valid UUID
 */
export const farmIdParamForWeatherSchema = z.object({
  farmId: z
    .string({ required_error: 'Farm ID is required' })
    .uuid('Invalid farm ID format. Expected a valid UUID'),
});

/**
 * Validates query parameters for GET /api/v1/farms/:farmId/weather
 * Enforces that:
 * - 'from' exists and is a valid ISO-8601 date/time
 * - 'to' exists and is a valid ISO-8601 date/time
 * - 'from' <= 'to'
 * - 'limit' is an optional positive integer
 */
export const historicalWeatherQuerySchema = z
  .object({
    from: z
      .string({ required_error: "'from' query parameter is required" })
      .min(1, "'from' query parameter cannot be empty")
      .refine(isValidIso8601, {
        message: "'from' must be a valid ISO-8601 date or date-time string",
      }),
    to: z
      .string({ required_error: "'to' query parameter is required" })
      .min(1, "'to' query parameter cannot be empty")
      .refine(isValidIso8601, {
        message: "'to' must be a valid ISO-8601 date or date-time string",
      }),
    limit: z
      .string()
      .optional()
      .refine((val) => !val || (!isNaN(parseInt(val, 10)) && parseInt(val, 10) > 0), {
        message: "'limit' must be a positive integer",
      }),
  })
  .refine(
    (data) => {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return fromDate <= toDate;
    },
    {
      message: "Invalid date range: 'from' must be before or equal to 'to'",
      path: ['from'],
    }
  );

/**
 * Middleware factory for validating req.params against a Zod schema
 */
export const validateParams = (schema: z.ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware factory for validating req.query against a Zod schema
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
};
