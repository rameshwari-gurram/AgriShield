/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-B: ML Microservice Prediction Response Zod Validator & Types
 *
 * Strictly validates the HTTP 200 JSON payload returned by Python FastAPI POST /predict.
 * Validates prediction metrics, SHAP explanations, model provenance, and disclaimers.
 */

import { z } from 'zod';

export const featureAttributionSchema = z
  .object({
    feature_name: z.string().min(1, 'feature_name is required'),
    feature_value: z.number().nullable(),
    shap_value: z
      .number({ required_error: 'shap_value is required' })
      .refine(Number.isFinite, 'shap_value must be a finite number'),
    direction: z.string().min(1, 'direction is required'),
    contribution_magnitude: z
      .number({ required_error: 'contribution_magnitude is required' })
      .min(0, 'contribution_magnitude must be non-negative'),
  })
  .strict();

export const predictionResultSchema = z
  .object({
    predicted_class: z.union([z.literal(0), z.literal(1)], {
      required_error: 'predicted_class must be 0 or 1',
    }),
    calibrated_probability: z
      .number({ required_error: 'calibrated_probability is required' })
      .min(0.0, 'calibrated_probability must be at least 0.0')
      .max(1.0, 'calibrated_probability must not exceed 1.0'),
    raw_decision_margin: z
      .number({ required_error: 'raw_decision_margin is required' })
      .refine(Number.isFinite, 'raw_decision_margin must be a finite number'),
  })
  .strict();

export const explanationResultSchema = z
  .object({
    base_value: z
      .number({ required_error: 'base_value is required' })
      .refine(Number.isFinite, 'base_value must be a finite number'),
    reconstructed_margin: z
      .number({ required_error: 'reconstructed_margin is required' })
      .refine(Number.isFinite, 'reconstructed_margin must be a finite number'),
    additivity_error: z
      .number({ required_error: 'additivity_error is required' })
      .min(0, 'additivity_error must be non-negative'),
    attributions: z
      .array(featureAttributionSchema)
      .length(17, 'attributions must contain exactly 17 feature attributions'),
  })
  .strict();

export const modelInfoSchema = z
  .object({
    model_name: z.string().min(1, 'model_name is required'),
    model_version: z.string().min(1, 'model_version is required'),
    feature_contract_version: z.string().min(1, 'feature_contract_version is required'),
    feature_count: z.literal(17, {
      required_error: 'feature_count must be 17',
    }),
  })
  .strict();

export const mlPredictionResponseSchema = z
  .object({
    prediction: predictionResultSchema,
    explanation: explanationResultSchema,
    model: modelInfoSchema,
    disclaimer: z.string().min(1, 'disclaimer is required'),
  })
  .strict();

export type FeatureAttribution = z.infer<typeof featureAttributionSchema>;
export type PredictionResult = z.infer<typeof predictionResultSchema>;
export type ExplanationResult = z.infer<typeof explanationResultSchema>;
export type ModelInfo = z.infer<typeof modelInfoSchema>;
export type MLPredictionResponse = z.infer<typeof mlPredictionResponseSchema>;
