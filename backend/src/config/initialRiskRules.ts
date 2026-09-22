/**
 * Module 6: Scientifically Documented IMD Initial Risk Rules
 *
 * References:
 * India Meteorological Department (IMD) standard rainfall classification guidelines:
 * - 24-Hour Cumulative Rainfall (Heavy: >= 64.5mm, Very Heavy: >= 115.6mm, Extremely Heavy: >= 204.5mm)
 * - 3-Hour Short-Duration Intensity (Intense: 20-30mm, Very Intense: 30-50mm, Extremely Intense: 50-100mm, Exceptionally Heavy: > 100mm)
 *
 * NOTE: Temperature rules and wind rules are intentionally not included here:
 * - Temperature requires climatological normal and departure from normal values, which are not currently modeled.
 * - Wind thresholds are dependent on crop-specific exposure and will be configured later with sourceType = PROJECT_INDICATOR.
 */

import { CreateRiskRuleInput } from '../types/risk.types.js';

export const INITIAL_IMD_RISK_RULES: readonly CreateRiskRuleInput[] = [
  // ---------------------------------------------------------------------------
  // 24-Hour Rainfall Rules
  // ---------------------------------------------------------------------------
  {
    code: 'HEAVY_RAINFALL_24H',
    name: 'Heavy Rainfall - 24 Hour',
    description: 'India Meteorological Department (IMD) standard classification for heavy rainfall over 24 hours (>= 64.5 mm).',
    hazardType: 'HEAVY_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 64.5,
    thresholdUnit: 'MM',
    observationWindow: '24_HOURS',
    severity: 'HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall classification: 24-hour rainfall of 64.5 mm or more is classified as heavy rainfall.',
    isActive: true,
  },
  {
    code: 'VERY_HEAVY_RAINFALL_24H',
    name: 'Very Heavy Rainfall - 24 Hour',
    description: 'India Meteorological Department (IMD) standard classification for very heavy rainfall over 24 hours (>= 115.6 mm).',
    hazardType: 'HEAVY_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 115.6,
    thresholdUnit: 'MM',
    observationWindow: '24_HOURS',
    severity: 'VERY_HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall classification: 115.6 mm or more and below 204.5 mm is very heavy rainfall.',
    isActive: true,
  },
  {
    code: 'EXTREME_RAINFALL_24H',
    name: 'Extremely Heavy Rainfall - 24 Hour',
    description: 'India Meteorological Department (IMD) standard classification for extremely heavy rainfall over 24 hours (>= 204.5 mm).',
    hazardType: 'HEAVY_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 204.5,
    thresholdUnit: 'MM',
    observationWindow: '24_HOURS',
    severity: 'VERY_HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall classification: 204.5 mm or more is extremely heavy rainfall.',
    isActive: true,
  },

  // ---------------------------------------------------------------------------
  // 3-Hour Rainfall Intensity Rules
  // ---------------------------------------------------------------------------
  {
    code: 'INTENSE_RAINFALL_3H',
    name: 'Intense Rainfall - 3 Hour',
    description: 'India Meteorological Department (IMD) short-duration rainfall intensity classification (20–30 mm in 3 hours).',
    hazardType: 'INTENSE_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 20.0,
    thresholdUnit: 'MM',
    observationWindow: '3_HOURS',
    severity: 'HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall intensity classification: 20–30 mm in 3 hours is intense rainfall.',
    isActive: true,
  },
  {
    code: 'VERY_INTENSE_RAINFALL_3H',
    name: 'Very Intense Rainfall - 3 Hour',
    description: 'India Meteorological Department (IMD) short-duration rainfall intensity classification (30–50 mm in 3 hours).',
    hazardType: 'INTENSE_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 30.0,
    thresholdUnit: 'MM',
    observationWindow: '3_HOURS',
    severity: 'VERY_HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall intensity classification: 30–50 mm in 3 hours is very intense rainfall.',
    isActive: true,
  },
  {
    code: 'EXTREMELY_INTENSE_RAINFALL_3H',
    name: 'Extremely Intense Rainfall - 3 Hour',
    description: 'India Meteorological Department (IMD) short-duration rainfall intensity classification (50–100 mm in 3 hours).',
    hazardType: 'INTENSE_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 50.0,
    thresholdUnit: 'MM',
    observationWindow: '3_HOURS',
    severity: 'VERY_HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall intensity classification: 50–100 mm in 3 hours is extremely intense rainfall.',
    isActive: true,
  },
  {
    code: 'EXCEPTIONALLY_HEAVY_RAINFALL_3H',
    name: 'Exceptionally Heavy Rainfall - 3 Hour',
    description: 'India Meteorological Department (IMD) short-duration rainfall intensity classification (> 100 mm in 3 hours).',
    hazardType: 'INTENSE_RAINFALL',
    measurement: 'RAINFALL',
    threshold: 100.0,
    thresholdUnit: 'MM',
    observationWindow: '3_HOURS',
    severity: 'VERY_HIGH',
    sourceType: 'OFFICIAL_REFERENCE',
    sourceReference: 'India Meteorological Department rainfall intensity classification: more than 100 mm in 3 hours is exceptionally heavy rainfall.',
    isActive: true,
  },
];
