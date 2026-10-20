import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const mobileNumberField = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .transform((val) => val.replace(/[\s-]/g, ''))
  .refine(
    (val) => /^(?:\+91|0)?[6-9]\d{9}$/.test(val),
    'Invalid mobile number format. Expected 10-digit mobile number with optional +91 prefix'
  );

export const sendOtpSchema = z.object({
  mobileNumber: mobileNumberField,
});

export const verifyOtpSchema = z.object({
  mobileNumber: mobileNumberField,
  otp: z
    .string({ required_error: 'Verification code is required' })
    .trim()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain digits only'),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

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
