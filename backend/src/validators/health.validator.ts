import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const healthQuerySchema = z.object({
  verbose: z.enum(['true', 'false']).optional().transform((val) => val === 'true'),
});

export type HealthQuery = z.infer<typeof healthQuerySchema>;

export const validateRequest = (schema: z.ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
};
