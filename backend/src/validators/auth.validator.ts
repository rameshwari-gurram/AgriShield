import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function isEmailIdentifier(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

export function isMobileIdentifier(val: string): boolean {
  const clean = val.replace(/[\s-]/g, '');
  return /^(?:\+91|0)?[6-9]\d{9}$/.test(clean);
}

const mobileNumberField = z
  .string()
  .trim()
  .transform((val) => val.replace(/[\s-]/g, ''))
  .refine(
    (val) => /^(?:\+91|0)?[6-9]\d{9}$/.test(val),
    'Invalid mobile number format. Expected 10-digit mobile number with optional +91 prefix'
  );

const emailField = z
  .string()
  .trim()
  .email('Invalid email address format')
  .max(255, 'Email cannot exceed 255 characters');

const dualIdentifierField = z
  .string({ required_error: 'Identifier (mobile number or email) is required' })
  .trim()
  .refine(
    (val) => isEmailIdentifier(val) || isMobileIdentifier(val),
    'Invalid identifier. Please enter a valid 10-digit mobile number or email address'
  );

export const sendOtpSchema = z
  .object({
    identifier: dualIdentifierField.optional(),
    mobileNumber: mobileNumberField.optional(),
    email: emailField.optional(),
  })
  .refine((data) => Boolean(data.identifier || data.mobileNumber || data.email), {
    message: 'Mobile number or email address is required',
  })
  .transform((data) => {
    const raw = data.identifier || data.mobileNumber || data.email!;
    return {
      identifier: raw,
      mobileNumber: data.mobileNumber || (isMobileIdentifier(raw) ? raw.replace(/[\s-]/g, '') : undefined),
      email: data.email || (isEmailIdentifier(raw) ? raw.trim().toLowerCase() : undefined),
    };
  });

export const verifyOtpSchema = z
  .object({
    identifier: dualIdentifierField.optional(),
    mobileNumber: mobileNumberField.optional(),
    email: emailField.optional(),
    otp: z
      .string({ required_error: 'Verification code is required' })
      .trim()
      .length(6, 'Verification code must be exactly 6 digits')
      .regex(/^\d{6}$/, 'Verification code must contain digits only'),
  })
  .refine((data) => Boolean(data.identifier || data.mobileNumber || data.email), {
    message: 'Mobile number or email address is required',
  })
  .transform((data) => {
    const raw = data.identifier || data.mobileNumber || data.email!;
    return {
      identifier: raw,
      mobileNumber: data.mobileNumber || (isMobileIdentifier(raw) ? raw.replace(/[\s-]/g, '') : undefined),
      email: data.email || (isEmailIdentifier(raw) ? raw.trim().toLowerCase() : undefined),
      otp: data.otp,
    };
  });

export const requestEmailLinkSchema = z.object({
  email: emailField,
});

export const confirmEmailLinkSchema = z.object({
  email: emailField,
  otp: z
    .string({ required_error: 'Verification code is required' })
    .trim()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain digits only'),
});

export const adminLoginSchema = z.object({
  username: z
    .string({ required_error: 'Username or email is required' })
    .trim()
    .min(3, 'Username or email must be at least 3 characters')
    .max(255, 'Username or email cannot exceed 255 characters'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RequestEmailLinkInput = z.infer<typeof requestEmailLinkSchema>;
export type ConfirmEmailLinkInput = z.infer<typeof confirmEmailLinkSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

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
