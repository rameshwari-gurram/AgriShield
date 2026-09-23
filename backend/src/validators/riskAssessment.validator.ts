/**
 * Module 6: Risk Assessment Request Validators
 * Provides Zod validation schemas and Express middlewares for risk assessment routes.
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Validates :farmId path parameter as a valid UUID
 */
export const farmIdParamSchema = z.object({
  farmId: z
    .string({ required_error: 'Farm ID is required' })
    .uuid('Invalid farm ID format. Expected a valid UUID'),
});

/**
 * Validates :assessmentId path parameter as a valid UUID
 */
export const assessmentIdParamSchema = z.object({
  assessmentId: z
    .string({ required_error: 'Assessment ID is required' })
    .uuid('Invalid assessment ID format. Expected a valid UUID'),
});

/**
 * Validates optional ?limit= query parameter (integer between 1 and 100)
 */
export const riskAssessmentQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === '') return true;
        const num = Number(val);
        return !isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 100;
      },
      {
        message: "'limit' must be an integer between 1 and 100",
      }
    )
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
});

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
