/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * NDVI 7-Day Ahead Vegetation Forecasting Types
 */

export interface NdviFeaturePayload {
  NDVI: number;
  Rainfall_Current: number;
  Temperature_Current: number;
  NDVI_lag_1?: number | null;
  NDVI_lag_2?: number | null;
  NDVI_lag_3?: number | null;
  NDVI_lag_4?: number | null;
  NDVI_lag_8?: number | null;
  NDVI_change_1w?: number | null;
  NDVI_change_2w?: number | null;
  NDVI_change_4w?: number | null;
  Rainfall_lag_1?: number | null;
  Rainfall_lag_2?: number | null;
  Rainfall_lag_4?: number | null;
  Rainfall_rolling_2w?: number | null;
  Rainfall_rolling_4w?: number | null;
  Rainfall_rolling_8w?: number | null;
  Temperature_lag_1?: number | null;
  Temperature_lag_2?: number | null;
  Temperature_lag_4?: number | null;
  Temperature_rolling_2w?: number | null;
  Temperature_rolling_4w?: number | null;
  Temperature_rolling_8w?: number | null;
  Week_Sin: number;
  Week_Cos: number;
  Month_Sin: number;
  Month_Cos: number;
  Latitude: number;
  Longitude: number;
}

export interface NdviFeatureAttribution {
  feature_name: string;
  feature_value?: number | null;
  shap_value: number;
  direction: string;
  contribution_magnitude: number;
}

export interface NdviExplanation {
  base_value: number;
  reconstructed_prediction: number;
  additivity_error: number;
  attributions: NdviFeatureAttribution[];
}

export interface NdviModelInfo {
  model_name: string;
  model_version: string;
  feature_contract_version: string;
  feature_count: number;
}

export interface NdviPredictionResponse {
  predicted_ndvi: number;
  current_ndvi: number;
  predicted_delta: number;
  forecast_horizon: string;
  target_variable: string;
  baseline_persistence_ndvi: number;
  explanation: NdviExplanation;
  model: NdviModelInfo;
  disclaimer: string;
}
