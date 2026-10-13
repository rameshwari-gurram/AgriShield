/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-A: Feature Contract v1.1 Zod Validator
 *
 * Strictly validates the locked 17-feature input payload expected by the Python ML service.
 * Enforces canonical ordering, physical bounds, native missingness, and cross-field invariants.
 */

import { z } from 'zod';

export const CANONICAL_FEATURE_NAMES = [
  'precipitation_sum_30d',
  'precipitation_sum_14d',
  'precipitation_std_30d',
  'consecutive_dry_days_max',
  'temp_max_30d',
  'temp_mean_30d',
  'temp_amplitude_mean_30d',
  'heat_wave_hours_30d',
  'relative_humidity_mean_30d',
  'vpd_mean_30d',
  'wind_speed_mean_30d',
  'wind_gust_max_30d',
  'ndvi_latest',
  'ndvi_trend_30d',
  'calculated_area_ha',
  'is_ndvi_available',
  'is_ndvi_trend_available',
] as const;

export const mlFeatureContractV1_1Schema = z
  .object({
    precipitation_sum_30d: z
      .number({ required_error: 'precipitation_sum_30d is required' })
      .min(0, 'precipitation_sum_30d must be non-negative'),
    precipitation_sum_14d: z
      .number({ required_error: 'precipitation_sum_14d is required' })
      .min(0, 'precipitation_sum_14d must be non-negative'),
    precipitation_std_30d: z
      .number({ required_error: 'precipitation_std_30d is required' })
      .min(0, 'precipitation_std_30d must be non-negative'),
    consecutive_dry_days_max: z
      .number({ required_error: 'consecutive_dry_days_max is required' })
      .int('consecutive_dry_days_max must be an integer')
      .min(0, 'consecutive_dry_days_max must be between 0 and 30')
      .max(30, 'consecutive_dry_days_max must be between 0 and 30'),
    temp_max_30d: z
      .number({ required_error: 'temp_max_30d is required' }),
    temp_mean_30d: z
      .number({ required_error: 'temp_mean_30d is required' }),
    temp_amplitude_mean_30d: z
      .number({ required_error: 'temp_amplitude_mean_30d is required' })
      .min(0, 'temp_amplitude_mean_30d must be non-negative'),
    heat_wave_hours_30d: z
      .number({ required_error: 'heat_wave_hours_30d is required' })
      .int('heat_wave_hours_30d must be an integer')
      .min(0, 'heat_wave_hours_30d must be between 0 and 720')
      .max(720, 'heat_wave_hours_30d must be between 0 and 720'),
    relative_humidity_mean_30d: z
      .number({ required_error: 'relative_humidity_mean_30d is required' })
      .min(0, 'relative_humidity_mean_30d must be between 0 and 100')
      .max(100, 'relative_humidity_mean_30d must be between 0 and 100'),
    vpd_mean_30d: z
      .number({ required_error: 'vpd_mean_30d is required' })
      .min(0, 'vpd_mean_30d must be non-negative'),
    wind_speed_mean_30d: z
      .number({ required_error: 'wind_speed_mean_30d is required' })
      .min(0, 'wind_speed_mean_30d must be non-negative'),
    wind_gust_max_30d: z
      .number({ required_error: 'wind_gust_max_30d is required' })
      .min(0, 'wind_gust_max_30d must be non-negative'),
    ndvi_latest: z
      .number()
      .min(-0.2, 'ndvi_latest must be at least -0.2')
      .max(1.0, 'ndvi_latest must not exceed 1.0')
      .nullable(),
    ndvi_trend_30d: z
      .number()
      .nullable(),
    calculated_area_ha: z
      .number({ required_error: 'calculated_area_ha is required' })
      .gt(0, 'calculated_area_ha must be strictly positive (> 0)'),
    is_ndvi_available: z
      .union([z.literal(0), z.literal(1)], {
        required_error: 'is_ndvi_available must be 0 or 1',
      }),
    is_ndvi_trend_available: z
      .union([z.literal(0), z.literal(1)], {
        required_error: 'is_ndvi_trend_available must be 0 or 1',
      }),
  })
  .strict()
  .refine(
    (data) => data.precipitation_sum_14d <= data.precipitation_sum_30d + 1e-4,
    {
      message: 'precipitation_sum_14d cannot exceed precipitation_sum_30d',
      path: ['precipitation_sum_14d'],
    }
  )
  .refine(
    (data) => data.wind_gust_max_30d >= data.wind_speed_mean_30d - 1e-4,
    {
      message: 'wind_gust_max_30d cannot be less than wind_speed_mean_30d',
      path: ['wind_gust_max_30d'],
    }
  )
  .refine(
    (data) => {
      if (data.is_ndvi_available === 1) {
        return data.ndvi_latest !== null && !isNaN(data.ndvi_latest);
      }
      return data.ndvi_latest === null;
    },
    {
      message: 'is_ndvi_available must agree with ndvi_latest value (1 requires number, 0 requires null)',
      path: ['is_ndvi_available'],
    }
  )
  .refine(
    (data) => {
      if (data.is_ndvi_trend_available === 1) {
        return data.ndvi_trend_30d !== null && !isNaN(data.ndvi_trend_30d);
      }
      return data.ndvi_trend_30d === null;
    },
    {
      message: 'is_ndvi_trend_available must agree with ndvi_trend_30d value (1 requires number, 0 requires null)',
      path: ['is_ndvi_trend_available'],
    }
  );

export type MLFeatureContractV1_1 = z.infer<typeof mlFeatureContractV1_1Schema>;
