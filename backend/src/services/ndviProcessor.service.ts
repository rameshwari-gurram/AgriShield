/**
 * Module 7 Stage 7.2-C: Sentinel-2 B04/B08 + NDVI Processing Service
 * AgriShield Parametric Insurance Platform
 *
 * Core Remote Sensing & Radiometric Foundations:
 * - Constellation: Copernicus Sentinel-2 MultiSpectral Instrument (MSI)
 * - Band B04: Red (central wavelength ~665 nm, 10m spatial resolution)
 * - Band B08: Near-Infrared / NIR (central wavelength ~842 nm, 10m spatial resolution)
 *
 * Standard Normalized Difference Vegetation Index (NDVI) Formula:
 *   NDVI = (B08 - B04) / (B08 + B04)
 *        = (NIR - Red) / (NIR + Red)
 *
 * Mathematical Invariants:
 * - Valid Range: Strictly [-1.0, 1.0].
 * - Dense green vegetation typically exhibits NDVI in [0.6, 0.9].
 * - Sparse vegetation or stressed crops exhibit NDVI in [0.2, 0.5].
 * - Bare soil exhibits NDVI near [0.1, 0.2].
 * - Water bodies, cloud tops, and snow typically exhibit negative NDVI values.
 * - Out-of-bounds values are NEVER silently clamped into [-1, 1]; they are rejected as invalid data.
 * - Zero denominator (NIR + Red === 0) is mathematically undefined: returns explicit invalid result (never NaN).
 * - No-data masking: Pixels with dataMask === 0 or non-finite band values are strictly excluded from statistics.
 *
 * Architectural Invariants:
 * - Pure computational service: 100% deterministic, zero DB dependencies, zero HTTP calls, zero frontend code.
 * - Credentials & secrets must never appear in processing or logs.
 * - Domain Terminology: Refers exclusively to "vegetation index", "vegetation stress/change", and "observation".
 *   NDVI reduction is NEVER conflated with or treated as proof of crop destruction or insurance claim validity.
 */

import {
  PixelObservationInput,
  PixelNdviResult,
  PixelNdviValidityReason,
  FarmNdviStatistics,
  ProcessObservationInput,
  ProcessedObservationNdviResult,
  NormalizedNdviObservationDTO,
  NormalizedSatelliteObservationDTO,
  NormalizedNdviMetricsDTO,
} from '../types/satellite.types.js';

export type { PixelNdviValidityReason };

/**
 * Calculates NDVI for a single pixel or radiometric sample given Red (B04) and NIR (B08).
 *
 * @param red Sentinel-2 B04 surface reflectance (665 nm)
 * @param nir Sentinel-2 B08 surface reflectance (842 nm)
 * @param dataMask Optional pixel validity mask (1 or true = valid parcel pixel, 0 or false = no-data / outside boundary)
 * @param precision Decimal places to preserve (defaults to 4)
 * @returns PixelNdviResult indicating validity, computed numeric NDVI, and detailed reason
 */
export function calculatePixelNdvi(
  red: unknown,
  nir: unknown,
  dataMask?: unknown,
  precision: number = 4
): PixelNdviResult {
  // 1. Explicit dataMask validation (Copernicus parcel clipping mask)
  if (dataMask !== undefined && dataMask !== null) {
    if (dataMask === 0 || dataMask === false) {
      return {
        valid: false,
        ndvi: null,
        reason: 'NO_DATA_MASK',
      };
    }
  }

  // 2. Band existence check
  if (red === undefined || red === null) {
    return {
      valid: false,
      ndvi: null,
      reason: 'MISSING_BAND',
    };
  }

  if (nir === undefined || nir === null) {
    return {
      valid: false,
      ndvi: null,
      reason: 'MISSING_BAND',
    };
  }

  // 3. Finite numeric validation (explicit check for NaN, Infinity, -Infinity, non-number)
  if (typeof red !== 'number' || isNaN(red) || !isFinite(red)) {
    return {
      valid: false,
      ndvi: null,
      reason: 'NON_FINITE_INPUT',
    };
  }

  if (typeof nir !== 'number' || isNaN(nir) || !isFinite(nir)) {
    return {
      valid: false,
      ndvi: null,
      reason: 'NON_FINITE_INPUT',
    };
  }

  // 4. Zero denominator check (division by zero is mathematically undefined)
  const denominator = nir + red;
  if (Math.abs(denominator) < 1e-12) {
    return {
      valid: false,
      ndvi: null,
      reason: 'ZERO_DENOMINATOR',
    };
  }

  // 5. Standard normalized difference computation: (NIR - Red) / (NIR + Red)
  const numerator = nir - red;
  const rawNdvi = numerator / denominator;

  // 6. Strict mathematical bounds validation [-1.0, 1.0]
  // Do NOT silently clamp invalid values; report them as out-of-bounds
  if (isNaN(rawNdvi) || !isFinite(rawNdvi) || rawNdvi < -1.0 || rawNdvi > 1.0) {
    return {
      valid: false,
      ndvi: null,
      reason: 'OUT_OF_BOUNDS',
    };
  }

  // 7. Remote sensing precision preservation (standard 4 decimal places)
  const factor = Math.pow(10, precision);
  const ndvi = Math.round(rawNdvi * factor) / factor;

  return {
    valid: true,
    ndvi,
    reason: 'VALID',
  };
}

/**
 * Direct alias for calculatePixelNdvi using standard (red, nir) parameter convention.
 */
export function calculateNdvi(
  red: unknown,
  nir: unknown,
  dataMask?: unknown,
  precision: number = 4
): PixelNdviResult {
  return calculatePixelNdvi(red, nir, dataMask, precision);
}

/**
 * Calculates farm-level aggregate NDVI statistics from an array of pixel observations or samples.
 *
 * Filters invalid/no-data pixels strictly and produces:
 * - meanNdvi: arithmetic mean of valid parcel pixels (4 decimals)
 * - minNdvi: minimum valid NDVI value within parcel (4 decimals)
 * - maxNdvi: maximum valid NDVI value within parcel (4 decimals)
 * - validPixelPercentage: ratio of valid pixels to total evaluated pixels (2 decimals)
 * - validPixelCount: number of valid pixels evaluated
 * - totalPixelCount: total number of pixels evaluated
 *
 * If zero valid pixels exist, returns an explicit no-data result with preserved reason.
 *
 * @param pixels Array of PixelObservationInput objects or numeric NDVI values
 * @returns FarmNdviStatistics aggregate summary
 */
export function calculateFarmNdviStatistics(
  pixels: Array<PixelObservationInput | number>
): FarmNdviStatistics {
  if (!Array.isArray(pixels) || pixels.length === 0) {
    return {
      meanNdvi: null,
      minNdvi: null,
      maxNdvi: null,
      validPixelPercentage: 0.0,
      validPixelCount: 0,
      totalPixelCount: 0,
      status: 'NO_DATA',
      reason: 'EMPTY_INPUT_DATASET',
    };
  }

  const totalPixelCount = pixels.length;
  const validNdviValues: number[] = [];

  for (let i = 0; i < totalPixelCount; i++) {
    const item = pixels[i];

    // Case A: Pre-calculated numeric NDVI value passed directly
    if (typeof item === 'number') {
      if (isFinite(item) && !isNaN(item) && item >= -1.0 && item <= 1.0) {
        validNdviValues.push(Number(item.toFixed(4)));
      }
      continue;
    }

    // Case B: PixelObservationInput object
    if (item && typeof item === 'object') {
      // Check if pixel has pre-calculated ndvi field
      if (item.ndvi !== undefined && item.ndvi !== null) {
        // If dataMask indicates invalid pixel, exclude it
        if (item.dataMask === 0 || item.dataMask === false) {
          continue;
        }

        if (
          typeof item.ndvi === 'number' &&
          isFinite(item.ndvi) &&
          !isNaN(item.ndvi) &&
          item.ndvi >= -1.0 &&
          item.ndvi <= 1.0
        ) {
          validNdviValues.push(Number(item.ndvi.toFixed(4)));
        }
        continue;
      }

      // Extract band values (supports both red/nir and b04/b08 naming conventions)
      const red = item.red !== undefined && item.red !== null ? item.red : item.b04;
      const nir = item.nir !== undefined && item.nir !== null ? item.nir : item.b08;

      const pixelResult = calculatePixelNdvi(red, nir, item.dataMask);
      if (pixelResult.valid && pixelResult.ndvi !== null) {
        validNdviValues.push(pixelResult.ndvi);
      }
    }
  }

  const validPixelCount = validNdviValues.length;

  // Zero valid pixels check: return explicit no-data result without fabricating statistics
  if (validPixelCount === 0) {
    return {
      meanNdvi: null,
      minNdvi: null,
      maxNdvi: null,
      validPixelPercentage: 0.0,
      validPixelCount: 0,
      totalPixelCount,
      status: 'NO_DATA',
      reason: 'NO_VALID_PIXELS',
    };
  }

  // Calculate parcel-level aggregate metrics
  const sum = validNdviValues.reduce((acc, val) => acc + val, 0);
  const meanNdvi = Number((sum / validPixelCount).toFixed(4));
  const minNdvi = Number(Math.min(...validNdviValues).toFixed(4));
  const maxNdvi = Number(Math.max(...validNdviValues).toFixed(4));
  const validPixelPercentage = Number(((validPixelCount / totalPixelCount) * 100).toFixed(2));

  return {
    meanNdvi,
    minNdvi,
    maxNdvi,
    validPixelPercentage,
    validPixelCount,
    totalPixelCount,
    status: 'VALID',
  };
}

/**
 * Observation-level processing adapter.
 * Takes observation metadata and pixel dataset, computes farm-level NDVI statistics,
 * and builds a normalized observation result compatible with AgriShield domain DTOs.
 *
 * @param input ProcessObservationInput containing metadata and pixel array
 * @returns ProcessedObservationNdviResult
 */
export function processObservationNdvi(
  input: ProcessObservationInput
): ProcessedObservationNdviResult {
  const observedAt =
    input.observedAt instanceof Date ? input.observedAt : new Date(input.observedAt);

  const provider = input.provider || 'Copernicus Data Space Ecosystem';
  const satellite = input.satellite || 'Sentinel-2';
  const productType = input.productType || 'S2MSI2A';

  let productId = input.productId;
  if (!productId) {
    const dateStr = observedAt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    productId = `STAT_AGG_S2L2A_${dateStr}`;
  }

  const cloudCoverage =
    typeof input.cloudCoverage === 'number' && !isNaN(input.cloudCoverage)
      ? Number(input.cloudCoverage.toFixed(2))
      : null;

  const sourceReference =
    input.sourceReference ||
    'Copernicus Data Space Ecosystem - Sentinel-2 MSI Level-2A Processing';

  // Compute farm-level statistics
  const statistics = calculateFarmNdviStatistics(input.pixels);

  let normalizedObservation: NormalizedNdviObservationDTO | null = null;

  if (
    statistics.status === 'VALID' &&
    statistics.meanNdvi !== null &&
    statistics.minNdvi !== null &&
    statistics.maxNdvi !== null
  ) {
    const satelliteDTO: NormalizedSatelliteObservationDTO = {
      observedAt,
      provider,
      satellite,
      productType,
      productId,
      cloudCoverage,
      sourceReference,
    };

    const ndviDTO: NormalizedNdviMetricsDTO = {
      meanNdvi: statistics.meanNdvi,
      minNdvi: statistics.minNdvi,
      maxNdvi: statistics.maxNdvi,
      validPixelPercentage: statistics.validPixelPercentage,
    };

    normalizedObservation = {
      observedAt,
      satellite: satelliteDTO,
      ndvi: ndviDTO,
    };
  }

  return {
    farmId: input.farmId,
    observedAt,
    provider,
    satellite,
    productType,
    productId,
    cloudCoverage,
    sourceReference,
    statistics,
    normalizedObservation,
  };
}

/**
 * Object-oriented service class providing an injectable interface
 * for pure NDVI processing throughout AgriShield domain layers.
 */
export class NdviProcessorService {
  public calculatePixelNdvi(
    red: unknown,
    nir: unknown,
    dataMask?: unknown,
    precision: number = 4
  ): PixelNdviResult {
    return calculatePixelNdvi(red, nir, dataMask, precision);
  }

  public calculateNdvi(
    red: unknown,
    nir: unknown,
    dataMask?: unknown,
    precision: number = 4
  ): PixelNdviResult {
    return calculateNdvi(red, nir, dataMask, precision);
  }

  public calculateFarmNdviStatistics(
    pixels: Array<PixelObservationInput | number>
  ): FarmNdviStatistics {
    return calculateFarmNdviStatistics(pixels);
  }

  public processObservation(
    input: ProcessObservationInput
  ): ProcessedObservationNdviResult {
    return processObservationNdvi(input);
  }
}

export const ndviProcessorService = new NdviProcessorService();
