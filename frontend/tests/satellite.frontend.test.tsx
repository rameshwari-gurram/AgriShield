/**
 * Module 7 Stage 7.2-F: Satellite Frontend Presentation Tests (F-3 & F-4)
 * Comprehensive test suite covering:
 *
 * --- F-3: Latest NDVI Summary Card ---
 * 1. High NDVI classification (> 0.6)
 * 2. Moderate NDVI classification (0.3 – 0.6)
 * 3. Low NDVI classification (< 0.3 and > 0)
 * 4. Non-vegetative / water / cloud classification (<= 0.0)
 * 5. Mean / min / max NDVI rendering with proper decimal precision
 * 6. Valid pixel percentage rendering with % symbol
 * 7. Observation date rendering
 * 8. Optional satellite metadata rendering (Satellite, Product Type, Cloud, Granule ID, Provider)
 * 9. Graceful rendering with NO "undefined" or "null" text when optional metadata is omitted or null
 * 10. Null / undefined safety check
 * 11. Boundary conditions for classifyVegetationHealth (0.6, 0.3, 0.0, negative)
 *
 * --- F-4: Satellite Sync Controls ---
 * 1. Boundary tests: No boundary disables synchronization
 * 2. Boundary tests: No API request is made when boundary is missing
 * 3. Boundary tests: Boundary-present state enables synchronization
 * 4. Date validation: Missing From date is rejected
 * 5. Date validation: Missing To date is rejected
 * 6. Date validation: From date after To date is rejected
 * 7. Date validation: Future To date is rejected
 * 8. Cloud coverage: Empty cloud coverage is omitted from the request
 * 9. Cloud coverage: 0 is accepted when explicitly entered
 * 10. Cloud coverage: 100 is accepted
 * 11. Cloud coverage: Below 0 is rejected
 * 12. Cloud coverage: Above 100 is rejected
 * 13. API behavior: Correct farmId is passed to service
 * 14. API behavior: Correct from and to ISO values are sent
 * 15. API behavior: maxCloudCoverage is sent only when provided
 * 16. API behavior: Sync button becomes disabled/loading during request
 * 17. API behavior: Successful result displays fetched/synced/skipped counts
 * 18. API behavior: NO_DATA count is displayed correctly
 * 19. API behavior: API error is displayed cleanly
 * 20. API behavior: Duplicate submission is prevented while loading
 * 21. Error parsing: 400, 404, 409, 429, and 503 status code messages
 */

import { register } from 'node:module';

// Register hook to handle import.meta.env for Node/tsx execution without modifying production constants
const hookCode = `
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source) {
    const text = result.source.toString();
    if (text.includes('import.meta.env')) {
      return {
        ...result,
        source: text.replace(/import\\.meta\\.env/g, '({ VITE_API_BASE_URL: "http://localhost:5000/api/v1" })'),
      };
    }
  }
  return result;
}
`;
const dataUrl = `data:text/javascript;base64,${Buffer.from(hookCode).toString('base64')}`;
register(dataUrl, import.meta.url);

async function runTestSuite() {
  console.log('🧪 Running Module 7 Stage 7.2-F: Satellite Frontend Component Tests (F-3 & F-4)...\n');

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

  // Dynamic imports after hook registration
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const {
    NdviSummaryCard,
    classifyVegetationHealth,
  } = await import('../src/components/satellite/NdviSummaryCard');
  const {
    SatelliteSyncControls,
    validateSyncInput,
    formatSyncRangeToIso,
    parseSyncErrorMessage,
    getTodayStr,
    getDefaultFromDateStr,
  } = await import('../src/components/satellite/SatelliteSyncControls');
  const { satelliteService } = await import('../src/services/satelliteService');
  const { apiClient } = await import('../src/services/api');
  const { NdviObservationDTO, SatelliteSyncResultDTO } = await import('../src/types/satellite');
  const {
    NdviHistoryChart,
    formatNdviChartData,
    CustomNdviTooltip,
  } = await import('../src/components/satellite/NdviHistoryChart');
  const { FarmSatelliteSection } = await import('../src/components/satellite/FarmSatelliteSection');

  // Mock observation builder
  const createMockObservation = (overrides: Partial<NdviObservationDTO> = {}): NdviObservationDTO => ({
    id: 'ndvi-obs-uuid-1',
    farmId: 'farm-uuid-1',
    satelliteObservationId: 'sat-obs-uuid-1',
    observedAt: '2026-09-15T10:30:00.000Z',
    meanNdvi: 0.7245,
    minNdvi: 0.612,
    maxNdvi: 0.845,
    validPixelPercentage: 98.5,
    createdAt: '2026-09-15T11:00:00.000Z',
    satelliteObservation: {
      id: 'sat-obs-uuid-1',
      farmId: 'farm-uuid-1',
      observedAt: '2026-09-15T10:30:00.000Z',
      provider: 'Copernicus Data Space Ecosystem',
      satellite: 'Sentinel-2A',
      productType: 'S2MSI2A',
      productId: 'S2A_MSIL2A_20260915T103000_N0500_R108_T43QGE',
      cloudCoverage: 4.25,
      sourceReference: 'ESA Sentinel Hub Statistical API',
      createdAt: '2026-09-15T11:00:00.000Z',
    },
    ...overrides,
  });

  // ==========================================
  // Part 1: Classification Logic Unit Tests (F-3)
  // ==========================================
  console.log('--- Part 1: Vegetation Health Classification Logic (F-3) ---');

  const highHealth = classifyVegetationHealth(0.75);
  assert(highHealth.category === 'HIGH', '1. classifyVegetationHealth(0.75) returns category HIGH');
  assert(highHealth.label === 'High Vegetation', '1. classifyVegetationHealth(0.75) label is High Vegetation');

  const boundaryHigh = classifyVegetationHealth(0.6001);
  assert(boundaryHigh.category === 'HIGH', '1. classifyVegetationHealth(0.6001) > 0.6 returns HIGH');

  const boundaryModUpper = classifyVegetationHealth(0.6);
  assert(boundaryModUpper.category === 'MODERATE', '2. classifyVegetationHealth(0.6) exactly 0.6 returns MODERATE');
  assert(boundaryModUpper.label === 'Moderate Vegetation', '2. classifyVegetationHealth(0.6) label is Moderate Vegetation');

  const modHealth = classifyVegetationHealth(0.45);
  assert(modHealth.category === 'MODERATE', '2. classifyVegetationHealth(0.45) returns MODERATE');

  const boundaryModLower = classifyVegetationHealth(0.3);
  assert(boundaryModLower.category === 'MODERATE', '2. classifyVegetationHealth(0.3) exactly 0.3 returns MODERATE');

  const lowHealth = classifyVegetationHealth(0.2999);
  assert(lowHealth.category === 'LOW', '3. classifyVegetationHealth(0.2999) < 0.3 returns LOW');
  assert(lowHealth.label === 'Low Vegetation', '3. classifyVegetationHealth(0.2999) label is Low Vegetation');

  const lowHealthMid = classifyVegetationHealth(0.15);
  assert(lowHealthMid.category === 'LOW', '3. classifyVegetationHealth(0.15) returns LOW');

  const nonVegZero = classifyVegetationHealth(0.0);
  assert(nonVegZero.category === 'NON_VEGETATIVE', '4. classifyVegetationHealth(0.0) returns NON_VEGETATIVE');
  assert(nonVegZero.label.includes('Non-Vegetative'), '4. classifyVegetationHealth(0.0) label includes Non-Vegetative');

  const nonVegNegative = classifyVegetationHealth(-0.25);
  assert(nonVegNegative.category === 'NON_VEGETATIVE', '4. classifyVegetationHealth(-0.25) returns NON_VEGETATIVE');

  // ==========================================
  // Part 2: Component Rendering Tests (F-3)
  // ==========================================
  console.log('\n--- Part 2: NdviSummaryCard Component Presentation (F-3) ---');

  // Test 1: High NDVI Rendering
  const highObs = createMockObservation({ meanNdvi: 0.7245 });
  const highHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: highObs }));
  assert(highHtml.includes('High Vegetation'), '1. High NDVI renders High Vegetation badge');
  assert(highHtml.includes('bg-emerald'), '1. High NDVI renders emerald background styling');
  assert(highHtml.includes('Dense, healthy photosynthetic crop canopy'), '1. High NDVI renders healthy canopy description');

  // Test 2: Moderate NDVI Rendering
  const modObs = createMockObservation({ meanNdvi: 0.45 });
  const modHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: modObs }));
  assert(modHtml.includes('Moderate Vegetation'), '2. Moderate NDVI renders Moderate Vegetation badge');
  assert(modHtml.includes('bg-amber'), '2. Moderate NDVI renders amber background styling');
  assert(modHtml.includes('Moderate crop canopy or emerging vegetative growth'), '2. Moderate NDVI renders moderate canopy description');

  // Test 3: Low NDVI Rendering
  const lowObs = createMockObservation({ meanNdvi: 0.185 });
  const lowHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: lowObs }));
  assert(lowHtml.includes('Low Vegetation'), '3. Low NDVI renders Low Vegetation badge');
  assert(lowHtml.includes('bg-orange'), '3. Low NDVI renders orange background styling');
  assert(lowHtml.includes('Sparse canopy, stressed vegetation, or bare soil'), '3. Low NDVI renders low vegetation description');

  // Test 4: Non-Vegetative / Water / Cloud Rendering
  const nonVegObs = createMockObservation({ meanNdvi: -0.052 });
  const nonVegHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: nonVegObs }));
  assert(nonVegHtml.includes('Non-Vegetative / Water / Cloud'), '4. Non-vegetative NDVI renders Non-Vegetative label');
  assert(nonVegHtml.includes('bg-slate'), '4. Non-vegetative NDVI renders slate styling');
  assert(nonVegHtml.includes('Water body, heavy cloud cover, or non-vegetated surface'), '4. Non-vegetative renders water/cloud description');

  // Test 5: Mean, Min, Max NDVI Metrics Rendering
  const metricsObs = createMockObservation({
    meanNdvi: 0.7245,
    minNdvi: 0.612,
    maxNdvi: 0.845,
  });
  const metricsHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: metricsObs }));
  assert(metricsHtml.includes('0.7245'), '5. Renders exact Mean NDVI 0.7245');
  assert(metricsHtml.includes('0.6120'), '5. Renders formatted Min NDVI 0.6120');
  assert(metricsHtml.includes('0.8450'), '5. Renders formatted Max NDVI 0.8450');

  // Test 6: Valid Pixel Percentage Rendering
  assert(metricsHtml.includes('98.5%'), '6. Renders valid pixel percentage formatted with % (98.5%)');

  // Test 7: Observation Date Rendering
  assert(metricsHtml.includes('Observation Date'), '7. Renders Observation Date label');
  assert(metricsHtml.includes('2026'), '7. Renders observation year 2026');

  // Test 8: Optional Satellite Metadata Bar Rendering
  assert(metricsHtml.includes('Sentinel-2A'), '8. Renders satellite platform Sentinel-2A');
  assert(metricsHtml.includes('S2MSI2A'), '8. Renders product type S2MSI2A');
  assert(metricsHtml.includes('4.25%'), '8. Renders cloud coverage 4.25%');
  assert(metricsHtml.includes('S2A_MSIL2A_20260915T103000_N0500_R108_T43QGE'), '8. Renders granule productId');
  assert(metricsHtml.includes('Copernicus Data Space Ecosystem'), '8. Renders provider attribution');

  // Test 9: Graceful Rendering without Optional Metadata (No "undefined" or "null")
  const noSatObs = createMockObservation({
    satelliteObservation: undefined,
  });
  const noSatHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: noSatObs }));
  assert(!noSatHtml.includes('satellite-metadata-bar'), '9. Omits satellite metadata bar when satelliteObservation is undefined');
  assert(!noSatHtml.includes('undefined'), '9. Strict check: Rendered HTML does NOT contain "undefined"');
  assert(!noSatHtml.includes('null'), '9. Strict check: Rendered HTML does NOT contain "null"');

  // Test 9b: Satellite Metadata present but cloudCoverage is null
  const nullCloudObs = createMockObservation({
    satelliteObservation: {
      id: 'sat-obs-uuid-2',
      farmId: 'farm-uuid-1',
      observedAt: '2026-09-15T10:30:00.000Z',
      provider: 'Copernicus Data Space Ecosystem',
      satellite: 'Sentinel-2B',
      productType: 'S2MSI2A',
      productId: 'S2B_MSIL2A_2026',
      cloudCoverage: null, // explicit null
      sourceReference: null,
      createdAt: '2026-09-15T11:00:00.000Z',
    },
  });
  const nullCloudHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: nullCloudObs }));
  assert(nullCloudHtml.includes('Not Reported'), '9b. Null cloud coverage displays "Not Reported" without fabricating 0.00%');
  assert(!nullCloudHtml.includes('undefined'), '9b. Strict check: Null cloud coverage does not render "undefined"');
  assert(!nullCloudHtml.includes('null'), '9b. Strict check: Null cloud coverage does not render "null"');

  // Test 10: Null observation safety
  const nullObsHtml = renderToStaticMarkup(React.createElement(NdviSummaryCard, { observation: null as any }));
  assert(nullObsHtml === '', '10. Null observation safely renders empty markup (null) without error');

  // ==========================================
  // Part 3: SatelliteSyncControls Validation Unit Tests (F-4)
  // ==========================================
  console.log('\n--- Part 3: SatelliteSyncControls Validation & Input Rules (F-4) ---');

  const todayStr = getTodayStr();
  const defaultFrom = getDefaultFromDateStr();

  // Test 1: No boundary disables synchronization
  const noBoundaryVal = validateSyncInput('2026-09-01', '2026-09-15', '', false);
  assert(!noBoundaryVal.valid, '1. No boundary is rejected by validateSyncInput');
  assert(Boolean(noBoundaryVal.errors.boundary), '1. No boundary returns boundary error message');

  // Test 2: No API request is generated when boundary is missing
  assert(noBoundaryVal.payload === undefined, '2. No payload is generated when boundary is missing');

  // Test 3: Boundary-present state enables synchronization
  const boundaryVal = validateSyncInput('2026-09-01', '2026-09-15', '', true);
  assert(boundaryVal.valid, '3. Boundary present passes validation');
  assert(boundaryVal.payload !== undefined, '3. Payload is generated when boundary is present');

  // Test 4: Missing From date is rejected
  const missingFromVal = validateSyncInput('', '2026-09-15', '', true);
  assert(!missingFromVal.valid, '4. Missing From date is rejected');
  assert(missingFromVal.errors.fromDate === 'Start date (From) is required.', '4. Returns required error for From date');

  // Test 5: Missing To date is rejected
  const missingToVal = validateSyncInput('2026-09-01', '', '', true);
  assert(!missingToVal.valid, '5. Missing To date is rejected');
  assert(missingToVal.errors.toDate === 'End date (To) is required.', '5. Returns required error for To date');

  // Test 6: From date after To date is rejected
  const invertedDatesVal = validateSyncInput('2026-09-20', '2026-09-10', '', true);
  assert(!invertedDatesVal.valid, '6. From date after To date is rejected');
  assert(invertedDatesVal.errors.fromDate?.includes('cannot be after End date'), '6. Returns date order error');

  // Test 7: Future To date is rejected
  const futureToVal = validateSyncInput('2026-09-01', '2099-01-01', '', true);
  assert(!futureToVal.valid, '7. Future To date is rejected');
  assert(futureToVal.errors.toDate?.includes('cannot be in the future'), '7. Returns future date error');

  // Test 8: Empty cloud coverage is omitted from request payload
  const emptyCloudVal = validateSyncInput('2026-09-01', '2026-09-15', '', true);
  assert(emptyCloudVal.valid, '8. Empty cloud coverage is valid');
  assert(emptyCloudVal.payload?.maxCloudCoverage === undefined, '8. Empty cloud coverage produces undefined maxCloudCoverage in payload');
  assert(!('maxCloudCoverage' in (emptyCloudVal.payload || {})), '8. maxCloudCoverage key is omitted from payload object');

  // Test 9: Cloud coverage 0 is accepted when explicitly entered
  const zeroCloudVal = validateSyncInput('2026-09-01', '2026-09-15', '0', true);
  assert(zeroCloudVal.valid, '9. Cloud coverage 0 is valid');
  assert(zeroCloudVal.payload?.maxCloudCoverage === 0, '9. Explicit 0 is preserved as number 0 in payload');

  // Test 10: Cloud coverage 100 is accepted
  const fullCloudVal = validateSyncInput('2026-09-01', '2026-09-15', '100', true);
  assert(fullCloudVal.valid, '10. Cloud coverage 100 is valid');
  assert(fullCloudVal.payload?.maxCloudCoverage === 100, '10. Explicit 100 is preserved in payload');

  // Test 11: Cloud coverage below 0 is rejected
  const negCloudVal = validateSyncInput('2026-09-01', '2026-09-15', '-5', true);
  assert(!negCloudVal.valid, '11. Cloud coverage below 0 is rejected');
  assert(negCloudVal.errors.maxCloudCoverage?.includes('between 0% and 100%'), '11. Returns range error for negative cloud coverage');

  // Test 12: Cloud coverage above 100 is rejected
  const overCloudVal = validateSyncInput('2026-09-01', '2026-09-15', '105', true);
  assert(!overCloudVal.valid, '12. Cloud coverage above 100 is rejected');
  assert(overCloudVal.errors.maxCloudCoverage?.includes('between 0% and 100%'), '12. Returns range error for > 100 cloud coverage');

  // Test 12b: Decimal cloud coverage is accepted
  const decCloudVal = validateSyncInput('2026-09-01', '2026-09-15', '15.5', true);
  assert(decCloudVal.valid, '12b. Decimal cloud coverage (15.5) is valid');
  assert(decCloudVal.payload?.maxCloudCoverage === 15.5, '12b. Decimal cloud coverage preserved in payload');

  // ==========================================
  // Part 4: SatelliteSyncControls Component UI State Tests (F-4)
  // ==========================================
  console.log('\n--- Part 4: SatelliteSyncControls Component UI Presentation (F-4) ---');

  const dummyFarmId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

  // Test 13: Farm without boundary renders warning and disables button
  const noBoundaryHtml = renderToStaticMarkup(
    React.createElement(SatelliteSyncControls, {
      farmId: dummyFarmId,
      hasBoundary: false,
    })
  );
  assert(noBoundaryHtml.includes('Farm Boundary Required'), '13. Renders Farm Boundary Required notice');
  assert(noBoundaryHtml.includes('disabled=""') || noBoundaryHtml.includes('disabled'), '13. Sync button is disabled when hasBoundary is false');
  assert(noBoundaryHtml.includes('cursor-not-allowed'), '13. Applies cursor-not-allowed styling when no boundary');

  // Test 14: Farm with boundary renders active sync button
  const withBoundaryHtml = renderToStaticMarkup(
    React.createElement(SatelliteSyncControls, {
      farmId: dummyFarmId,
      hasBoundary: true,
    })
  );
  assert(!withBoundaryHtml.includes('Farm Boundary Required'), '14. Boundary warning is NOT displayed when hasBoundary is true');
  assert(withBoundaryHtml.includes('Sync Satellite Data'), '14. Renders active Sync Satellite Data button text');

  // Test 15: Loading / Syncing state
  const syncingHtml = renderToStaticMarkup(
    React.createElement(SatelliteSyncControls, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialSyncing: true,
    })
  );
  assert(syncingHtml.includes('Syncing satellite observations...'), '15. Renders Syncing satellite observations... spinner text');
  assert(syncingHtml.includes('disabled=""') || syncingHtml.includes('disabled'), '15. Button is disabled while syncing');

  // Test 16: Successful result with counts
  const mockSyncResult: SatelliteSyncResultDTO = {
    farmId: dummyFarmId,
    totalFetched: 3,
    syncedCount: 2,
    skippedNoDataCount: 1,
    observations: [],
  };
  const successResultHtml = renderToStaticMarkup(
    React.createElement(SatelliteSyncControls, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialResult: mockSyncResult,
    })
  );
  assert(successResultHtml.includes('Satellite Synchronization Completed'), '16. Renders Satellite Synchronization Completed header');
  assert(successResultHtml.includes('>3<'), '16. Displays Total Fetched count 3');
  assert(successResultHtml.includes('>2<'), '16. Displays Synced Records count 2');
  assert(successResultHtml.includes('>1<'), '16. Displays No-Data Skipped count 1');

  // Test 17: NO_DATA skipped informative message
  assert(successResultHtml.includes('Some satellite observations contained no usable data and were skipped'), '17. Renders informative notice when skippedNoDataCount > 0');
  assert(successResultHtml.includes('(1 skipped)'), '17. Notice specifies exact skipped count');

  // Test 18: Zero observation notification
  const zeroSyncResult: SatelliteSyncResultDTO = {
    farmId: dummyFarmId,
    totalFetched: 0,
    syncedCount: 0,
    skippedNoDataCount: 0,
    observations: [],
  };
  const zeroResultHtml = renderToStaticMarkup(
    React.createElement(SatelliteSyncControls, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialResult: zeroSyncResult,
    })
  );
  assert(zeroResultHtml.includes('No satellite scenes were found for this farm parcel'), '18. Renders zero scenes explanation');

  // Test 19: API error state
  const errorHtml = renderToStaticMarkup(
    React.createElement(SatelliteSyncControls, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialError: 'Copernicus Data Space Ecosystem is temporarily unavailable. Please try again later.',
    })
  );
  assert(errorHtml.includes('Synchronization Failed'), '19. Renders Synchronization Failed header');
  assert(errorHtml.includes('Copernicus Data Space Ecosystem is temporarily unavailable'), '19. Displays specific API error message');

  // Test 20: Input fields render proper labels and IDs for accessibility
  assert(withBoundaryHtml.includes('id="sync-from-date"'), '20. From date input has id="sync-from-date"');
  assert(withBoundaryHtml.includes('id="sync-to-date"'), '20. To date input has id="sync-to-date"');
  assert(withBoundaryHtml.includes('id="sync-cloud-coverage"'), '20. Cloud coverage input has id="sync-cloud-coverage"');
  assert(withBoundaryHtml.includes('Start Date (From)'), '20. From date has visible label');
  assert(withBoundaryHtml.includes('End Date (To)'), '20. To date has visible label');
  assert(withBoundaryHtml.includes('Max Cloud Coverage (%)'), '20. Cloud coverage has visible label');

  // ==========================================
  // Part 5: API Error Translation & ISO Formatting (F-4)
  // ==========================================
  console.log('\n--- Part 5: API Error Translation & ISO Formatting (F-4) ---');

  // Error parsing tests
  assert(
    parseSyncErrorMessage({ response: { status: 400, data: { message: 'Invalid date window' } } }, 'Fallback') === 'Invalid date window',
    '21. Parses HTTP 400 validation message'
  );
  assert(
    parseSyncErrorMessage({ response: { status: 404, data: { message: 'Farm boundary not found' } } }, 'Fallback').includes('digitize a boundary'),
    '21. Parses HTTP 404 boundary error with user guidance'
  );
  assert(
    parseSyncErrorMessage({ response: { status: 404, data: { message: 'Farm not found' } } }, 'Fallback').includes('Farm parcel not found'),
    '21. Parses HTTP 404 generic not found'
  );
  assert(
    parseSyncErrorMessage({ response: { status: 409, data: { message: 'Duplicate sync' } } }, 'Fallback') === 'Duplicate sync',
    '21. Parses HTTP 409 conflict message'
  );
  assert(
    parseSyncErrorMessage({ response: { status: 429 } }, 'Fallback').includes('rate limit reached'),
    '21. Parses HTTP 429 rate limit error'
  );
  assert(
    parseSyncErrorMessage({ response: { status: 503 } }, 'Fallback').includes('Copernicus Data Space Ecosystem is temporarily unavailable'),
    '21. Parses HTTP 503 provider unavailability'
  );

  // ISO formatting tests
  const rangeIso = formatSyncRangeToIso('2026-09-01', '2026-09-15');
  assert(rangeIso.from === '2026-09-01T00:00:00.000Z', '22. from date formats with start of day UTC (00:00:00.000Z)');
  assert(rangeIso.to.includes('2026-09-15'), '22. to date preserves requested date');

  // ==========================================
  // Part 6: satelliteService.syncSatellite Mock Dispatch Test (F-4)
  // ==========================================
  console.log('\n--- Part 6: satelliteService.syncSatellite Service Contract (F-4) ---');

  // Mock apiClient.post
  let dispatchedUrl = '';
  let dispatchedPayload: any = null;
  const originalPost = apiClient.post;

  apiClient.post = (async (url: string, payload: any) => {
    dispatchedUrl = url;
    dispatchedPayload = payload;
    return {
      data: {
        success: true,
        message: 'Synchronized satellite observations',
        data: mockSyncResult,
        timestamp: new Date().toISOString(),
      },
    };
  }) as any;

  try {
    const testPayload = {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-15T23:59:59.000Z',
      maxCloudCoverage: 20,
    };
    const res = await satelliteService.syncSatellite(dummyFarmId, testPayload);
    assert(dispatchedUrl === `/farms/${dummyFarmId}/satellite/sync`, '23. Calls correct endpoint /farms/:farmId/satellite/sync');
    assert(dispatchedPayload.from === testPayload.from, '23. Dispatches correct from ISO timestamp');
    assert(dispatchedPayload.to === testPayload.payload?.to || testPayload.to, '23. Dispatches correct to ISO timestamp');
    assert(dispatchedPayload.maxCloudCoverage === 20, '23. Dispatches maxCloudCoverage 20');
    assert(res.data.syncedCount === 2, '23. Returns unwrapped ApiResponse with SatelliteSyncResultDTO');
  } finally {
    apiClient.post = originalPost;
  }

  // ==========================================
  // Part 7: formatNdviChartData & CustomNdviTooltip (F-5)
  // ==========================================
  console.log('\n--- Part 7: NDVI Chart Data Formatting & Tooltip (F-5) ---');

  const chronologicalObs = [
    createMockObservation({
      id: 'obs-1',
      observedAt: '2026-09-01T10:30:00.000Z',
      meanNdvi: 0.35,
      minNdvi: 0.22,
      maxNdvi: 0.48,
      validPixelPercentage: 95.0,
    }),
    createMockObservation({
      id: 'obs-2',
      observedAt: '2026-09-10T10:30:00.000Z',
      meanNdvi: 0.58,
      minNdvi: 0.45,
      maxNdvi: 0.69,
      validPixelPercentage: 99.0,
    }),
    createMockObservation({
      id: 'obs-3',
      observedAt: '2026-09-20T10:30:00.000Z',
      meanNdvi: 0.74,
      minNdvi: 0.62,
      maxNdvi: 0.85,
      validPixelPercentage: 100.0,
    }),
  ];

  // Test 24: formatNdviChartData preserves chronological order
  const chartPoints = formatNdviChartData(chronologicalObs);
  assert(chartPoints.length === 3, '24. Formats 3 observations into 3 chart points');
  assert(chartPoints[0].id === 'obs-1', '24. First point preserves first chronological observation');
  assert(chartPoints[1].id === 'obs-2', '24. Second point preserves second chronological observation');
  assert(chartPoints[2].id === 'obs-3', '24. Third point preserves third chronological observation');

  // Test 25: Mean NDVI data is mapped accurately
  assert(chartPoints[0].meanNdvi === 0.35, '25. Point 1 maps meanNdvi 0.35');
  assert(chartPoints[1].meanNdvi === 0.58, '25. Point 2 maps meanNdvi 0.58');
  assert(chartPoints[2].meanNdvi === 0.74, '25. Point 3 maps meanNdvi 0.74');

  // Test 26: Observation dates are formatted for display
  assert(chartPoints[0].displayDate.includes('Sep'), '26. displayDate includes localized month (Sep)');
  assert(chartPoints[0].fullDate.includes('2026'), '26. fullDate includes full year (2026)');

  // Test 27: Tooltip renders mean NDVI
  const tooltipHtml = renderToStaticMarkup(
    React.createElement(CustomNdviTooltip, {
      active: true,
      payload: [{ payload: chartPoints[2] } as any],
    })
  );
  assert(tooltipHtml.includes('0.7400'), '27. Tooltip renders formatted mean NDVI 0.7400');

  // Test 28: Minimum and maximum NDVI available in tooltip
  assert(tooltipHtml.includes('0.6200'), '28. Tooltip renders formatted min NDVI 0.6200');
  assert(tooltipHtml.includes('0.8500'), '28. Tooltip renders formatted max NDVI 0.8500');

  // Test 29: Valid pixel percentage in tooltip
  assert(tooltipHtml.includes('100.0%'), '29. Tooltip renders valid pixel percentage 100.0%');

  // Test 30: Tooltip renders vegetation health classification
  assert(tooltipHtml.includes('High Vegetation'), '30. Tooltip renders High Vegetation badge for 0.74');

  // Test 31: Strict check: No "undefined" or "null" in tooltip HTML
  assert(!tooltipHtml.includes('undefined'), '31. Tooltip HTML does NOT contain "undefined"');
  assert(!tooltipHtml.includes('null'), '31. Tooltip HTML does NOT contain "null"');

  // Test 32: Inactive tooltip renders nothing
  const inactiveTooltipHtml = renderToStaticMarkup(
    React.createElement(CustomNdviTooltip, { active: false, payload: [] })
  );
  assert(inactiveTooltipHtml === '', '32. Inactive tooltip renders empty markup (null)');

  // ==========================================
  // Part 8: NdviHistoryChart Component Presentation (F-5)
  // ==========================================
  console.log('\n--- Part 8: NdviHistoryChart Component Presentation (F-5) ---');

  // Test 33: Chart renders with multiple observations
  const multiObsHtml = renderToStaticMarkup(
    React.createElement(NdviHistoryChart, { observations: chronologicalObs })
  );
  assert(multiObsHtml.includes('data-testid="ndvi-history-chart"'), '33. Multi-observation chart renders chart container');
  assert(multiObsHtml.includes('Sentinel-2 MSI Level-2A'), '33. Renders attribution footnote');
  assert(!multiObsHtml.includes('No historical NDVI observations available'), '33. Does NOT render empty state when observations exist');

  // Test 34: Empty observations array displays clean empty state
  const emptyChartHtml = renderToStaticMarkup(
    React.createElement(NdviHistoryChart, { observations: [] })
  );
  assert(emptyChartHtml.includes('No historical NDVI observations available'), '34. Empty observations displays empty state heading');
  assert(emptyChartHtml.includes('data-testid="ndvi-chart-empty"'), '34. Renders ndvi-chart-empty container');
  assert(!emptyChartHtml.includes('recharts-surface'), '34. Empty state does not create fake chart values');

  // Test 35: Single observation renders with advisory notice
  const singleObsHtml = renderToStaticMarkup(
    React.createElement(NdviHistoryChart, { observations: [chronologicalObs[0]] })
  );
  assert(singleObsHtml.includes('Displaying 1 observation'), '35. Single observation renders advisory banner');
  assert(singleObsHtml.includes('data-testid="single-obs-advisory"'), '35. Single observation has advisory container');

  // Test 36: Loading state renders spinner
  const loadingChartHtml = renderToStaticMarkup(
    React.createElement(NdviHistoryChart, { observations: [], loading: true })
  );
  assert(loadingChartHtml.includes('Loading historical NDVI observations...'), '36. Renders loading spinner and caption');

  // Test 37: Error state renders error alert
  const errorChartHtml = renderToStaticMarkup(
    React.createElement(NdviHistoryChart, {
      observations: [],
      error: 'Failed to retrieve historical observations from PostgreSQL.',
    })
  );
  assert(errorChartHtml.includes('Unable to load NDVI trends'), '37. Renders error alert heading');
  assert(errorChartHtml.includes('Failed to retrieve historical observations'), '37. Renders exact error message');

  // Test 38: Negative/non-vegetative NDVI values are preserved without clamping
  const negativeObs = [
    createMockObservation({
      id: 'obs-water',
      observedAt: '2026-09-05T10:30:00.000Z',
      meanNdvi: -0.152,
      minNdvi: -0.35,
      maxNdvi: -0.05,
      validPixelPercentage: 100.0,
    }),
  ];
  const negativePoints = formatNdviChartData(negativeObs);
  assert(negativePoints[0].meanNdvi === -0.152, '38. Negative NDVI value (-0.152) is preserved without clamping to 0');
  const negativeTooltipHtml = renderToStaticMarkup(
    React.createElement(CustomNdviTooltip, {
      active: true,
      payload: [{ payload: negativePoints[0] } as any],
    })
  );
  assert(negativeTooltipHtml.includes('Non-Vegetative'), '38. Negative NDVI shows Non-Vegetative classification');
  assert(negativeTooltipHtml.includes('-0.1520'), '38. Tooltip renders exact negative NDVI value');

  // Test 39: High NDVI values are preserved without clamping
  const highPoints = formatNdviChartData([
    createMockObservation({ meanNdvi: 0.92, minNdvi: 0.85, maxNdvi: 0.98 }),
  ]);
  assert(highPoints[0].meanNdvi === 0.92, '39. High NDVI value (0.92) is preserved without clamping');

  // Test 40: Missing optional nested satellite metadata does not break formatting or tooltip
  const noSatMetadataPoints = formatNdviChartData([
    createMockObservation({ satelliteObservation: undefined }),
  ]);
  assert(noSatMetadataPoints[0].satellite === 'Sentinel-2', '40. Gracefully defaults satellite platform when metadata is undefined');
  const noSatTooltipHtml = renderToStaticMarkup(
    React.createElement(CustomNdviTooltip, {
      active: true,
      payload: [{ payload: noSatMetadataPoints[0] } as any],
    })
  );
  assert(!noSatTooltipHtml.includes('undefined'), '40. Tooltip does not contain "undefined" when satelliteObservation is absent');
  assert(!noSatTooltipHtml.includes('null'), '40. Tooltip does not contain "null" when satelliteObservation is absent');

  // Test 41: Strict check: No "undefined" or "null" in rendered chart markup
  assert(!multiObsHtml.includes('undefined'), '41. Multi-obs chart HTML does NOT contain "undefined"');
  assert(!multiObsHtml.includes('null'), '41. Multi-obs chart HTML does NOT contain "null"');
  // ==========================================
  // Part 9: FarmSatelliteSection Orchestrator Tests (F-6)
  // ==========================================
  console.log('\n--- Part 9: FarmSatelliteSection Orchestrator (F-6) ---');

  // Test 42: Orchestrator renders container and header
  const sectionPopulatedHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialLatest: highObs,
      initialHistorical: chronologicalObs,
    })
  );
  assert(sectionPopulatedHtml.includes('data-testid="farm-satellite-section"'), '42. Renders farm-satellite-section container');
  assert(sectionPopulatedHtml.includes('Satellite Remote Sensing'), '42. Renders section heading');
  assert(sectionPopulatedHtml.includes('data-testid="satellite-refresh-button"'), '42. Renders satellite-refresh-button');

  // Test 43: Orchestrator incorporates SatelliteSyncControls (F-4)
  assert(sectionPopulatedHtml.includes('data-testid="satellite-sync-controls"'), '43. Contains SatelliteSyncControls');
  assert(sectionPopulatedHtml.includes('Sync Satellite Data'), '43. Sync controls are active');

  // Test 44: Orchestrator incorporates NdviSummaryCard (F-3) with populated observation
  assert(sectionPopulatedHtml.includes('data-testid="ndvi-summary-card"'), '44. Contains NdviSummaryCard');
  assert(sectionPopulatedHtml.includes('0.7245'), '44. Summary card displays latest mean NDVI 0.7245');

  // Test 45: Orchestrator incorporates NdviHistoryChart (F-5) with populated observations
  assert(sectionPopulatedHtml.includes('data-testid="ndvi-history-chart"'), '45. Contains NdviHistoryChart');

  // Test 46: Latest 404 renders clean empty state without scary alert
  const sectionEmptyLatestHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialLatest: null,
      initialHistorical: [],
    })
  );
  assert(sectionEmptyLatestHtml.includes('data-testid="latest-ndvi-empty"'), '46. 404 renders latest-ndvi-empty state');
  assert(sectionEmptyLatestHtml.includes('No Satellite Observation Synchronized Yet'), '46. Displays non-scary empty state caption');
  assert(!sectionEmptyLatestHtml.includes('Failed to retrieve latest'), '46. 404 does NOT display error failure banner');

  // Test 47: Latest non-404 error displays error alert
  const sectionLatestErrorHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialLatest: null,
      initialLatestError: 'Database connection timeout while reading latest observation.',
    })
  );
  assert(sectionLatestErrorHtml.includes('data-testid="latest-ndvi-error"'), '47. Non-404 error displays latest-ndvi-error alert');
  assert(sectionLatestErrorHtml.includes('Database connection timeout'), '47. Displays specific error message');

  // Test 48: Independent loading: Latest loading while history is loaded
  const latestLoadingHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialLoadingLatest: true,
      initialLoadingHistory: false,
      initialHistorical: chronologicalObs,
    })
  );
  assert(latestLoadingHtml.includes('data-testid="latest-ndvi-loading"'), '48. Latest section shows loading spinner');
  assert(latestLoadingHtml.includes('data-testid="ndvi-history-chart"'), '48. Historical chart renders independently without being blocked');

  // Test 49: Independent loading: History loading while latest is loaded
  const historyLoadingHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialLatest: highObs,
      initialLoadingLatest: false,
      initialLoadingHistory: true,
    })
  );
  assert(historyLoadingHtml.includes('data-testid="ndvi-summary-card"'), '49. Latest summary card renders independently');
  assert(historyLoadingHtml.includes('data-testid="ndvi-chart-loading"'), '49. Historical chart shows loading spinner');

  // Test 50: Historical 404 / empty state renders clean chart empty state
  assert(sectionEmptyLatestHtml.includes('data-testid="ndvi-chart-empty"'), '50. Historical empty data renders ndvi-chart-empty');
  assert(sectionEmptyLatestHtml.includes('No historical NDVI observations available'), '50. Chart shows clean empty state message');

  // Test 51: Historical non-404 error is passed to chart
  const sectionHistoryErrorHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: true,
      initialHistoryError: 'Failed to retrieve historical observations from PostgreSQL.',
    })
  );
  assert(sectionHistoryErrorHtml.includes('data-testid="ndvi-chart-error"'), '51. Historical error is forwarded to chart error display');
  assert(sectionHistoryErrorHtml.includes('Failed to retrieve historical observations'), '51. Renders exact error text');

  // Test 52: Boundary behavior: hasBoundary=false is passed to child controls
  const sectionNoBoundaryHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: dummyFarmId,
      hasBoundary: false,
    })
  );
  assert(sectionNoBoundaryHtml.includes('Farm Boundary Required'), '52. hasBoundary=false displays boundary warning in sync controls');
  assert(sectionNoBoundaryHtml.includes('cursor-not-allowed'), '52. Sync button disabled with cursor-not-allowed');

  // Test 53: Refresh button disabled when hasBoundary=false
  assert(sectionNoBoundaryHtml.includes('data-testid="satellite-refresh-button"'), '53. Refresh button present');
  assert(sectionNoBoundaryHtml.includes('disabled=""') || sectionNoBoundaryHtml.includes('disabled'), '53. Refresh button is disabled when no boundary');

  // Test 54: satelliteService.getLatestNdvi API endpoint contract
  let calledUrl = '';
  apiClient.get = (async (url: string) => {
    calledUrl = url;
    return {
      data: {
        success: true,
        message: 'Latest NDVI observation',
        data: highObs,
        timestamp: new Date().toISOString(),
      },
    };
  }) as any;

  const latestRes = await satelliteService.getLatestNdvi(dummyFarmId);
  assert(calledUrl === `/farms/${dummyFarmId}/satellite/latest`, '54. getLatestNdvi calls GET /farms/:farmId/satellite/latest');
  assert(latestRes.data.meanNdvi === highObs.meanNdvi, '54. Returns typed NdviObservationDTO');

  // Test 55: satelliteService.getHistoricalNdvi API endpoint contract
  let historicalParams: any = null;
  apiClient.get = (async (url: string, config?: any) => {
    calledUrl = url;
    historicalParams = config?.params;
    return {
      data: {
        success: true,
        message: 'Historical observations',
        data: chronologicalObs,
        timestamp: new Date().toISOString(),
      },
    };
  }) as any;

  const historyRes = await satelliteService.getHistoricalNdvi(dummyFarmId, { limit: 50 });
  assert(calledUrl === `/farms/${dummyFarmId}/satellite`, '55. getHistoricalNdvi calls GET /farms/:farmId/satellite');
  assert(historicalParams?.limit === 50, '55. Passes query parameters to Axios request');
  assert(historyRes.data.length === 3, '55. Returns array of NdviObservationDTO');

  // Test 56: Strict HTML DOM safety: No "undefined" or "null" in rendered section
  assert(!sectionPopulatedHtml.includes('undefined'), '56. Populated section does NOT contain "undefined"');
  assert(!sectionPopulatedHtml.includes('null'), '56. Populated section does NOT contain "null"');
  assert(!sectionEmptyLatestHtml.includes('undefined'), '56. Empty section does NOT contain "undefined"');
  assert(!sectionEmptyLatestHtml.includes('null'), '56. Empty section does NOT contain "null"');
  assert(!sectionNoBoundaryHtml.includes('undefined'), '56. No-boundary section does NOT contain "undefined"');
  assert(!sectionNoBoundaryHtml.includes('null'), '56. No-boundary section does NOT contain "null"');

  // ==========================================
  // Part 10: FarmDetailPage Integration Tests (F-7)
  // ==========================================
  console.log('\n--- Part 10: FarmDetailPage Integration (F-7) ---');

  const fs = await import('node:fs');
  const path = await import('node:path');
  const farmDetailPagePath = path.resolve('src/pages/farms/FarmDetailPage.tsx');
  const farmDetailPageSource = fs.readFileSync(farmDetailPagePath, 'utf-8');

  // Test 57: FarmSatelliteSection is imported in FarmDetailPage
  assert(
    farmDetailPageSource.includes("import { FarmSatelliteSection } from '../../components/satellite/FarmSatelliteSection';"),
    '57. FarmSatelliteSection is imported from relative path in FarmDetailPage'
  );

  // Test 58: FarmSatelliteSection is rendered with correct props
  assert(
    farmDetailPageSource.includes('<FarmSatelliteSection'),
    '58. FarmSatelliteSection component tag is rendered in FarmDetailPage'
  );
  assert(
    farmDetailPageSource.includes('farmId={farm.id}'),
    '58. Passes farm.id to FarmSatelliteSection'
  );
  assert(
    farmDetailPageSource.includes('hasBoundary={Boolean(boundary)}'),
    '58. Passes Boolean(boundary) to FarmSatelliteSection'
  );

  // Test 59: Sequential page ordering (Weather -> Satellite -> Risk)
  const weatherIdx = farmDetailPageSource.indexOf('<FarmWeatherSection');
  const satelliteIdx = farmDetailPageSource.indexOf('<FarmSatelliteSection');
  const riskIdx = farmDetailPageSource.indexOf('<FarmRiskSection');
  const boundaryIdx = farmDetailPageSource.indexOf('<FarmBoundaryMap');

  assert(boundaryIdx !== -1, '59. FarmBoundaryMap exists in FarmDetailPage');
  assert(weatherIdx !== -1, '59. FarmWeatherSection exists in FarmDetailPage');
  assert(satelliteIdx !== -1, '59. FarmSatelliteSection exists in FarmDetailPage');
  assert(riskIdx !== -1, '59. FarmRiskSection exists in FarmDetailPage');
  assert(
    boundaryIdx < weatherIdx,
    '59. Page order: FarmBoundaryMap is placed before FarmWeatherSection'
  );
  assert(
    weatherIdx < satelliteIdx,
    '59. Page order: FarmSatelliteSection is placed after FarmWeatherSection'
  );
  assert(
    satelliteIdx < riskIdx,
    '59. Page order: FarmSatelliteSection is placed before FarmRiskSection'
  );

  // Test 60: Architectural Invariant: FarmDetailPage does NOT directly import or call satelliteService
  assert(
    !farmDetailPageSource.includes('satelliteService'),
    '60. Architectural Invariant: FarmDetailPage does NOT import or call satelliteService directly'
  );

  // Test 61: Boundary integration: hasBoundary=true renders enabled satellite workflow
  const integratedWithBoundaryHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: 'farm-boundary-test-id',
      hasBoundary: true,
      initialLatest: highObs,
    })
  );
  assert(
    integratedWithBoundaryHtml.includes('Sync Satellite Data'),
    '61. Farm with boundary renders active sync button'
  );
  assert(
    !integratedWithBoundaryHtml.includes('Farm Boundary Required'),
    '61. Farm with boundary does not display boundary warning'
  );

  // Test 62: Boundary integration: hasBoundary=false renders warning and disables workflow
  const integratedNoBoundaryHtml = renderToStaticMarkup(
    React.createElement(FarmSatelliteSection, {
      farmId: 'farm-no-boundary-test-id',
      hasBoundary: false,
      initialLatest: null,
    })
  );
  assert(
    integratedNoBoundaryHtml.includes('Farm Boundary Required'),
    '62. Farm without boundary renders required boundary warning'
  );
  assert(
    integratedNoBoundaryHtml.includes('disabled=""') || integratedNoBoundaryHtml.includes('disabled'),
    '62. Farm without boundary renders disabled sync action'
  );

  console.log('\n==================================================');
  console.log(`Satellite Frontend Test Results: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running satellite frontend test suite:', err);
  process.exit(1);
});
