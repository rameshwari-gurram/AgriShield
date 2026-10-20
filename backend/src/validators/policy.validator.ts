/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Policy Input Validators (Zod)
 */

import { z } from 'zod';
import { PolicyStatus, RiskHazardType } from '@prisma/client';

// Regex validating fixed-precision currency formats (up to 2 decimal places)
const DECIMAL_CURRENCY_REGEX = /^\d+(\.\d{1,2})?$/;

export const createPolicySchema = z
  .object({
    farmId: z
      .string({ required_error: 'Farm ID is required' })
      .uuid('Invalid farm ID format. Expected a valid UUID'),

    farmerId: z
      .string({ required_error: 'Farmer ID is required' })
      .uuid('Invalid farmer ID format. Expected a valid UUID'),

    cropName: z
      .string({ required_error: 'Crop name is required' })
      .trim()
      .min(2, 'Crop name must be at least 2 characters')
      .max(100, 'Crop name cannot exceed 100 characters'),

    sumInsured: z
      .union([z.number(), z.string()], {
        required_error: 'Sum insured is required',
      })
      .refine((val) => {
        const num = Number(val);
        return !isNaN(num) && num > 0;
      }, { message: 'Sum insured must be a positive number greater than 0' })
      .refine((val) => {
        const str = typeof val === 'number' ? val.toString() : val.trim();
        return DECIMAL_CURRENCY_REGEX.test(str);
      }, { message: 'Sum insured can have at most 2 decimal places' })
      .refine((val) => Number(val) <= 100_000_000, {
        message: 'Sum insured exceeds maximum allowable single-policy limit of 100,000,000',
      }),

    premiumAmount: z
      .union([z.number(), z.string()], {
        required_error: 'Premium amount is required',
      })
      .refine((val) => {
        const num = Number(val);
        return !isNaN(num) && num > 0;
      }, { message: 'Premium amount must be a positive number greater than 0' })
      .refine((val) => {
        const str = typeof val === 'number' ? val.toString() : val.trim();
        return DECIMAL_CURRENCY_REGEX.test(str);
      }, { message: 'Premium amount can have at most 2 decimal places' }),

    coveredHazards: z
      .array(
        z.nativeEnum(RiskHazardType, {
          errorMap: () => ({
            message: `Invalid hazard type. Supported hazards: ${Object.values(RiskHazardType).join(', ')}`,
          }),
        }),
        { required_error: 'Covered hazards selection is required' }
      )
      .min(1, 'At least one covered hazard must be selected'),

    startDate: z
      .string({ required_error: 'Coverage start date is required' })
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Start date must be a valid ISO date/timestamp',
      }),

    endDate: z
      .string({ required_error: 'Coverage end date is required' })
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'End date must be a valid ISO date/timestamp',
      }),

    policyNumber: z
      .string()
      .trim()
      .min(3, 'Policy number must be at least 3 characters')
      .max(50, 'Policy number cannot exceed 50 characters')
      .optional(),

    status: z
      .enum([PolicyStatus.PENDING, PolicyStatus.ACTIVE], {
        errorMap: () => ({
          message: 'Initial policy creation status must be PENDING or ACTIVE',
        }),
      })
      .optional()
      .default(PolicyStatus.PENDING),
  })
  .refine((data) => new Date(data.endDate).getTime() > new Date(data.startDate).getTime(), {
    message: 'Coverage end date must be strictly later than start date',
    path: ['endDate'],
  })
  .refine((data) => Number(data.premiumAmount) <= Number(data.sumInsured), {
    message: 'Premium amount cannot exceed sum insured',
    path: ['premiumAmount'],
  });

export const policyIdParamSchema = z.object({
  id: z
    .string({ required_error: 'Policy ID is required' })
    .uuid('Invalid policy ID format. Expected a valid UUID'),
});

export const farmIdParamSchema = z.object({
  farmId: z
    .string({ required_error: 'Farm ID is required' })
    .uuid('Invalid farm ID format. Expected a valid UUID'),
});

export const policyQuerySchema = z.object({
  farmId: z.string().uuid('Invalid farm ID format. Expected a valid UUID').optional(),
});

export const activePolicyQuerySchema = z.object({
  referenceDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Reference date must be a valid ISO date/timestamp',
    })
    .optional(),
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type PolicyIdParam = z.infer<typeof policyIdParamSchema>;
export type FarmIdParam = z.infer<typeof farmIdParamSchema>;
export type PolicyQuery = z.infer<typeof policyQuerySchema>;
export type ActivePolicyQuery = z.infer<typeof activePolicyQuerySchema>;

import { Request, Response, NextFunction } from 'express';

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

