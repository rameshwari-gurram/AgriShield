/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-E: Frontend ML Risk Domain Types & Feature Contract v1.1
 *
 * Strictly mirrors the backend Contract v1.1 (17 features) and
 * authoritative MlRiskPredictionDTO serialized from Express REST API.
 */

/**
 * Locked canonical feature ordering as enforced by backend Contract v1.1.
 */
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

export type CanonicalFeatureName = (typeof CANONICAL_FEATURE_NAMES)[number];

/**
 * Complete 17-feature snapshot corresponding to Contract v1.1.
 */
export interface MLFeatureContractV1_1 {
  precipitation_sum_30d: number;
  precipitation_sum_14d: number;
  precipitation_std_30d: number;
  consecutive_dry_days_max: number;
  temp_max_30d: number;
  temp_mean_30d: number;
  temp_amplitude_mean_30d: number;
  heat_wave_hours_30d: number;
  relative_humidity_mean_30d: number;
  vpd_mean_30d: number;
  wind_speed_mean_30d: number;
  wind_gust_max_30d: number;
  ndvi_latest: number | null;
  ndvi_trend_30d: number | null;
  calculated_area_ha: number;
  is_ndvi_available: number;
  is_ndvi_trend_available: number;
}

/**
 * Individual SHAP feature attribution.
 */
export interface FeatureAttribution {
  feature_name: string;
  feature_value: number | null;
  shap_value: number;
  direction: string;
  contribution_magnitude: number;
}

/**
 * Complete SHAP explanation structure explaining raw decision margin.
 */
export interface ExplanationResult {
  base_value: number;
  reconstructed_margin: number;
  additivity_error: number;
  attributions: FeatureAttribution[];
}

/**
 * Model metadata and provenance.
 */
export interface ModelInfo {
  modelName: string;
  modelVersion: string;
  featureContractVersion: string;
}

/**
 * Authoritative response DTO for ML risk evaluation from backend GET /api/v1/farms/:farmId/ml-risk.
 */
export interface MlRiskPredictionDTO {
  id: string;
  farmId: string;
  assessedAt: string;
  inputFingerprint: string;
  predictedClass: 0 | 1;
  calibratedProbability: number;
  rawDecisionMargin: number;
  featureSnapshot: MLFeatureContractV1_1;
  shapExplanation: ExplanationResult;
  model: ModelInfo;
  disclaimer: string;
  createdAt: string;
  isCached: boolean;
}

/**
 * Options for querying farm ML risk.
 */
export interface GetFarmRiskOptions {
  forceRefresh?: boolean;
  token?: string;
}

/**
 * Metadata descriptor for formatting and presenting each feature in the UI.
 */
export interface FeatureMetadata {
  label: string;
  category: 'precipitation' | 'temperature' | 'moisture' | 'wind' | 'remote_sensing' | 'farm';
  unit: string;
  description: string;
}

/**
 * Human-readable metadata dictionary for all 17 canonical features.
 */
export const FEATURE_METADATA_MAP: Record<CanonicalFeatureName, FeatureMetadata> = {
  precipitation_sum_30d: {
    label: '30-Day Cumulative Precipitation',
    category: 'precipitation',
    unit: 'mm',
    description: 'Total rainfall accumulated over the 30-day lookback window (720 hours).',
  },
  precipitation_sum_14d: {
    label: '14-Day Cumulative Precipitation',
    category: 'precipitation',
    unit: 'mm',
    description: 'Recent acute rainfall accumulated over the last 14 days (336 hours).',
  },
  precipitation_std_30d: {
    label: '30-Day Precipitation Daily Std Dev',
    category: 'precipitation',
    unit: 'mm',
    description: 'Standard deviation of 24-hour rainfall sums (sample ddof=1), measuring rainfall volatility.',
  },
  consecutive_dry_days_max: {
    label: 'Max Consecutive Dry Days (30d)',
    category: 'precipitation',
    unit: 'days',
    description: 'Longest continuous run of dry days (< 1.0mm rainfall) in the 30-day window.',
  },
  temp_max_30d: {
    label: '30-Day Peak Maximum Temperature',
    category: 'temperature',
    unit: '°C',
    description: 'Highest hourly temperature recorded across the entire 30-day lookback.',
  },
  temp_mean_30d: {
    label: '30-Day Mean Temperature',
    category: 'temperature',
    unit: '°C',
    description: 'Average hourly temperature across all 720 hours.',
  },
  temp_amplitude_mean_30d: {
    label: '30-Day Mean Diurnal Temperature Range',
    category: 'temperature',
    unit: '°C',
    description: 'Average daily temperature swing (T_max - T_min) across 30 days.',
  },
  heat_wave_hours_30d: {
    label: '30-Day Heat Wave Hours (≥38°C)',
    category: 'temperature',
    unit: 'hours',
    description: 'Total count of hours exceeding 38.0°C in the 30-day window.',
  },
  relative_humidity_mean_30d: {
    label: '30-Day Mean Relative Humidity',
    category: 'moisture',
    unit: '%',
    description: 'Average relative humidity over 720 hours.',
  },
  vpd_mean_30d: {
    label: '30-Day Mean Vapor Pressure Deficit',
    category: 'moisture',
    unit: 'kPa',
    description: 'Atmospheric drying power calculated via Tetens formula.',
  },
  wind_speed_mean_30d: {
    label: '30-Day Mean Sustained Wind Speed',
    category: 'wind',
    unit: 'km/h',
    description: 'Average sustained wind velocity over 30 days.',
  },
  wind_gust_max_30d: {
    label: '30-Day Peak Wind Gust',
    category: 'wind',
    unit: 'km/h',
    description: 'Maximum wind gust recorded across 720 hours.',
  },
  ndvi_latest: {
    label: 'Latest Sentinel-2 Mean NDVI',
    category: 'remote_sensing',
    unit: 'ratio',
    description: 'Mean parcel NDVI from newest valid cloud-filtered Sentinel-2 observation.',
  },
  ndvi_trend_30d: {
    label: '30-Day Sentinel-2 NDVI Trend (OLS)',
    category: 'remote_sensing',
    unit: 'Δ/day',
    description: 'Ordinary least squares linear slope of Sentinel-2 NDVI over the 30-day window.',
  },
  calculated_area_ha: {
    label: 'Effective Parcel Area',
    category: 'farm',
    unit: 'ha',
    description: 'Authoritative spatial area from PostGIS boundary polygon or converted declared area.',
  },
  is_ndvi_available: {
    label: 'NDVI Observation Indicator',
    category: 'remote_sensing',
    unit: 'flag',
    description: '1 if at least one valid Sentinel-2 NDVI observation was available; 0 if missing/clouded out.',
  },
  is_ndvi_trend_available: {
    label: 'NDVI Trend Indicator',
    category: 'remote_sensing',
    unit: 'flag',
    description: '1 if at least 2 distinct NDVI observations were available for slope calculation; 0 if single/missing.',
  },
};

/**
 * 7-Day Ahead Sentinel-2 NDVI Forecast Types
 */
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

export interface NdviForecastModelInfo {
  model_name: string;
  model_version: string;
  feature_contract_version: string;
  feature_count: number;
}

export interface NdviForecastResponse {
  predicted_ndvi: number;
  current_ndvi: number;
  predicted_delta: number;
  forecast_horizon: string;
  target_variable: string;
  baseline_persistence_ndvi: number;
  explanation: NdviExplanation;
  model: NdviForecastModelInfo;
  disclaimer: string;
}

