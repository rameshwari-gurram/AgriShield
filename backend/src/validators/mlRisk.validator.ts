/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-D: ML Risk Request Validators
 *
 * Provides Zod validation schemas and Express middlewares for ML risk routes.
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Validates :farmId path parameter as a valid UUID.
 */
export const farmIdParamSchema = z.object({
  farmId: z
    .string({ required_error: 'Farm ID is required' })
    .uuid('Invalid farm ID format. Expected a valid UUID'),
});

/**
 * Validates optional ?forceRefresh query parameter.
 * Strictly accepts only 'true' or 'false'.
 * Defaults to false if omitted.
 * Rejects any other value (e.g. 'yes', '1', 'foo') with 400 Bad Request.
 */
export const mlRiskQuerySchema = z.object({
  forceRefresh: z
    .enum(['true', 'false'], {
      errorMap: () => ({ message: "Invalid value for 'forceRefresh'. Expected 'true' or 'false'" }),
    })
    .optional()
    .transform((val) => val === 'true'),
});

export type FarmIdParam = z.infer<typeof farmIdParamSchema>;
export type MlRiskQuery = z.infer<typeof mlRiskQuerySchema>;

/**
 * Express middleware for validating req.params against a Zod schema.
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
 * Express middleware for validating req.query against a Zod schema.
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
