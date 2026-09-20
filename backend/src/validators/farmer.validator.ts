import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { Language } from '@prisma/client';

export const createFarmerSchema = z.object({
  fullName: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s.'-]+$/, 'Full name contains invalid characters'),

  mobileNumber: z
    .string({ required_error: 'Mobile number is required' })
    .trim()
    .regex(/^(?:\+91|0)?[6-9]\d{9}$/, 'Invalid mobile number format. Expected 10-digit mobile number with optional +91 prefix'),

  preferredLanguage: z
    .nativeEnum(Language, {
      errorMap: () => ({ message: `Invalid language. Supported languages: ${Object.values(Language).join(', ')}` }),
    })
    .default(Language.en),

  farmerReferenceNumber: z
    .string()
    .trim()
    .min(3, 'Farmer reference number must be at least 3 characters')
    .max(50, 'Farmer reference number cannot exceed 50 characters')
    .regex(/^[A-Za-z0-9\-_]+$/, 'Farmer reference number must be alphanumeric (letters, digits, hyphens, underscores)')
    .optional(),
});

export const farmerIdParamSchema = z.object({
  id: z.string().uuid('Invalid farmer ID format. Expected a valid UUID'),
});

export const farmerQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
  search: z.string().trim().optional(),
});

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
