/**
 * Module 7: NDVI Calculator Utility
 * Implements standard Normalized Difference Vegetation Index (NDVI) formula for Sentinel-2 satellite imagery:
 *
 * Sentinel-2 Bands:
 * - B04: Red (central wavelength ~665 nm)
 * - B08: Near-Infrared / NIR (central wavelength ~842 nm)
 *
 * Mathematical Formula:
 * NDVI = (B08 - B04) / (B08 + B04)
 *       = (NIR - Red) / (NIR + Red)
 *
 * Invariant:
 * - Range: [-1.0, 1.0]
 * - Dense green vegetation typically exhibits NDVI 0.6 to 0.9.
 * - Sparse vegetation or stressed crops exhibit NDVI 0.2 to 0.5.
 * - Bare soil exhibits NDVI near 0.1 to 0.2.
 * - Water, clouds, and snow exhibit negative NDVI values.
 * - Zero denominator (NIR + Red === 0) is invalid and rejected.
 * - Values outside [-1, 1] are NOT silently clamped; they are strictly rejected.
 */

import { AppError } from './apiError.js';

export interface NdviCalculationInput {
  nir: number; // Sentinel-2 B08
  red: number; // Sentinel-2 B04
}

/**
 * Calculates NDVI given NIR (B08) and Red (B04) surface reflectance values.
 *
 * @param nir Near-Infrared band reflectance (Sentinel-2 B08)
 * @param red Red band reflectance (Sentinel-2 B04)
 * @param precision Optional decimal places (defaults to 4)
 * @returns Normalized Difference Vegetation Index rounded to the specified precision
 * @throws AppError 400 Bad Request if inputs are non-numeric, denominator is zero, or result is out-of-bounds
 */
export function calculateNdvi(nir: number, red: number, precision: number = 4): number {
  if (typeof nir !== 'number' || !isFinite(nir)) {
    throw AppError.badRequest(`Invalid NIR band (B08) value: '${nir}'. Must be a finite number.`);
  }

  if (typeof red !== 'number' || !isFinite(red)) {
    throw AppError.badRequest(`Invalid Red band (B04) value: '${red}'. Must be a finite number.`);
  }

  const denominator = nir + red;

  // Zero denominator check: division by zero is mathematically undefined
  if (Math.abs(denominator) < 1e-12) {
    throw AppError.badRequest(
      'Division by zero in NDVI calculation: Sum of NIR (B08) and Red (B04) bands is zero.'
    );
  }

  const numerator = nir - red;
  const rawNdvi = numerator / denominator;

  // Mathematical bounds validation [-1.0, 1.0]
  // Do NOT silently clamp invalid values; reject them explicitly
  if (rawNdvi < -1.0 || rawNdvi > 1.0) {
    throw AppError.badRequest(
      `Calculated NDVI value ${rawNdvi} is outside the valid mathematical range [-1, 1].`
    );
  }

  // Preserve 4-decimal precision standard for remote sensing
  const factor = Math.pow(10, precision);
  return Math.round(rawNdvi * factor) / factor;
}
