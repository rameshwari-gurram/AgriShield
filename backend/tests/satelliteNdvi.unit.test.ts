/**
 * Module 7 Stage 7.1: Satellite Data & NDVI Unit Test Suite
 * Tests NDVI calculation formula (B08 NIR, B04 Red), zero denominator handling,
 * valid NDVI range validation, non-clamping behavior, cloud percentage validation,
 * valid pixel percentage validation, normalized DTO mapping, and provider abstraction behavior.
 * Zero network dependencies (fully isolated and mocked).
 */

import { calculateNdvi } from '../src/utils/ndvi.calculator.js';
import {
  validateNdviValue,
  validatePercentage,
  validateCloudCoverage,
  validateValidPixelPercentage,
  validateFarmId,
  validateObservationTimestamp,
  validateNdviMetrics,
  validateSatelliteObservation,
  validateNormalizedObservationPair,
} from '../src/validators/satellite.validator.js';
import { CopernicusSatelliteProvider } from '../src/providers/copernicus.provider.js';
import {
  ISatelliteProvider,
  GeoJSONPolygon,
  NormalizedNdviObservationDTO,
  RawCopernicusStatisticalResponse,
} from '../src/types/satellite.types.js';
import { AppError } from '../src/utils/apiError.js';

class MockSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'Mock Satellite Provider';
  public callCount: number = 0;
  public mockObservations: NormalizedNdviObservationDTO[] = [];

  async fetchNdviObservations(
    boundary: GeoJSONPolygon,
    dateRange: { from: Date; to: Date }
  ): Promise<NormalizedNdviObservationDTO[]> {
    this.callCount++;
    if (!boundary || boundary.type !== 'Polygon') {
      throw AppError.badRequest('Invalid boundary in mock provider');
    }
    if (dateRange.from > dateRange.to) {
      throw AppError.badRequest('Invalid date range in mock provider');
    }
    return this.mockObservations;
  }
}

async function runSatelliteNdviUnitTests() {
  console.log('🧪 Running Module 7 Stage 7.1: Satellite Data & NDVI Unit Tests...\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  };

  // ===========================================================================
  // 1. NDVI Calculation Formula (Sentinel-2 B08 NIR & B04 Red)
  // ===========================================================================
  console.log('--- 1. NDVI Calculation Tests (Sentinel-2 B08 - B04) / (B08 + B04) ---');

  // Dense green vegetation (high NIR, low Red absorption)
  const denseVegetation = calculateNdvi(0.8, 0.2);
  assert(denseVegetation === 0.6, '1.1 Dense vegetation (NIR=0.8, Red=0.2) yields NDVI 0.6000');

  // Stressed / sparse vegetation
  const sparseVegetation = calculateNdvi(0.5, 0.3);
  assert(sparseVegetation === 0.25, '1.2 Sparse vegetation (NIR=0.5, Red=0.3) yields NDVI 0.2500');

  // Bare soil (moderate NIR and Red)
  const bareSoil = calculateNdvi(0.25, 0.2);
  assert(bareSoil === 0.1111, '1.3 Bare soil (NIR=0.25, Red=0.20) yields NDVI 0.1111');

  // Deep clear water (absorbs NIR strongly -> negative NDVI)
  const waterBody = calculateNdvi(0.05, 0.15);
  assert(waterBody === -0.5, '1.4 Water body (NIR=0.05, Red=0.15) yields negative NDVI -0.5000');

  // Precision preservation: 4 decimal places
  const preciseNdvi = calculateNdvi(0.65432, 0.23456);
  const expectedPrecise = Number(((0.65432 - 0.23456) / (0.65432 + 0.23456)).toFixed(4));
  assert(preciseNdvi === expectedPrecise, `1.5 Preserves 4 decimal places precision (${preciseNdvi})`);

  // ===========================================================================
  // 2. Zero Denominator Handling
  // ===========================================================================
  console.log('\n--- 2. Zero Denominator Handling ---');

  let zeroZeroCaught = false;
  try {
    calculateNdvi(0, 0);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Division by zero')) {
      zeroZeroCaught = true;
    }
  }
  assert(zeroZeroCaught, '2.1 NIR=0 and Red=0 throws 400 Bad Request (division by zero)');

  let cancellingSumCaught = false;
  try {
    calculateNdvi(0.5, -0.5);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Division by zero')) {
      cancellingSumCaught = true;
    }
  }
  assert(cancellingSumCaught, '2.2 NIR=0.5 and Red=-0.5 (sum=0) throws 400 Bad Request');

  // Non-numeric band inputs
  let nanBandCaught = false;
  try {
    calculateNdvi(NaN, 0.2);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid NIR band')) {
      nanBandCaught = true;
    }
  }
  assert(nanBandCaught, '2.3 NaN band input throws 400 Bad Request');

  // ===========================================================================
  // 3. Valid NDVI Range & Non-Clamping Validation
  // ===========================================================================
  console.log('\n--- 3. NDVI Range & Non-Clamping Validation [-1.0, 1.0] ---');

  // Boundary checks
  assert(validateNdviValue(-1.0) === -1.0, '3.1 Boundary value -1.0 is valid');
  assert(validateNdviValue(1.0) === 1.0, '3.2 Boundary value +1.0 is valid');
  assert(validateNdviValue(0.0) === 0.0, '3.3 Neutral value 0.0 is valid');
  assert(validateNdviValue(0.7245) === 0.7245, '3.4 Mid-range value 0.7245 is valid');

  // Rejection of values outside [-1, 1] without silent clamping
  let outOfBoundsHighCaught = false;
  try {
    validateNdviValue(1.05);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be between -1.0 and 1.0')) {
      outOfBoundsHighCaught = true;
    }
  }
  assert(outOfBoundsHighCaught, '3.5 NDVI > 1.0 (1.05) rejected with 400 (not clamped)');

  let outOfBoundsLowCaught = false;
  try {
    validateNdviValue(-1.01);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be between -1.0 and 1.0')) {
      outOfBoundsLowCaught = true;
    }
  }
  assert(outOfBoundsLowCaught, '3.6 NDVI < -1.0 (-1.01) rejected with 400 (not clamped)');

  // Calculation bounds validation
  let outOfBoundsCalcCaught = false;
  try {
    // If bands produce value outside [-1, 1] (e.g. negative red exceeding nir)
    calculateNdvi(-0.8, 0.2);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('outside the valid mathematical range')) {
      outOfBoundsCalcCaught = true;
    }
  }
  assert(outOfBoundsCalcCaught, '3.7 Out-of-bounds calculation result is rejected with 400 Bad Request');

  // ===========================================================================
  // 4. Cloud Coverage Percentage Validation [0.0, 100.0]%
  // ===========================================================================
  console.log('\n--- 4. Cloud Coverage Percentage Validation ---');

  assert(validateCloudCoverage(0.0) === 0.0, '4.1 0.0% cloud coverage is valid');
  assert(validateCloudCoverage(100.0) === 100.0, '4.2 100.0% cloud coverage is valid');
  assert(validateCloudCoverage(15.75) === 15.75, '4.3 15.75% cloud coverage is valid');

  let negativeCloudCaught = false;
  try {
    validateCloudCoverage(-0.1);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be between 0.0 and 100.0')) {
      negativeCloudCaught = true;
    }
  }
  assert(negativeCloudCaught, '4.4 Negative cloud coverage (-0.1%) rejected with 400 Bad Request');

  let excessCloudCaught = false;
  try {
    validateCloudCoverage(100.1);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be between 0.0 and 100.0')) {
      excessCloudCaught = true;
    }
  }
  assert(excessCloudCaught, '4.5 Excess cloud coverage (100.1%) rejected with 400 Bad Request');

  assert(validateCloudCoverage(null) === null, '4.6 null cloud coverage is accepted (sensor data absent)');
  assert(validateCloudCoverage(undefined) === null, '4.7 undefined cloud coverage is accepted as null');

  // ===========================================================================
  // 5. Valid Pixel Percentage Validation [0.0, 100.0]%
  // ===========================================================================
  console.log('\n--- 5. Valid Pixel Percentage Validation ---');

  assert(validateValidPixelPercentage(0.0) === 0.0, '5.1 0.0% valid pixel percentage is valid');
  assert(validateValidPixelPercentage(100.0) === 100.0, '5.2 100.0% valid pixel percentage is valid');
  assert(validateValidPixelPercentage(98.5) === 98.5, '5.3 98.5% valid pixel percentage is valid');

  let negativePixelsCaught = false;
  try {
    validateValidPixelPercentage(-5.0);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be between 0.0 and 100.0')) {
      negativePixelsCaught = true;
    }
  }
  assert(negativePixelsCaught, '5.4 Negative pixel percentage (-5.0%) rejected with 400 Bad Request');

  let excessPixelsCaught = false;
  try {
    validateValidPixelPercentage(105.0);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be between 0.0 and 100.0')) {
      excessPixelsCaught = true;
    }
  }
  assert(excessPixelsCaught, '5.5 Excess pixel percentage (105.0%) rejected with 400 Bad Request');

  // Generic validatePercentage
  assert(validatePercentage(50, 'customField') === 50, '5.6 Generic validatePercentage works for 50%');

  // ===========================================================================
  // 6. NDVI Metrics Consistency Validation (min <= mean <= max)
  // ===========================================================================
  console.log('\n--- 6. NDVI Metrics Consistency Validation ---');

  const validMetrics = validateNdviMetrics({
    meanNdvi: 0.65,
    minNdvi: 0.40,
    maxNdvi: 0.85,
    validPixelPercentage: 99.0,
  });
  assert(validMetrics.meanNdvi === 0.65, '6.1 Consistent metrics validated successfully');

  let minGreaterThanMaxCaught = false;
  try {
    validateNdviMetrics({
      meanNdvi: 0.50,
      minNdvi: 0.80, // min > max!
      maxNdvi: 0.40,
      validPixelPercentage: 90.0,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('cannot be greater than maxNdvi')) {
      minGreaterThanMaxCaught = true;
    }
  }
  assert(minGreaterThanMaxCaught, '6.2 minNdvi > maxNdvi rejected with 400 Bad Request');

  let meanBelowMinCaught = false;
  try {
    validateNdviMetrics({
      meanNdvi: 0.20, // mean < min!
      minNdvi: 0.40,
      maxNdvi: 0.80,
      validPixelPercentage: 90.0,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must fall between')) {
      meanBelowMinCaught = true;
    }
  }
  assert(meanBelowMinCaught, '6.3 meanNdvi < minNdvi rejected with 400 Bad Request');

  let meanAboveMaxCaught = false;
  try {
    validateNdviMetrics({
      meanNdvi: 0.90, // mean > max!
      minNdvi: 0.40,
      maxNdvi: 0.80,
      validPixelPercentage: 90.0,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must fall between')) {
      meanAboveMaxCaught = true;
    }
  }
  assert(meanAboveMaxCaught, '6.4 meanNdvi > maxNdvi rejected with 400 Bad Request');

  // ===========================================================================
  // 7. Satellite Observation Metadata Validation
  // ===========================================================================
  console.log('\n--- 7. Satellite Observation Metadata Validation ---');

  const validSat = validateSatelliteObservation({
    observedAt: new Date('2026-09-20T10:30:00Z'),
    provider: 'Copernicus Data Space Ecosystem',
    satellite: 'Sentinel-2',
    productType: 'S2MSI2A',
    productId: 'S2A_MSIL2A_20260920T053641_N0500_R005_T43QDA',
    cloudCoverage: 4.25,
    sourceReference: 'ESA Copernicus CDSE',
  });
  assert(validSat.provider === 'Copernicus Data Space Ecosystem', '7.1 Valid satellite metadata validated');
  assert(validSat.satellite === 'Sentinel-2', '7.2 Satellite identified as Sentinel-2');
  assert(validSat.productType === 'S2MSI2A', '7.3 Product type preserved as S2MSI2A');

  // Missing provider
  let missingProviderCaught = false;
  try {
    validateSatelliteObservation({
      observedAt: new Date(),
      provider: '',
      satellite: 'Sentinel-2',
      productType: 'S2MSI2A',
      productId: 'PROD_1',
      cloudCoverage: 0,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes("provider' is required")) {
      missingProviderCaught = true;
    }
  }
  assert(missingProviderCaught, '7.4 Empty provider rejected with 400 Bad Request');

  // Missing satellite
  let missingSatCaught = false;
  try {
    validateSatelliteObservation({
      observedAt: new Date(),
      provider: 'Copernicus',
      satellite: '   ',
      productType: 'S2MSI2A',
      productId: 'PROD_1',
      cloudCoverage: 0,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes("satellite' name is required")) {
      missingSatCaught = true;
    }
  }
  assert(missingSatCaught, '7.5 Empty satellite rejected with 400 Bad Request');

  // Future timestamp validation
  let futureDateCaught = false;
  try {
    const farFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    validateObservationTimestamp(farFuture);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('cannot be in the future')) {
      futureDateCaught = true;
    }
  }
  assert(futureDateCaught, '7.6 Future observation timestamp rejected with 400 Bad Request');

  // Farm ID UUID validation
  assert(
    validateFarmId('a0000000-0000-4000-8000-000000000001') === 'a0000000-0000-4000-8000-000000000001',
    '7.7 Valid UUID farm ID accepted'
  );

  let invalidFarmIdCaught = false;
  try {
    validateFarmId('not-a-valid-uuid');
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Expected a valid UUID')) {
      invalidFarmIdCaught = true;
    }
  }
  assert(invalidFarmIdCaught, '7.8 Invalid farm ID rejected with 400 Bad Request');

  // Composite Observation Pair Validation
  const validPair = validateNormalizedObservationPair({
    observedAt: new Date('2026-09-20T10:30:00Z'),
    satellite: validSat,
    ndvi: validMetrics,
  });
  assert(validPair.ndvi.meanNdvi === 0.65, '7.9 Composite observation pair validated');

  // ===========================================================================
  // 8. Normalized DTO Mapping (Isolating Vendor Payloads)
  // ===========================================================================
  console.log('\n--- 8. Normalized DTO Mapping Tests ---');

  const provider = new CopernicusSatelliteProvider();

  const mockRawCopernicusResponse: RawCopernicusStatisticalResponse = {
    data: [
      {
        interval: {
          from: '2026-09-20T05:36:41Z',
          to: '2026-09-20T05:36:50Z',
        },
        outputs: {
          data: {
            bands: {
              NDVI: {
                stats: {
                  min: 0.1245,
                  max: 0.8123,
                  mean: 0.6432,
                  stDev: 0.0841,
                  sampleCount: 1540,
                },
              },
              B04: {
                stats: { min: 0.02, max: 0.25, mean: 0.08, sampleCount: 1540 },
              },
              B08: {
                stats: { min: 0.15, max: 0.85, mean: 0.45, sampleCount: 1540 },
              },
            },
          },
        },
      },
    ],
    status: 'OK',
  };

  const normalized = provider.normalizeStatisticalResponse(mockRawCopernicusResponse, {
    productId: 'S2B_MSIL2A_20260920T053641_N0500_R005_T43QDA',
    satellite: 'Sentinel-2B',
    productType: 'S2MSI2A',
    cloudCoverage: 2.5,
  });

  assert(Array.isArray(normalized), '8.1 Normalization produces an array');
  assert(normalized.length === 1, '8.2 Exactly one normalized observation extracted');

  const item = normalized[0];
  assert(item.observedAt.toISOString() === '2026-09-20T05:36:41.000Z', '8.3 observedAt ISO timestamp preserved');
  assert(item.satellite.provider === 'Copernicus Data Space Ecosystem', '8.4 Provider attributed correctly');
  assert(item.satellite.satellite === 'Sentinel-2B', '8.5 Satellite constellation mapped');
  assert(item.satellite.productType === 'S2MSI2A', '8.6 Product type mapped');
  assert(item.satellite.productId === 'S2B_MSIL2A_20260920T053641_N0500_R005_T43QDA', '8.7 Product ID preserved');
  assert(item.satellite.cloudCoverage === 2.5, '8.8 Cloud coverage mapped');
  assert(item.ndvi.meanNdvi === 0.6432, '8.9 meanNdvi mapped from Copernicus NDVI stats');
  assert(item.ndvi.minNdvi === 0.1245, '8.10 minNdvi mapped from Copernicus NDVI stats');
  assert(item.ndvi.maxNdvi === 0.8123, '8.11 maxNdvi mapped from Copernicus NDVI stats');
  assert(item.ndvi.validPixelPercentage === 100.0, '8.12 validPixelPercentage computed');

  // Verify raw structures are NOT exposed on normalized DTO
  const topKeys = Object.keys(item);
  assert(!topKeys.includes('interval'), '8.13 Normalized DTO does not leak raw "interval" object');
  assert(!topKeys.includes('outputs'), '8.14 Normalized DTO does not leak raw "outputs" object');
  assert(!topKeys.includes('data'), '8.15 Normalized DTO does not leak raw "data" object');
  assert(!topKeys.includes('bands'), '8.16 Normalized DTO does not leak raw "bands" object');

  const ndviKeys = Object.keys(item.ndvi);
  assert(!ndviKeys.includes('stDev'), '8.17 Normalized NDVI metrics DTO does not leak raw "stDev" property');
  assert(!ndviKeys.includes('sampleCount'), '8.18 Normalized NDVI metrics DTO does not leak raw "sampleCount" property');

  const normalizedOmittedCloud = provider.normalizeStatisticalResponse(mockRawCopernicusResponse, {
    productId: 'S2B_MSIL2A_TEST_NOCLOUD',
  });
  assert(normalizedOmittedCloud[0].satellite.cloudCoverage === null, '8.19 Omitted cloudCoverage normalizes to null (not fabricated 0.0)');

  // ===========================================================================
  // 9. Provider Abstraction Behavior & Polygon Validation
  // ===========================================================================
  console.log('\n--- 9. Provider Abstraction Behavior Tests ---');

  // Polygon validation
  const validPolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [73.856, 18.52],
        [73.858, 18.52],
        [73.858, 18.522],
        [73.856, 18.522],
        [73.856, 18.52], // Closed ring
      ],
    ],
  };

  // Valid polygon passes validation
  let polygonValid = true;
  try {
    provider.validatePolygon(validPolygon);
  } catch {
    polygonValid = false;
  }
  assert(polygonValid, '9.1 Valid GeoJSON polygon passes spatial validation');

  // Non-closed polygon ring is rejected
  let unclosedRingCaught = false;
  try {
    provider.validatePolygon({
      type: 'Polygon',
      coordinates: [
        [
          [73.856, 18.52],
          [73.858, 18.52],
          [73.858, 18.522],
          [73.856, 18.522], // Last != First!
        ],
      ],
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must match last coordinate')) {
      unclosedRingCaught = true;
    }
  }
  assert(unclosedRingCaught, '9.2 Unclosed polygon ring rejected with 400 Bad Request');

  // Out of bounds coordinates
  let outOfBoundsLonCaught = false;
  try {
    provider.validatePolygon({
      type: 'Polygon',
      coordinates: [
        [
          [195.0, 18.52], // Longitude > 180!
          [195.0, 18.53],
          [195.01, 18.53],
          [195.0, 18.52],
        ],
      ],
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid longitude')) {
      outOfBoundsLonCaught = true;
    }
  }
  assert(outOfBoundsLonCaught, '9.3 Out-of-bounds coordinate rejected with 400 Bad Request');

  // Date range validation
  const validDateRange = {
    from: new Date('2026-09-01T00:00:00Z'),
    to: new Date('2026-09-20T00:00:00Z'),
  };
  let dateRangeValid = true;
  try {
    provider.validateDateRange(validDateRange);
  } catch {
    dateRangeValid = false;
  }
  assert(dateRangeValid, '9.4 Valid chronological date range passes validation');

  let reversedDateRangeCaught = false;
  try {
    provider.validateDateRange({
      from: new Date('2026-09-20T00:00:00Z'),
      to: new Date('2026-09-01T00:00:00Z'), // from > to!
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must be before or equal to')) {
      reversedDateRangeCaught = true;
    }
  }
  assert(reversedDateRangeCaught, '9.5 Reversed date range (from > to) rejected with 400 Bad Request');

  // Clean integration boundary error when credentials not configured
  const unconfiguredProvider = new CopernicusSatelliteProvider(undefined, {
    clientId: '',
    clientSecret: '',
  });
  let integrationBoundaryCaught = false;
  try {
    await unconfiguredProvider.fetchNdviObservations(validPolygon, validDateRange);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503 && err.message.includes('Stage 7.1 integration boundary')) {
      integrationBoundaryCaught = true;
    }
  }
  assert(integrationBoundaryCaught, '9.6 Unconfigured provider reports clean Stage 7.1 integration boundary (503)');

  // Mock Provider Abstraction Behavior
  const mockProvider = new MockSatelliteProvider();
  mockProvider.mockObservations = [item];
  const mockResults = await mockProvider.fetchNdviObservations(validPolygon, validDateRange);
  assert(mockResults.length === 1, '9.7 MockSatelliteProvider implements ISatelliteProvider interface');
  assert(mockProvider.callCount === 1, '9.8 Mock provider recorded 1 call');
  assert(mockProvider.providerName === 'Mock Satellite Provider', '9.9 Provider name abstraction honored');

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log(`\n========================================`);
  console.log(`Satellite & NDVI Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSatelliteNdviUnitTests().catch((error) => {
  console.error('Fatal error during satellite NDVI unit test run:', error);
  process.exit(1);
});
