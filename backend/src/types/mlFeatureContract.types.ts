/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * TypeScript Definitions for Feature Contract v1.1
 */

import { z } from 'zod';
import {
  mlFeatureContractV1_1Schema,
  CANONICAL_FEATURE_NAMES,
} from '../validators/mlFeatureContract.validator.js';

export { CANONICAL_FEATURE_NAMES };

export type MLFeatureContractV1_1 = z.infer<typeof mlFeatureContractV1_1Schema>;

export interface HourlyWeatherRecordInput {
  observedAt: Date;
  rainfallMm: number;
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  windGustKmh: number;
}

export interface NdviObservationRecordInput {
  observedAt: Date;
  meanNdvi: number;
  validPixelPercentage?: number;
  cloudCoverage?: number | null;
}

export interface FarmAreaInput {
  farmArea: number;
  farmAreaUnit: string;
  boundary?: {
    calculatedAreaHectares?: number | null;
  } | null;
}

export interface FeatureEngineeringOptions {
  referenceTime?: Date;
}
