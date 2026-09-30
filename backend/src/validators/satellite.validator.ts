/**
 * Module 7: Satellite & NDVI Request Validators
 * Provides Zod validation schemas, domain validation functions, and Express middlewares.
 *
 * Rules:
 * - NDVI numeric range: [-1.0, 1.0] (reject out-of-range values; do NOT silently clamp)
 * - Cloud coverage: [0.0, 100.0]%
 * - Valid pixel percentage: [0.0, 100.0]%
 * - Invariant: minNdvi <= meanNdvi <= maxNdvi
 * - Required provider/source metadata: provider, satellite, productType, productId
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiError.js';
import {
  NormalizedSatelliteObservationDTO,
  NormalizedNdviMetricsDTO,
  NormalizedNdviObservationDTO,
} from '../types/satellite.types.js';

// ISO-8601 regex accepting YYYY-MM-DD or full ISO-8601 date-time
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const isValidIso8601 = (val: string): boolean => {
  if (!ISO_8601_REGEX.test(val)) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
};

/**
 * Validates a single NDVI value to ensure it falls within the mathematical [-1.0, 1.0] range.
 * Does NOT silently clamp invalid values; throws an AppError 400 Bad Request.
 */
export function validateNdviValue(val: unknown, fieldName: string = 'NDVI'): number {
  if (typeof val !== 'number' || !isFinite(val)) {
    throw AppError.badRequest(`Invalid ${fieldName} value: '${val}'. Must be a finite number.`);
  }

  if (val < -1.0 || val > 1.0) {
    throw AppError.badRequest(
      `Invalid ${fieldName} value: ${val}. NDVI must be between -1.0 and 1.0.`
    );
  }

  return val;
}

/**
 * Validates a percentage value to ensure it falls within [0.0, 100.0]%.
 * Does NOT silently clamp invalid values; throws an AppError 400 Bad Request.
 */
export function validatePercentage(val: unknown, fieldName: string): number {
  if (typeof val !== 'number' || !isFinite(val)) {
    throw AppError.badRequest(`Invalid ${fieldName}: '${val}'. Must be a finite number.`);
  }

  if (val < 0.0 || val > 100.0) {
    throw AppError.badRequest(
      `Invalid ${fieldName}: ${val}%. Percentage must be between 0.0 and 100.0.`
    );
  }

  return val;
}

/**
 * Validates cloud coverage percentage. If null or undefined, returns null.
 */
export function validateCloudCoverage(val: unknown): number | null {
  if (val === null || val === undefined) {
    return null;
  }
  return validatePercentage(val, 'cloudCoverage');
}

/**
 * Validates valid pixel percentage.
 */
export function validateValidPixelPercentage(val: unknown): number {
  return validatePercentage(val, 'validPixelPercentage');
}

/**
 * Validates farm ID as a standard UUID v4.
 */
export function validateFarmId(farmId: unknown): string {
  if (typeof farmId !== 'string' || !farmId.trim()) {
    throw AppError.badRequest('Farm ID is required.');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(farmId.trim())) {
    throw AppError.badRequest(`Invalid farm ID format: '${farmId}'. Expected a valid UUID.`);
  }

  return farmId.trim();
}

/**
 * Validates observation timestamp to ensure it is a valid date and not in the future.
 */
export function validateObservationTimestamp(observedAt: unknown): Date {
  let date: Date;

  if (observedAt instanceof Date) {
    date = observedAt;
  } else if (typeof observedAt === 'string') {
    date = new Date(observedAt);
  } else {
    throw AppError.badRequest(`Invalid observation timestamp: '${observedAt}'. Expected a Date or ISO-8601 string.`);
  }

  if (isNaN(date.getTime())) {
    throw AppError.badRequest(`Malformed observation timestamp: '${observedAt}'. Cannot be parsed.`);
  }

  // Allow up to 5 minutes clock skew for satellite timestamps
  const nowWithSkew = new Date(Date.now() + 5 * 60 * 1000);
  if (date > nowWithSkew) {
    throw AppError.badRequest(
      `Observation timestamp cannot be in the future: ${date.toISOString()}`
    );
  }

  return date;
}

/**
 * Validates normalized NDVI metrics object.
 * Enforces:
 * - minNdvi, maxNdvi, meanNdvi in [-1, 1]
 * - minNdvi <= meanNdvi <= maxNdvi
 * - validPixelPercentage in [0, 100]
 */
export function validateNdviMetrics(metrics: NormalizedNdviMetricsDTO): NormalizedNdviMetricsDTO {
  if (!metrics || typeof metrics !== 'object') {
    throw AppError.badRequest('NDVI metrics payload is missing or malformed.');
  }

  const minNdvi = validateNdviValue(metrics.minNdvi, 'minNdvi');
  const maxNdvi = validateNdviValue(metrics.maxNdvi, 'maxNdvi');
  const meanNdvi = validateNdviValue(metrics.meanNdvi, 'meanNdvi');
  const validPixelPercentage = validateValidPixelPercentage(metrics.validPixelPercentage);

  if (minNdvi > maxNdvi) {
    throw AppError.badRequest(
      `Invalid NDVI metrics: minNdvi (${minNdvi}) cannot be greater than maxNdvi (${maxNdvi}).`
    );
  }

  if (meanNdvi < minNdvi || meanNdvi > maxNdvi) {
    throw AppError.badRequest(
      `Invalid NDVI metrics: meanNdvi (${meanNdvi}) must fall between minNdvi (${minNdvi}) and maxNdvi (${maxNdvi}).`
    );
  }

  return {
    meanNdvi,
    minNdvi,
    maxNdvi,
    validPixelPercentage,
  };
}

/**
 * Validates normalized satellite observation metadata.
 * Enforces required fields: provider, satellite, productType, productId, cloudCoverage.
 */
export function validateSatelliteObservation(
  obs: NormalizedSatelliteObservationDTO
): NormalizedSatelliteObservationDTO {
  if (!obs || typeof obs !== 'object') {
    throw AppError.badRequest('Satellite observation payload is missing or malformed.');
  }

  const observedAt = validateObservationTimestamp(obs.observedAt);

  if (!obs.provider || typeof obs.provider !== 'string' || !obs.provider.trim()) {
    throw AppError.badRequest("Satellite observation 'provider' is required.");
  }

  if (!obs.satellite || typeof obs.satellite !== 'string' || !obs.satellite.trim()) {
    throw AppError.badRequest("Satellite observation 'satellite' name is required.");
  }

  if (!obs.productType || typeof obs.productType !== 'string' || !obs.productType.trim()) {
    throw AppError.badRequest("Satellite observation 'productType' is required.");
  }

  if (!obs.productId || typeof obs.productId !== 'string' || !obs.productId.trim()) {
    throw AppError.badRequest("Satellite observation 'productId' is required.");
  }

  const cloudCoverage = validateCloudCoverage(obs.cloudCoverage);

  return {
    observedAt,
    provider: obs.provider.trim(),
    satellite: obs.satellite.trim(),
    productType: obs.productType.trim(),
    productId: obs.productId.trim(),
    cloudCoverage,
    sourceReference: obs.sourceReference ? obs.sourceReference.trim() : null,
  };
}

/**
 * Validates combined observation DTO.
 */
export function validateNormalizedObservationPair(
  dto: NormalizedNdviObservationDTO
): NormalizedNdviObservationDTO {
  if (!dto || typeof dto !== 'object') {
    throw AppError.badRequest('Observation pair payload is missing.');
  }

  const observedAt = validateObservationTimestamp(dto.observedAt);
  const satellite = validateSatelliteObservation(dto.satellite);
  const ndvi = validateNdviMetrics(dto.ndvi);

  return {
    observedAt,
    satellite,
    ndvi,
  };
}

// ============================================================================
// Zod Schemas for API Routes / Query Parameters
// ============================================================================

export const farmIdParamForSatelliteSchema = z.object({
  farmId: z
    .string({ required_error: 'Farm ID is required' })
    .uuid('Invalid farm ID format. Expected a valid UUID'),
});

export const historicalSatelliteQuerySchema = z
  .object({
    from: z
      .string()
      .optional()
      .refine((val) => !val || isValidIso8601(val), {
        message: "'from' must be a valid ISO-8601 date or date-time string",
      }),
    to: z
      .string()
      .optional()
      .refine((val) => !val || isValidIso8601(val), {
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
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: "Invalid date range: 'from' must be before or equal to 'to'",
      path: ['from'],
    }
  );

export const syncSatelliteSchema = z
  .object({
    from: z
      .string({ required_error: "'from' is required" })
      .min(1, "'from' cannot be empty")
      .refine(isValidIso8601, {
        message: "'from' must be a valid ISO-8601 date or date-time string",
      }),
    to: z
      .string({ required_error: "'to' is required" })
      .min(1, "'to' cannot be empty")
      .refine(isValidIso8601, {
        message: "'to' must be a valid ISO-8601 date or date-time string",
      }),
    maxCloudCoverage: z
      .number({ invalid_type_error: 'maxCloudCoverage must be a number' })
      .min(0, 'maxCloudCoverage must be between 0.0 and 100.0')
      .max(100, 'maxCloudCoverage must be between 0.0 and 100.0')
      .optional(),
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
  )
  .refine(
    (data) => {
      const toDate = new Date(data.to);
      const nowWithSkew = new Date(Date.now() + 5 * 60 * 1000);
      return toDate <= nowWithSkew;
    },
    {
      message: "'to' date cannot be in the future",
      path: ['to'],
    }
  );

export const validateBody = (schema: z.ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
};

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
