import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { AreaUnit, FarmStatus } from '@prisma/client';

export const createFarmSchema = z
  .object({
    farmerId: z
      .string({ required_error: 'Farmer ID is required' })
      .uuid('Invalid farmer ID format. Expected a valid UUID'),

    farmName: z
      .string({ required_error: 'Farm name is required' })
      .trim()
      .min(2, 'Farm name must be at least 2 characters')
      .max(100, 'Farm name cannot exceed 100 characters'),

    cropName: z
      .string({ required_error: 'Crop name is required' })
      .trim()
      .min(2, 'Crop name must be at least 2 characters')
      .max(100, 'Crop name cannot exceed 100 characters'),

    cropVariety: z
      .string()
      .trim()
      .max(100, 'Crop variety cannot exceed 100 characters')
      .optional()
      .nullable(),

    sowingDate: z
      .string({ required_error: 'Sowing date is required' })
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Sowing date must be a valid date',
      }),

    expectedHarvestDate: z
      .string()
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Expected harvest date must be a valid date',
      }),

    farmArea: z
      .number({ required_error: 'Farm area is required' })
      .positive('Farm area must be greater than 0')
      .max(10000, 'Farm area cannot exceed 10,000 units'),

    farmAreaUnit: z
      .nativeEnum(AreaUnit, {
        errorMap: () => ({
          message: `Invalid area unit. Supported units: ${Object.values(AreaUnit).join(', ')}`,
        }),
      })
      .default(AreaUnit.ACRE),

    village: z
      .string({ required_error: 'Village is required' })
      .trim()
      .min(2, 'Village must be at least 2 characters')
      .max(100, 'Village cannot exceed 100 characters'),

    district: z
      .string({ required_error: 'District is required' })
      .trim()
      .min(2, 'District must be at least 2 characters')
      .max(100, 'District cannot exceed 100 characters'),

    state: z
      .string({ required_error: 'State is required' })
      .trim()
      .min(2, 'State must be at least 2 characters')
      .max(100, 'State cannot exceed 100 characters'),

    pincode: z
      .string({ required_error: 'Pincode is required' })
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Invalid pincode format. Expected a 6-digit Indian PIN code'),

    status: z
      .nativeEnum(FarmStatus, {
        errorMap: () => ({
          message: `Invalid status. Supported statuses: ${Object.values(FarmStatus).join(', ')}`,
        }),
      })
      .default(FarmStatus.ACTIVE),
  })
  .refine(
    (data) => {
      if (data.expectedHarvestDate && data.sowingDate) {
        return new Date(data.expectedHarvestDate) >= new Date(data.sowingDate);
      }
      return true;
    },
    {
      message: 'Expected harvest date must be on or after sowing date',
      path: ['expectedHarvestDate'],
    }
  );

export const updateFarmSchema = z
  .object({
    farmName: z
      .string()
      .trim()
      .min(2, 'Farm name must be at least 2 characters')
      .max(100, 'Farm name cannot exceed 100 characters')
      .optional(),

    cropName: z
      .string()
      .trim()
      .min(2, 'Crop name must be at least 2 characters')
      .max(100, 'Crop name cannot exceed 100 characters')
      .optional(),

    cropVariety: z
      .string()
      .trim()
      .max(100, 'Crop variety cannot exceed 100 characters')
      .optional()
      .nullable(),

    sowingDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Sowing date must be a valid date',
      })
      .optional(),

    expectedHarvestDate: z
      .string()
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Expected harvest date must be a valid date',
      }),

    farmArea: z
      .number()
      .positive('Farm area must be greater than 0')
      .max(10000, 'Farm area cannot exceed 10,000 units')
      .optional(),

    farmAreaUnit: z
      .nativeEnum(AreaUnit, {
        errorMap: () => ({
          message: `Invalid area unit. Supported units: ${Object.values(AreaUnit).join(', ')}`,
        }),
      })
      .optional(),

    village: z
      .string()
      .trim()
      .min(2, 'Village must be at least 2 characters')
      .max(100, 'Village cannot exceed 100 characters')
      .optional(),

    district: z
      .string()
      .trim()
      .min(2, 'District must be at least 2 characters')
      .max(100, 'District cannot exceed 100 characters')
      .optional(),

    state: z
      .string()
      .trim()
      .min(2, 'State must be at least 2 characters')
      .max(100, 'State cannot exceed 100 characters')
      .optional(),

    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Invalid pincode format. Expected a 6-digit Indian PIN code')
      .optional(),

    status: z
      .nativeEnum(FarmStatus, {
        errorMap: () => ({
          message: `Invalid status. Supported statuses: ${Object.values(FarmStatus).join(', ')}`,
        }),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.expectedHarvestDate && data.sowingDate) {
        return new Date(data.expectedHarvestDate) >= new Date(data.sowingDate);
      }
      return true;
    },
    {
      message: 'Expected harvest date must be on or after sowing date',
      path: ['expectedHarvestDate'],
    }
  );

export const farmIdParamSchema = z.object({
  id: z.string().uuid('Invalid farm ID format. Expected a valid UUID'),
});

export const farmerIdParamForFarmsSchema = z.object({
  farmerId: z.string().uuid('Invalid farmer ID format. Expected a valid UUID'),
});

export const farmQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
  search: z.string().trim().optional(),
  cropName: z.string().trim().optional(),
  state: z.string().trim().optional(),
  status: z
    .nativeEnum(FarmStatus)
    .optional(),
  farmerId: z.string().uuid().optional(),
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
