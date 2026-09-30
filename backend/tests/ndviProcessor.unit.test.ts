/**
 * Module 7 Stage 7.2-C: Sentinel-2 B04/B08 + NDVI Processing Unit Tests
 * AgriShield Parametric Insurance Platform
 *
 * Test Matrix (Required by Stage 7.2-C Specification):
 * 1. TEST 1  — Basic NDVI: Red=0.2, NIR=0.6 -> (0.6 - 0.2)/(0.6 + 0.2) = 0.5000
 * 2. TEST 2  — Zero denominator: Red=0, NIR=0 -> explicit invalid/no-data result (NOT NaN)
 * 3. TEST 3  — Negative NDVI: Red=0.6, NIR=0.2 -> -0.5000
 * 4. TEST 4  — Invalid numeric input: NaN, Infinity, -Infinity, null, undefined -> explicit invalid/no-data
 * 5. TEST 5  — Valid pixel filtering: dataMask === 0 / invalid excluded from mean, min, max
 * 6. TEST 6  — Valid pixel percentage: 8 valid / 10 total -> 80.00%
 * 7. TEST 7  — No valid pixels: all pixels invalid -> explicit no-data result with reason
 * 8. TEST 8  — NDVI range: strictly [-1.0, 1.0], no silent clamping of out-of-bounds values
 * 9. TEST 9  — Farm-level statistics: deterministic set [0.2, 0.4, 0.6, 0.8] -> mean=0.5, min=0.2, max=0.8
 * 10. TEST 10 — Observation-level processing, DTO conversion, and service parity
 */

import {
  calculatePixelNdvi,
  calculateNdvi,
  calculateFarmNdviStatistics,
  processObservationNdvi,
  ndviProcessorService,
  NdviProcessorService,
} from '../src/services/ndviProcessor.service.js';
import { PixelObservationInput, ProcessObservationInput } from '../src/types/satellite.types.js';

async function runNdviProcessorUnitTests() {
  console.log('================================================================');
  console.log('🧪 Running Module 7 Stage 7.2-C: NDVI Processing Unit Tests');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  };

  // ===========================================================================
  // TEST 1 — Basic NDVI: Red = 0.2, NIR = 0.6 -> Expected = 0.5
  // ===========================================================================
  console.log('--- TEST 1: Basic NDVI Calculation ---');
  {
    const red = 0.2; // B04
    const nir = 0.6; // B08
    const result = calculatePixelNdvi(red, nir);

    assert(result.valid === true, '1.1 Basic NDVI result is valid');
    assert(result.ndvi === 0.5, `1.2 Basic NDVI value is 0.5000 (actual: ${result.ndvi})`);
    assert(result.reason === 'VALID', '1.3 Reason is VALID');

    // Test alias calculateNdvi(red, nir)
    const aliasResult = calculateNdvi(red, nir);
    assert(aliasResult.valid === true && aliasResult.ndvi === 0.5, '1.4 calculateNdvi alias produces identical result');
  }

  // ===========================================================================
  // TEST 2 — Zero denominator: Red = 0, NIR = 0 -> Explicit invalid result
  // ===========================================================================
  console.log('\n--- TEST 2: Zero Denominator Handling ---');
  {
    const red = 0;
    const nir = 0;
    const result = calculatePixelNdvi(red, nir);

    assert(result.valid === false, '2.1 Zero denominator is marked invalid');
    assert(result.ndvi === null, '2.2 Zero denominator returns null NDVI (never NaN)');
    assert(!Number.isNaN(result.ndvi), '2.3 Zero denominator explicitly avoids NaN');
    assert(result.reason === 'ZERO_DENOMINATOR', '2.4 Reason is ZERO_DENOMINATOR');

    // Also test near-zero denominator under floating-point threshold (< 1e-12)
    const epsilonResult = calculatePixelNdvi(1e-13, -1e-13);
    assert(epsilonResult.valid === false && epsilonResult.reason === 'ZERO_DENOMINATOR', '2.5 Near-zero floating denominator (< 1e-12) handled safely');
  }

  // ===========================================================================
  // TEST 3 — Negative NDVI: Red = 0.6, NIR = 0.2 -> Expected = -0.5
  // ===========================================================================
  console.log('\n--- TEST 3: Negative NDVI Calculation ---');
  {
    const red = 0.6; // B04 (high red reflectance / water or shadow)
    const nir = 0.2; // B08 (low NIR reflectance)
    const result = calculatePixelNdvi(red, nir);

    assert(result.valid === true, '3.1 Negative NDVI result is valid');
    assert(result.ndvi === -0.5, `3.2 Negative NDVI value is -0.5000 (actual: ${result.ndvi})`);
    assert(result.ndvi !== null && result.ndvi < 0, '3.3 Result is strictly negative');
    assert(result.reason === 'VALID', '3.4 Reason is VALID');
  }

  // ===========================================================================
  // TEST 4 — Invalid Numeric Input Handling
  // ===========================================================================
  console.log('\n--- TEST 4: Invalid Numeric Input Handling ---');
  {
    // 4.1 NaN input
    const nanRed = calculatePixelNdvi(NaN, 0.6);
    assert(nanRed.valid === false && nanRed.ndvi === null && nanRed.reason === 'NON_FINITE_INPUT', '4.1 NaN Red yields explicit NON_FINITE_INPUT');

    const nanNir = calculatePixelNdvi(0.2, NaN);
    assert(nanNir.valid === false && nanNir.ndvi === null && nanNir.reason === 'NON_FINITE_INPUT', '4.2 NaN NIR yields explicit NON_FINITE_INPUT');

    // 4.2 Infinity input
    const infRed = calculatePixelNdvi(Infinity, 0.6);
    assert(infRed.valid === false && infRed.ndvi === null && infRed.reason === 'NON_FINITE_INPUT', '4.3 Infinity Red yields explicit NON_FINITE_INPUT');

    const negInfNir = calculatePixelNdvi(0.2, -Infinity);
    assert(negInfNir.valid === false && negInfNir.ndvi === null && negInfNir.reason === 'NON_FINITE_INPUT', '4.4 -Infinity NIR yields explicit NON_FINITE_INPUT');

    // 4.3 Missing / undefined / null inputs
    const undefinedRed = calculatePixelNdvi(undefined, 0.6);
    assert(undefinedRed.valid === false && undefinedRed.ndvi === null && undefinedRed.reason === 'MISSING_BAND', '4.5 undefined Red yields explicit MISSING_BAND');

    const nullNir = calculatePixelNdvi(0.2, null);
    assert(nullNir.valid === false && nullNir.ndvi === null && nullNir.reason === 'MISSING_BAND', '4.6 null NIR yields explicit MISSING_BAND');

    // 4.4 Non-numeric string input
    const strRed = calculatePixelNdvi('0.2' as any, 0.6);
    assert(strRed.valid === false && strRed.ndvi === null && strRed.reason === 'NON_FINITE_INPUT', '4.7 String Red input rejected safely');
  }

  // ===========================================================================
  // TEST 5 — Valid Pixel Filtering with dataMask
  // ===========================================================================
  console.log('\n--- TEST 5: Valid Pixel Filtering with dataMask ---');
  {
    // Pixels:
    // P1: Red=0.2, NIR=0.6, dataMask=1 -> NDVI = 0.5000 (VALID)
    // P2: Red=0.1, NIR=0.9, dataMask=1 -> NDVI = 0.8000 (VALID)
    // P3: Red=0.2, NIR=0.6, dataMask=0 -> Excluded (NO_DATA_MASK)
    // P4: Red=0.3, NIR=0.7, dataMask=false -> Excluded (NO_DATA_MASK)
    // P5: Red=0, NIR=0, dataMask=1 -> Excluded (ZERO_DENOMINATOR)

    const pixels: PixelObservationInput[] = [
      { red: 0.2, nir: 0.6, dataMask: 1 },
      { red: 0.1, nir: 0.9, dataMask: 1 },
      { red: 0.2, nir: 0.6, dataMask: 0 },
      { red: 0.3, nir: 0.7, dataMask: false },
      { red: 0, nir: 0, dataMask: 1 },
    ];

    const stats = calculateFarmNdviStatistics(pixels);

    assert(stats.status === 'VALID', '5.1 Status is VALID');
    assert(stats.totalPixelCount === 5, '5.2 Total pixel count is 5');
    assert(stats.validPixelCount === 2, `5.3 Valid pixel count is 2 (actual: ${stats.validPixelCount})`);
    assert(stats.minNdvi === 0.5, `5.4 minNdvi is 0.5000 (actual: ${stats.minNdvi})`);
    assert(stats.maxNdvi === 0.8, `5.5 maxNdvi is 0.8000 (actual: ${stats.maxNdvi})`);
    assert(stats.meanNdvi === 0.65, `5.6 meanNdvi is 0.6500 (actual: ${stats.meanNdvi})`);
    assert(stats.validPixelPercentage === 40.0, `5.7 validPixelPercentage is 40.00% (actual: ${stats.validPixelPercentage})`);
  }

  // ===========================================================================
  // TEST 6 — Valid Pixel Percentage: 8 valid out of 10 total -> 80.00%
  // ===========================================================================
  console.log('\n--- TEST 6: Valid Pixel Percentage Calculation ---');
  {
    const pixels: PixelObservationInput[] = [];
    // 8 valid pixels (NDVI = 0.5)
    for (let i = 0; i < 8; i++) {
      pixels.push({ red: 0.2, nir: 0.6, dataMask: 1 });
    }
    // 2 invalid pixels (masked out)
    for (let i = 0; i < 2; i++) {
      pixels.push({ red: 0.2, nir: 0.6, dataMask: 0 });
    }

    const stats = calculateFarmNdviStatistics(pixels);

    assert(stats.totalPixelCount === 10, '6.1 Total pixel count is 10');
    assert(stats.validPixelCount === 8, '6.2 Valid pixel count is 8');
    assert(stats.validPixelPercentage === 80.0, `6.3 validPixelPercentage is 80.00% (actual: ${stats.validPixelPercentage}%)`);
    assert(stats.meanNdvi === 0.5, '6.4 meanNdvi matches expected 0.5000');
  }

  // ===========================================================================
  // TEST 7 — No Valid Pixels -> Explicit No-Data Result
  // ===========================================================================
  console.log('\n--- TEST 7: No Valid Pixels (All Invalid) Handling ---');
  {
    // Case 7A: All masked out by dataMask
    const allMasked: PixelObservationInput[] = [
      { red: 0.2, nir: 0.6, dataMask: 0 },
      { red: 0.3, nir: 0.7, dataMask: 0 },
    ];
    const statsA = calculateFarmNdviStatistics(allMasked);

    assert(statsA.status === 'NO_DATA', '7.1 Status is NO_DATA when all pixels are masked');
    assert(statsA.meanNdvi === null, '7.2 meanNdvi is null (no fake data fabricated)');
    assert(statsA.minNdvi === null, '7.3 minNdvi is null');
    assert(statsA.maxNdvi === null, '7.4 maxNdvi is null');
    assert(statsA.validPixelPercentage === 0.0, '7.5 validPixelPercentage is 0.00%');
    assert(statsA.validPixelCount === 0, '7.6 validPixelCount is 0');
    assert(statsA.totalPixelCount === 2, '7.7 totalPixelCount is 2');
    assert(statsA.reason === 'NO_VALID_PIXELS', '7.8 Reason preserved as NO_VALID_PIXELS');

    // Case 7B: Empty pixel array
    const emptyStats = calculateFarmNdviStatistics([]);
    assert(emptyStats.status === 'NO_DATA', '7.9 Empty array status is NO_DATA');
    assert(emptyStats.reason === 'EMPTY_INPUT_DATASET', '7.10 Empty array reason is EMPTY_INPUT_DATASET');
  }

  // ===========================================================================
  // TEST 8 — NDVI Range Validation [-1.0, 1.0] (No Silent Clamping)
  // ===========================================================================
  console.log('\n--- TEST 8: NDVI Range Validation [-1.0, 1.0] ---');
  {
    // Normal bounds
    const maxBound = calculatePixelNdvi(0.0, 1.0); // (1 - 0) / (1 + 0) = 1.0
    assert(maxBound.valid === true && maxBound.ndvi === 1.0, '8.1 Upper bound NDVI 1.0 is valid');

    const minBound = calculatePixelNdvi(1.0, 0.0); // (0 - 1) / (0 + 1) = -1.0
    assert(minBound.valid === true && minBound.ndvi === -1.0, '8.2 Lower bound NDVI -1.0 is valid');

    // Negative reflectance leading to impossible values > 1 or < -1
    // (e.g. Red = -0.5, NIR = 1.0 -> (1 - (-0.5)) / (1 + (-0.5)) = 1.5 / 0.5 = 3.0)
    const outOfBounds = calculatePixelNdvi(-0.5, 1.0);
    assert(outOfBounds.valid === false, '8.3 Out-of-bounds value (3.0) is marked invalid');
    assert(outOfBounds.ndvi === null, '8.4 Out-of-bounds value returns null (NOT silently clamped to 1.0)');
    assert(outOfBounds.reason === 'OUT_OF_BOUNDS', '8.5 Reason is OUT_OF_BOUNDS');
  }

  // ===========================================================================
  // TEST 9 — Farm-Level Statistics: Deterministic Set [0.2, 0.4, 0.6, 0.8]
  // ===========================================================================
  console.log('\n--- TEST 9: Deterministic Farm-Level Statistics ---');
  {
    const deterministicNdviValues = [0.2, 0.4, 0.6, 0.8];
    const stats = calculateFarmNdviStatistics(deterministicNdviValues);

    assert(stats.status === 'VALID', '9.1 Status is VALID');
    assert(stats.totalPixelCount === 4, '9.2 Total pixels count is 4');
    assert(stats.validPixelCount === 4, '9.3 Valid pixels count is 4');
    assert(stats.meanNdvi === 0.5, `9.4 meanNdvi is 0.5000 (actual: ${stats.meanNdvi})`);
    assert(stats.minNdvi === 0.2, `9.5 minNdvi is 0.2000 (actual: ${stats.minNdvi})`);
    assert(stats.maxNdvi === 0.8, `9.6 maxNdvi is 0.8000 (actual: ${stats.maxNdvi})`);
    assert(stats.validPixelPercentage === 100.0, `9.7 validPixelPercentage is 100.00% (actual: ${stats.validPixelPercentage}%)`);

    // Verify support for Sentinel-2 band aliases (b04 / b08)
    const aliasPixels: PixelObservationInput[] = [
      { b04: 0.2, b08: 0.6, dataMask: 1 }, // 0.5
      { b04: 0.1, b08: 0.9, dataMask: 1 }, // 0.8
    ];
    const aliasStats = calculateFarmNdviStatistics(aliasPixels);
    assert(aliasStats.validPixelCount === 2 && aliasStats.meanNdvi === 0.65, '9.8 Supports Sentinel-2 b04/b08 band aliases seamlessly');
  }

  // ===========================================================================
  // TEST 10 — Observation-Level Processing, DTO Conversion & Service Class Parity
  // ===========================================================================
  console.log('\n--- TEST 10: Observation-Level Processing & Service Parity ---');
  {
    const input: ProcessObservationInput = {
      farmId: 'test-farm-uuid-1234',
      observedAt: '2026-09-20T10:30:00.000Z',
      provider: 'Copernicus Data Space Ecosystem',
      satellite: 'Sentinel-2',
      productType: 'S2MSI2A',
      productId: 'STAT_AGG_S2L2A_20260920T103000Z',
      cloudCoverage: 12.5,
      sourceReference: 'Copernicus Sentinel Hub Statistical API v1',
      pixels: [
        { red: 0.2, nir: 0.6, dataMask: 1 }, // 0.5
        { red: 0.3, nir: 0.7, dataMask: 1 }, // 0.4
        { red: 0.1, nir: 0.9, dataMask: 1 }, // 0.8
        { red: 0.0, nir: 0.0, dataMask: 0 }, // no-data
      ],
    };

    const processed = processObservationNdvi(input);

    assert(processed.farmId === 'test-farm-uuid-1234', '10.1 Preserves farmId');
    assert(processed.statistics.status === 'VALID', '10.2 Statistics status is VALID');
    assert(processed.statistics.validPixelCount === 3, '10.3 Evaluated 3 valid pixels');
    assert(processed.statistics.totalPixelCount === 4, '10.4 Evaluated 4 total pixels');
    assert(processed.statistics.validPixelPercentage === 75.0, '10.5 Valid pixel percentage is 75.00%');
    assert(processed.normalizedObservation !== null, '10.6 Normalized observation DTO is created');
    assert(processed.normalizedObservation?.ndvi.meanNdvi === Number(((0.5 + 0.4 + 0.8) / 3).toFixed(4)), '10.7 Mean NDVI matches domain DTO');
    assert(processed.normalizedObservation?.satellite.cloudCoverage === 12.5, '10.8 Cloud coverage preserved');

    // 10.9 Service class instance parity
    const serviceInstance = new NdviProcessorService();
    const servicePix = serviceInstance.calculatePixelNdvi(0.2, 0.6);
    assert(servicePix.valid === true && servicePix.ndvi === 0.5, '10.9 NdviProcessorService class instance works identically');

    const serviceSingleton = ndviProcessorService.calculateNdvi(0.2, 0.6);
    assert(serviceSingleton.valid === true && serviceSingleton.ndvi === 0.5, '10.10 ndviProcessorService singleton operates identically');
  }

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runNdviProcessorUnitTests().catch((err) => {
  console.error('Fatal error in ndviProcessor.unit.test.ts:', err);
  process.exit(1);
});
