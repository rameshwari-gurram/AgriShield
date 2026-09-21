import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Single coordinate pair [longitude, latitude]
const coordinatePairSchema = z
  .array(z.number(), { required_error: 'Coordinate must be an array of two numbers [longitude, latitude]' })
  .length(2, 'Coordinate must have exactly two numbers: [longitude, latitude]')
  .refine(
    ([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90,
    {
      message: 'Coordinates must be valid WGS84 values: longitude between -180 and 180, latitude between -90 and 90',
    }
  );

// Linear ring schema
const linearRingSchema = z
  .array(coordinatePairSchema, {
    required_error: 'Linear ring must be an array of coordinates',
  })
  .min(4, 'Polygon linear ring must have at least 4 coordinates (minimum 3 distinct vertices plus closing vertex)')
  .refine(
    (ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
    },
    {
      message: 'Polygon linear ring must be closed (first and last coordinates must be identical)',
    }
  )
  .refine(
    (ring) => {
      // Check distinct vertices
      const distinct = new Set(ring.slice(0, -1).map(([lon, lat]) => `${lon},${lat}`));
      return distinct.size >= 3;
    },
    {
      message: 'Polygon must have at least 3 distinct vertices',
    }
  );

// GeoJSON Polygon schema
export const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon', {
    errorMap: () => ({ message: "Geometry type must be 'Polygon'" }),
  }),
  coordinates: z
    .array(linearRingSchema, {
      required_error: 'Polygon coordinates are required',
    })
    .min(1, 'Polygon must contain at least one linear ring (exterior boundary)'),
});

export const createFarmBoundarySchema = z.object({
  boundary: geoJsonPolygonSchema,
});

export const updateFarmBoundarySchema = z.object({
  boundary: geoJsonPolygonSchema,
});

export const farmIdParamForBoundarySchema = z.object({
  farmId: z.string({ required_error: 'Farm ID is required' }).uuid('Invalid farm ID format. Expected a valid UUID'),
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
