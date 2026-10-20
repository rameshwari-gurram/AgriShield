/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Claim Input Validators (Zod)
 */

import { z } from 'zod';
import { ClaimStatus, RiskSeverity } from '@prisma/client';

const DECIMAL_CURRENCY_REGEX = /^\d+(\.\d{1,2})?$/;

export const createClaimSchema = z.object({
  policyId: z
    .string({ required_error: 'Policy ID is required' })
    .uuid('Invalid policy ID format. Expected a valid UUID'),

  assessmentId: z
    .string({ required_error: 'Assessment ID is required' })
    .uuid('Invalid assessment ID format. Expected a valid UUID'),

  riskEventId: z
    .string({ required_error: 'Risk event ID is required' })
    .uuid('Invalid risk event ID format. Expected a valid UUID'),

  triggerRuleCode: z
    .string({ required_error: 'Trigger rule code is required' })
    .trim()
    .min(2, 'Trigger rule code must be at least 2 characters')
    .max(50, 'Trigger rule code cannot exceed 50 characters'),

  severity: z.nativeEnum(RiskSeverity, {
    errorMap: () => ({
      message: `Invalid risk severity. Expected one of: ${Object.values(RiskSeverity).join(', ')}`,
    }),
  }),

  observedValue: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .refine((val) => val === null || val === undefined || !isNaN(Number(val)), {
      message: 'Observed value must be a valid number if supplied',
    }),

  thresholdValue: z
    .union([z.number(), z.string()], {
      required_error: 'Threshold value is required',
    })
    .refine((val) => {
      const num = Number(val);
      return !isNaN(num) && num > 0;
    }, { message: 'Threshold value must be a positive number greater than 0' }),

  payoutAmount: z
    .union([z.number(), z.string()], {
      required_error: 'Payout amount is required',
    })
    .refine((val) => {
      const num = Number(val);
      return !isNaN(num) && num > 0;
    }, { message: 'Payout amount must be a positive number greater than 0' })
    .refine((val) => {
      const str = typeof val === 'number' ? val.toString() : val.trim();
      return DECIMAL_CURRENCY_REGEX.test(str);
    }, { message: 'Payout amount can have at most 2 decimal places' }),

  claimNumber: z
    .string()
    .trim()
    .min(3, 'Claim number must be at least 3 characters')
    .max(50, 'Claim number cannot exceed 50 characters')
    .optional(),

  status: z
    .enum([ClaimStatus.PENDING, ClaimStatus.APPROVED], {
      errorMap: () => ({
        message: 'Initial claim status cannot be PAID. Expected PENDING or APPROVED',
      }),
    })
    .optional()
    .default(ClaimStatus.PENDING),

  rejectionReason: z.string().trim().max(1000).optional().nullable(),
});

export const claimIdParamSchema = z.object({
  id: z
    .string({ required_error: 'Claim ID is required' })
    .uuid('Invalid claim ID format. Expected a valid UUID'),
});

export const farmIdParamSchema = z.object({
  farmId: z
    .string({ required_error: 'Farm ID is required' })
    .uuid('Invalid farm ID format. Expected a valid UUID'),
});

export const evaluateClaimSchema = z.object({
  policyId: z
    .string({ required_error: 'Policy ID is required' })
    .uuid('Invalid policy ID format. Expected a valid UUID'),

  assessmentId: z
    .string({ required_error: 'Assessment ID is required' })
    .uuid('Invalid assessment ID format. Expected a valid UUID'),

  riskEventId: z
    .string({ required_error: 'Risk event ID is required' })
    .uuid('Invalid risk event ID format. Expected a valid UUID'),

  payoutConfig: z
    .object({
      severityMultipliers: z
        .record(
          z.nativeEnum(RiskSeverity, {
            errorMap: () => ({
              message: `Invalid risk severity. Expected one of: ${Object.values(RiskSeverity).join(', ')}`,
            }),
          }),
          z
            .number({ required_error: 'Severity multiplier must be a number' })
            .min(0, 'Multiplier cannot be negative')
            .max(1, 'Multiplier cannot exceed 1.0')
        )
        .optional(),
    })
    .optional(),
});

export const settleClaimSchema = z
  .object({
    simulatedTransactionId: z
      .string()
      .trim()
      .regex(/^SIM-[A-Z0-9_-]{3,96}$/, {
        message:
          "Simulated transaction ID must start with 'SIM-' and contain only uppercase alphanumeric characters, underscores, or hyphens",
      })
      .optional(),
  })
  .optional()
  .default({});

export const rejectClaimSchema = z.object({
  reason: z
    .string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(3, 'Rejection reason must be at least 3 characters')
    .max(1000, 'Rejection reason cannot exceed 1000 characters'),
});

export const claimQuerySchema = z.object({
  policyId: z.string().uuid('Invalid policy ID format. Expected a valid UUID').optional(),
  farmId: z.string().uuid('Invalid farm ID format. Expected a valid UUID').optional(),
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type ClaimIdParam = z.infer<typeof claimIdParamSchema>;
export type EvaluateClaimRequestInput = z.infer<typeof evaluateClaimSchema>;
export type SettleClaimRequestInput = z.infer<typeof settleClaimSchema>;
export type RejectClaimRequestInput = z.infer<typeof rejectClaimSchema>;
export type ClaimQuery = z.infer<typeof claimQuerySchema>;

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

