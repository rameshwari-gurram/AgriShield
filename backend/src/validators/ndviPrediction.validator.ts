/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * NDVI 7-Day Ahead Forecast Validators (Zod)
 */

import { z } from 'zod';

export const CANONICAL_NDVI_FEATURE_NAMES = [
  'NDVI',
  'Rainfall_Current',
  'Temperature_Current',
  'NDVI_lag_1',
  'NDVI_lag_2',
  'NDVI_lag_3',
  'NDVI_lag_4',
  'NDVI_lag_8',
  'NDVI_change_1w',
  'NDVI_change_2w',
  'NDVI_change_4w',
  'Rainfall_lag_1',
  'Rainfall_lag_2',
  'Rainfall_lag_4',
  'Rainfall_rolling_2w',
  'Rainfall_rolling_4w',
  'Rainfall_rolling_8w',
  'Temperature_lag_1',
  'Temperature_lag_2',
  'Temperature_lag_4',
  'Temperature_rolling_2w',
  'Temperature_rolling_4w',
  'Temperature_rolling_8w',
  'Week_Sin',
  'Week_Cos',
  'Month_Sin',
  'Month_Cos',
  'Latitude',
  'Longitude',
] as const;

export const ndviFeaturePayloadSchema = z
  .object({
    NDVI: z.number().min(-0.2).max(1.0),
    Rainfall_Current: z.number().min(0.0),
    Temperature_Current: z.number(),
    NDVI_lag_1: z.number().nullable().optional(),
    NDVI_lag_2: z.number().nullable().optional(),
    NDVI_lag_3: z.number().nullable().optional(),
    NDVI_lag_4: z.number().nullable().optional(),
    NDVI_lag_8: z.number().nullable().optional(),
    NDVI_change_1w: z.number().nullable().optional(),
    NDVI_change_2w: z.number().nullable().optional(),
    NDVI_change_4w: z.number().nullable().optional(),
    Rainfall_lag_1: z.number().min(0.0).nullable().optional(),
    Rainfall_lag_2: z.number().min(0.0).nullable().optional(),
    Rainfall_lag_4: z.number().min(0.0).nullable().optional(),
    Rainfall_rolling_2w: z.number().min(0.0).nullable().optional(),
    Rainfall_rolling_4w: z.number().min(0.0).nullable().optional(),
    Rainfall_rolling_8w: z.number().min(0.0).nullable().optional(),
    Temperature_lag_1: z.number().nullable().optional(),
    Temperature_lag_2: z.number().nullable().optional(),
    Temperature_lag_4: z.number().nullable().optional(),
    Temperature_rolling_2w: z.number().nullable().optional(),
    Temperature_rolling_4w: z.number().nullable().optional(),
    Temperature_rolling_8w: z.number().nullable().optional(),
    Week_Sin: z.number().min(-1.0).max(1.0),
    Week_Cos: z.number().min(-1.0).max(1.0),
    Month_Sin: z.number().min(-1.0).max(1.0),
    Month_Cos: z.number().min(-1.0).max(1.0),
    Latitude: z.number().min(-90.0).max(90.0),
    Longitude: z.number().min(-180.0).max(180.0),
  })
  .strict();

export const ndviFeatureAttributionSchema = z.object({
  feature_name: z.string(),
  feature_value: z.number().nullable().optional(),
  shap_value: z.number(),
  direction: z.string(),
  contribution_magnitude: z.number(),
});

export const ndviExplanationSchema = z.object({
  base_value: z.number(),
  reconstructed_prediction: z.number(),
  additivity_error: z.number(),
  attributions: z.array(ndviFeatureAttributionSchema),
});

export const ndviModelInfoSchema = z.object({
  model_name: z.string(),
  model_version: z.string(),
  feature_contract_version: z.string(),
  feature_count: z.number(),
});

export const ndviPredictionResponseSchema = z.object({
  predicted_ndvi: z.number().min(-0.2).max(1.0),
  current_ndvi: z.number().min(-0.2).max(1.0),
  predicted_delta: z.number(),
  forecast_horizon: z.string(),
  target_variable: z.string(),
  baseline_persistence_ndvi: z.number(),
  explanation: ndviExplanationSchema,
  model: ndviModelInfoSchema,
  disclaimer: z.string(),
});
