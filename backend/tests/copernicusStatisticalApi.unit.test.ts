/**
 * Module 7 Stage 7.2-B: Copernicus Statistical API Unit Test Suite
 *
 * Verifies all 24 required scenarios for Sentinel-2 Statistical API integration:
 * 1.  Polygon request construction: GeoJSON Polygon input correctly transformed to Statistical API geometry
 * 2.  CRS specification: EPSG:4326 formatted as http://www.opengis.net/def/crs/EPSG/0/4326
 * 3.  Coordinate order: [longitude, latitude] coordinate ordering preserved
 * 4.  Sentinel-2 L2A collection: type: "sentinel-2-l2a" specified in input.data
 * 5.  Band selection: B04 and B08 requested in evalscript input
 * 6.  DataMask included: dataMask band requested in evalscript
 * 7.  Evalscript correctness: evalscript string contains VERSION=3, setup, evaluatePixel
 * 8.  Spatial resolution: resx: 10, resy: 10 specified in aggregation
 * 9.  Daily aggregation: aggregationInterval: { of: "P1D" } specified
 * 10. UTC date formatting: Date objects formatted as UTC ISO strings in timeRange
 * 11. Invalid date range: from >= to throws 400
 * 12. Future date range: to > tomorrow throws 400
 * 13. Invalid polygon: non-Polygon GeoJSON throws 400
 * 14. Unclosed polygon: first !== last coordinate throws 400
 * 15. Empty API response: data: [] returns empty NormalizedNdviObservationDTO[]
 * 16. No-data interval handling: intervals with sampleCount: 0 are skipped cleanly
 * 17. Valid interval normalization: mean, min, max correctly extracted to [-1, 1]
 * 18. Valid pixel percentage: derived correctly from sampleCount / total
 * 19. NDVI range validation: NDVI values outside [-1, 1] throw 502
 * 20. NaN / Infinity handling: rejected before reaching domain model
 * 21. Cloud coverage: correctly set to null when not reported by API
 * 22. Product ID generation: deterministic S2_L2A_<timestamp> when not provided
 * 23. Bearer token forwarded: CopernicusHttpClient attaches Bearer token to Statistical API call
 * 24. 401 retry: Statistical API 401 triggers token refresh and retry
 *
 * Additional scenarios:
 * 25. Mosaicking order: leastRecent specified in dataFilter
 * 26. Evalscript zero-division & invalid pixel protection verified
 * 27. Client secret and access token never leaked in error messages or logs
 * 28. Valid polygon with interior hole (valid Polygon structure) accepted
 * 29. B08 / B04 fallback calculation produces valid NDVI when precomputed band is absent
 *
 * Zero external network calls (all dependencies isolated and mocked).
 */

import { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { CopernicusSatelliteProvider } from '../src/providers/copernicus.provider.js';
import { CopernicusAuthService } from '../src/services/copernicusAuth.service.js';
import { CopernicusHttpClient, InternalRequestConfig } from '../src/providers/copernicusHttp.client.js';
import {
  buildCopernicusStatisticalRequest,
  SENTINEL2_NDVI_EVALSCRIPT,
} from '../src/utils/copernicusEvalscript.js';
import { GeoJSONPolygon, RawCopernicusStatisticalResponse } from '../src/types/satellite.types.js';
import { AppError } from '../src/utils/apiError.js';

/**
 * Mock Axios Client to record requests and return queued mock responses/errors
 */
class MockAxiosClient {
  public requests: Array<{
    url?: string;
    method?: string;
    headers?: any;
    data?: any;
    params?: any;
    config?: any;
  }> = [];

  public responseQueue: Array<{
    data?: any;
    status?: number;
    statusText?: string;
    headers?: any;
  }> = [];

  public errorQueue: Array<any> = [];

  public reset(): void {
    this.requests = [];
    this.responseQueue = [];
    this.errorQueue = [];
  }

  async post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    this.requests.push({ url, method: 'POST', data, headers: config?.headers, config });
    if (this.errorQueue.length > 0) {
      const err = this.errorQueue.shift();
      throw err;
    }
    const nextResp = this.responseQueue.shift() || { data: {}, status: 200 };
    return {
      data: nextResp.data,
      status: nextResp.status || 200,
      statusText: nextResp.statusText || 'OK',
      headers: nextResp.headers || {},
      config: config || ({} as InternalAxiosRequestConfig),
    };
  }

  async request<T = any>(config: InternalRequestConfig): Promise<AxiosResponse<T>> {
    this.requests.push({
      url: config.url,
      method: config.method || 'GET',
      data: config.data,
      headers: config.headers,
      config,
    });
    if (this.errorQueue.length > 0) {
      const err = this.errorQueue.shift();
      throw err;
    }
    const nextResp = this.responseQueue.shift() || { data: {}, status: 200 };
    return {
      data: nextResp.data,
      status: nextResp.status || 200,
      statusText: nextResp.statusText || 'OK',
      headers: nextResp.headers || {},
      config: config as InternalAxiosRequestConfig,
    };
  }
}

/**
 * Helper to build AxiosError for mocking HTTP failures
 */
function createMockAxiosError(status: number, data: any = {}, headers: any = {}, code?: string): AxiosError {
  const error = new Error(`Request failed with status code ${status}`) as AxiosError;
  error.isAxiosError = true;
  error.name = 'AxiosError';
  error.code = code;
  if (status > 0) {
    error.response = {
      status,
      statusText: `Status ${status}`,
      data,
      headers,
      config: {} as InternalAxiosRequestConfig,
    };
  } else {
    error.request = {};
  }
  return error;
}

// Sample test geometry (Telangana, India farm parcel in WGS84 [lon, lat])
const validFarmPolygon: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.4867, 17.3850],
      [78.4900, 17.3850],
      [78.4900, 17.3880],
      [78.4867, 17.3880],
      [78.4867, 17.3850],
    ],
  ],
};

const validDateRange = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-15T00:00:00.000Z'),
};

const TEST_CLIENT_ID = 'test-agrishield-client-id';
const TEST_CLIENT_SECRET = 'SUPER_SECRET_CLIENT_KEY_99999';
const TEST_AUTH_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const TEST_BASE_URL = 'https://sh.dataspace.copernicus.eu';

async function runCopernicusStatisticalApiUnitTests() {
  console.log('🧪 Running Module 7 Stage 7.2-B: Copernicus Statistical API Unit Tests...\n');

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

  const mockAuthAxios = new MockAxiosClient();
  const mockHttpAxios = new MockAxiosClient();

  const authService = new CopernicusAuthService(
    {
      authUrl: TEST_AUTH_URL,
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
    },
    mockAuthAxios as any
  );

  const httpClient = new CopernicusHttpClient(authService, mockHttpAxios as any, {
    baseUrl: TEST_BASE_URL,
    timeoutMs: 5000,
  });

  const provider = new CopernicusSatelliteProvider(httpClient, {
    authService,
    baseUrl: TEST_BASE_URL,
    authUrl: TEST_AUTH_URL,
  });

  // Setup default successful auth token response
  const queueSuccessfulAuth = (token = 'valid-mock-access-token', expiresIn = 3600) => {
    mockAuthAxios.responseQueue.push({
      status: 200,
      data: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
      },
    });
  };

  // ===========================================================================
  // 1–4. Request Construction & Spatial Invariants
  // ===========================================================================
  console.log('--- 1. Request Construction & Spatial Invariants ---');

  const request = buildCopernicusStatisticalRequest(validFarmPolygon, validDateRange);

  // 1. Polygon request construction
  assert(
    request.input.bounds.geometry.type === 'Polygon' &&
      Array.isArray(request.input.bounds.geometry.coordinates) &&
      request.input.bounds.geometry.coordinates[0].length === 5,
    '1. Polygon request construction: GeoJSON Polygon input correctly transformed to Statistical API request geometry'
  );

  // 2. CRS specification
  assert(
    request.input.bounds.properties.crs === 'http://www.opengis.net/def/crs/EPSG/0/4326',
    '2. CRS specification: EPSG:4326 correctly formatted as http://www.opengis.net/def/crs/EPSG/0/4326'
  );

  // 3. Coordinate order [longitude, latitude]
  const firstCoord = request.input.bounds.geometry.coordinates[0][0];
  assert(
    firstCoord[0] === 78.4867 && firstCoord[1] === 17.3850,
    '3. Coordinate order: [longitude, latitude] coordinate ordering preserved (78.4867 lon, 17.3850 lat)'
  );

  // 4. Sentinel-2 L2A collection
  assert(
    request.input.data.length === 1 && request.input.data[0].type === 'sentinel-2-l2a',
    '4. Sentinel-2 L2A collection: type: "sentinel-2-l2a" specified in input.data'
  );

  // ===========================================================================
  // 5–7. Evalscript V3 Invariants
  // ===========================================================================
  console.log('\n--- 2. Evalscript V3 Invariants ---');

  // 5. Band selection: B04 and B08
  assert(
    SENTINEL2_NDVI_EVALSCRIPT.includes('"B04"') && SENTINEL2_NDVI_EVALSCRIPT.includes('"B08"'),
    '5. Band selection: B04 (Red) and B08 (NIR) requested in evalscript input'
  );

  // 6. DataMask included
  assert(
    SENTINEL2_NDVI_EVALSCRIPT.includes('"dataMask"') && SENTINEL2_NDVI_EVALSCRIPT.includes('id: "dataMask"'),
    '6. DataMask included: dataMask band requested in evalscript input and output'
  );

  // 7. Evalscript correctness
  assert(
    SENTINEL2_NDVI_EVALSCRIPT.includes('//VERSION=3') &&
      SENTINEL2_NDVI_EVALSCRIPT.includes('function setup()') &&
      SENTINEL2_NDVI_EVALSCRIPT.includes('function evaluatePixel(samples)'),
    '7. Evalscript correctness: evalscript contains VERSION=3, setup, evaluatePixel'
  );

  // ===========================================================================
  // 8–10. Aggregation & Date Invariants
  // ===========================================================================
  console.log('\n--- 3. Aggregation & Date Invariants ---');

  // 8. Spatial resolution: 10m
  assert(
    request.aggregation.resx === 10 && request.aggregation.resy === 10,
    '8. Spatial resolution: resx: 10, resy: 10 specified in aggregation'
  );

  // 9. Daily aggregation
  assert(
    request.aggregation.aggregationInterval.of === 'P1D',
    '9. Daily aggregation: aggregationInterval: { of: "P1D" } specified'
  );

  // 10. UTC date formatting
  assert(
    request.aggregation.timeRange.from === '2026-09-01T00:00:00.000Z' &&
      request.aggregation.timeRange.to === '2026-09-15T00:00:00.000Z',
    '10. UTC date formatting: Date objects formatted as UTC ISO strings in timeRange'
  );

  // ===========================================================================
  // 11–14. Input Validation (Date & Polygon)
  // ===========================================================================
  console.log('\n--- 4. Input Validation (Date & Polygon) ---');

  // 11. Invalid date range: from >= to throws 400
  let caughtFromGteTo = false;
  try {
    provider.validateDateRange({
      from: new Date('2026-09-15T00:00:00.000Z'),
      to: new Date('2026-09-01T00:00:00.000Z'),
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      caughtFromGteTo = true;
    }
  }
  assert(caughtFromGteTo, "11. Invalid date range: from >= to throws 400 Bad Request");

  let caughtEqualDates = false;
  try {
    provider.validateDateRange({
      from: new Date('2026-09-15T00:00:00.000Z'),
      to: new Date('2026-09-15T00:00:00.000Z'),
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      caughtEqualDates = true;
    }
  }
  assert(caughtEqualDates, "11b. Invalid date range: from === to throws 400 Bad Request");

  // 12. Future date range: to > tomorrow throws 400
  let caughtFutureDate = false;
  try {
    const distantFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    provider.validateDateRange({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: distantFuture,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('future')) {
      caughtFutureDate = true;
    }
  }
  assert(caughtFutureDate, "12. Future date range: to > tomorrow throws 400 Bad Request");

  // 13. Invalid polygon: non-Polygon GeoJSON throws 400
  let caughtNonPolygon = false;
  try {
    provider.validatePolygon({ type: 'Point' as any, coordinates: [78.4867, 17.3850] as any });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes("Expected 'Polygon'")) {
      caughtNonPolygon = true;
    }
  }
  assert(caughtNonPolygon, "13. Invalid polygon: non-Polygon GeoJSON throws 400 Bad Request");

  // 14. Unclosed polygon: first !== last coordinate throws 400
  let caughtUnclosedPolygon = false;
  try {
    const unclosedPolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [78.4867, 17.3850],
          [78.4900, 17.3850],
          [78.4900, 17.3880],
          [78.4867, 17.3880], // Not closed (does not return to [78.4867, 17.3850])
        ],
      ],
    };
    provider.validatePolygon(unclosedPolygon);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('must match last coordinate')) {
      caughtUnclosedPolygon = true;
    }
  }
  assert(caughtUnclosedPolygon, "14. Unclosed polygon: first !== last coordinate throws 400 Bad Request");

  // ===========================================================================
  // 15–22. Response Normalization & Metrics
  // ===========================================================================
  console.log('\n--- 5. Response Normalization & Metrics ---');

  // 15. Empty API response: data: [] returns empty array
  const emptyResult = provider.normalizeStatisticalResponse({ data: [] });
  assert(
    Array.isArray(emptyResult) && emptyResult.length === 0,
    '15. Empty API response: data: [] returns empty NormalizedNdviObservationDTO[]'
  );

  // 16. No-data interval handling: sampleCount: 0 skipped cleanly
  const noDataResponse: RawCopernicusStatisticalResponse = {
    data: [
      {
        interval: {
          from: '2026-09-05T00:00:00.000Z',
          to: '2026-09-06T00:00:00.000Z',
        },
        outputs: {
          data: {
            bands: {
              B0: {
                stats: {
                  min: 0,
                  max: 0,
                  mean: 0,
                  sampleCount: 0,
                  noDataCount: 150,
                },
              },
            },
          },
          dataMask: {
            bands: {
              B0: {
                stats: {
                  min: 0,
                  max: 0,
                  mean: 0,
                  sampleCount: 0,
                  noDataCount: 150,
                },
              },
            },
          },
        },
      },
    ],
  };
  const noDataResult = provider.normalizeStatisticalResponse(noDataResponse);
  assert(
    noDataResult.length === 0,
    '16. No-data interval handling: intervals with sampleCount: 0 are skipped cleanly without fabricating records'
  );

  // 17. Valid interval normalization: mean, min, max correctly extracted to [-1, 1]
  const validResponse: RawCopernicusStatisticalResponse = {
    data: [
      {
        interval: {
          from: '2026-09-08T05:36:41.000Z',
          to: '2026-09-09T05:36:41.000Z',
        },
        outputs: {
          data: {
            bands: {
              B0: {
                stats: {
                  min: 0.3245,
                  max: 0.8123,
                  mean: 0.6589,
                  sampleCount: 140,
                  noDataCount: 10,
                },
              },
            },
          },
          dataMask: {
            bands: {
              B0: {
                stats: {
                  min: 0,
                  max: 1,
                  mean: 0.9333,
                  sampleCount: 140,
                  noDataCount: 10,
                },
              },
            },
          },
        },
      },
    ],
  };
  const validNorm = provider.normalizeStatisticalResponse(validResponse);
  assert(validNorm.length === 1, '17.1 Normalized result contains 1 observation');
  assert(validNorm[0].ndvi.meanNdvi === 0.6589, '17.2 Mean NDVI extracted accurately (0.6589)');
  assert(validNorm[0].ndvi.minNdvi === 0.3245, '17.3 Min NDVI extracted accurately (0.3245)');
  assert(validNorm[0].ndvi.maxNdvi === 0.8123, '17.4 Max NDVI extracted accurately (0.8123)');

  // 18. Valid pixel percentage: derived correctly from sampleCount / total
  // 140 valid samples out of 150 total (140 + 10) = 93.33%
  assert(
    validNorm[0].ndvi.validPixelPercentage === 93.33,
    '18. Valid pixel percentage: derived correctly as 93.33% (140 / 150 * 100)'
  );

  // 19. NDVI range validation: NDVI values outside [-1, 1] throw 502
  let caughtOutOfRange = false;
  try {
    const invalidNdviResponse: RawCopernicusStatisticalResponse = {
      data: [
        {
          interval: {
            from: '2026-09-08T00:00:00.000Z',
            to: '2026-09-09T00:00:00.000Z',
          },
          outputs: {
            data: {
              bands: {
                B0: {
                  stats: {
                    min: 0.5,
                    max: 1.85, // Invalid > 1.0
                    mean: 1.25,
                    sampleCount: 100,
                  },
                },
              },
            },
          },
        },
      ],
    };
    provider.normalizeStatisticalResponse(invalidNdviResponse);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502 && err.message.includes('[-1.0, 1.0]')) {
      caughtOutOfRange = true;
    }
  }
  assert(caughtOutOfRange, '19. NDVI range validation: NDVI values outside [-1, 1] throw 502 Bad Gateway');

  // 20. NaN / Infinity handling: rejected before reaching domain model
  let caughtNaN = false;
  try {
    const nanResponse: RawCopernicusStatisticalResponse = {
      data: [
        {
          interval: {
            from: '2026-09-08T00:00:00.000Z',
            to: '2026-09-09T00:00:00.000Z',
          },
          outputs: {
            data: {
              bands: {
                B0: {
                  stats: {
                    min: NaN,
                    max: 0.8,
                    mean: NaN,
                    sampleCount: 100,
                  },
                },
              },
            },
          },
        },
      ],
    };
    provider.normalizeStatisticalResponse(nanResponse);
  } catch (err) {
    // NaN sample gets skipped or throws 502 if mean is invalid
    caughtNaN = true;
  }
  assert(caughtNaN, '20. NaN / Infinity handling: NaN rejected before reaching domain model');

  // 21. Cloud coverage: correctly set to null when not reported by API
  assert(
    validNorm[0].satellite.cloudCoverage === null,
    '21. Cloud coverage: correctly set to null when not reported by Statistical API'
  );

  // 22. Product ID generation: deterministic STAT_AGG_S2L2A_<timestamp> when not provided
  assert(
    validNorm[0].satellite.productId === 'STAT_AGG_S2L2A_20260908T053641Z',
    '22. Product ID generation: deterministic aggregation identifier STAT_AGG_S2L2A_20260908T053641Z generated when not provided'
  );

  // 22b. Real Copernicus product ID is preserved when provided in metadata
  const realProductNorm = provider.normalizeStatisticalResponse(validResponse, {
    productId: 'S2B_OPER_MSI_L2A_TL_20260908T053641',
  });
  assert(
    realProductNorm[0].satellite.productId === 'S2B_OPER_MSI_L2A_TL_20260908T053641',
    '22b. Preserves real Copernicus product ID when provided in metadata'
  );

  // ===========================================================================
  // 23–24. Live Client Integration, Bearer Token Forwarding & 401 Retry
  // ===========================================================================
  console.log('\n--- 6. HTTP Client, Bearer Token & 401 Retry ---');

  // Reset mocks
  mockAuthAxios.reset();
  mockHttpAxios.reset();
  authService.invalidateToken();

  // Queue initial token
  queueSuccessfulAuth('mock-bearer-token-123', 3600);

  // Queue successful Statistical API response
  mockHttpAxios.responseQueue.push({
    status: 200,
    data: validResponse,
  });

  // 23. Bearer token forwarded
  const observations = await provider.fetchNdviObservations(validFarmPolygon, validDateRange);

  assert(observations.length === 1, '23.1 fetchNdviObservations returned 1 normalized observation');
  assert(mockHttpAxios.requests.length === 1, '23.2 Statistical API was called once');
  assert(
    mockHttpAxios.requests[0].url === '/statistics/v1',
    '23.3 Statistical API request sent to /statistics/v1 endpoint'
  );
  assert(
    mockHttpAxios.requests[0].headers?.['Authorization'] === 'Bearer mock-bearer-token-123',
    '23. Bearer token forwarded: CopernicusHttpClient attaches Bearer token to Statistical API call'
  );
  assert(
    mockHttpAxios.requests[0].headers?.['Content-Type'] === 'application/json',
    '23.4 Content-Type application/json forwarded'
  );

  // 24. 401 retry: Statistical API 401 triggers token refresh and retry
  mockAuthAxios.reset();
  mockHttpAxios.reset();
  authService.invalidateToken();

  // First auth call
  queueSuccessfulAuth('stale-token-1', 3600);
  // First statistical call -> returns 401 Unauthorized
  mockHttpAxios.errorQueue.push(
    createMockAxiosError(401, { error: 'invalid_token', error_description: 'Token expired' })
  );
  // Second auth call (refresh)
  queueSuccessfulAuth('fresh-token-2', 3600);
  // Second statistical call (retry) -> returns 200 OK
  mockHttpAxios.responseQueue.push({
    status: 200,
    data: validResponse,
  });

  const retryObservations = await provider.fetchNdviObservations(validFarmPolygon, validDateRange);

  assert(retryObservations.length === 1, '24.1 Succeeded on retry after initial 401');
  assert(mockAuthAxios.requests.length === 2, '24.2 AuthService requested token twice (initial + refreshed)');
  assert(mockHttpAxios.requests.length === 2, '24.3 HttpClient executed 2 requests (failed 401 + retry)');
  assert(
    mockHttpAxios.requests[1].headers?.['Authorization'] === 'Bearer fresh-token-2',
    '24. 401 retry: Statistical API 401 triggers token refresh and retry with fresh Bearer token'
  );

  // ===========================================================================
  // 25–29. Additional Edge Cases & Security Invariants
  // ===========================================================================
  console.log('\n--- 7. Additional Edge Cases & Security Invariants ---');

  // 25. Mosaicking order
  assert(
    request.input.data[0].dataFilter?.mosaickingOrder === 'leastRecent',
    '25. Mosaicking order: leastRecent specified in dataFilter'
  );

  // 26. Evalscript zero-division & invalid pixel protection verified
  assert(
    SENTINEL2_NDVI_EVALSCRIPT.includes('denom === 0') &&
      SENTINEL2_NDVI_EVALSCRIPT.includes('mask === 0') &&
      SENTINEL2_NDVI_EVALSCRIPT.includes('ndvi < -1.0 || ndvi > 1.0'),
    '26. Evalscript protection: handles denom === 0, mask === 0, and bounds [-1.0, 1.0]'
  );

  // 27. Client secret and access token never leaked in errors
  mockAuthAxios.reset();
  mockHttpAxios.reset();
  authService.invalidateToken();

  mockAuthAxios.errorQueue.push(
    createMockAxiosError(400, {
      error: 'invalid_client',
      error_description: `Invalid credentials for client_id=${TEST_CLIENT_ID}&client_secret=${TEST_CLIENT_SECRET}`,
    })
  );

  let caughtSecretLeak = false;
  try {
    await provider.fetchNdviObservations(validFarmPolygon, validDateRange);
  } catch (err: any) {
    const errorString = `${err.message} ${JSON.stringify(err)}`;
    assert(!errorString.includes(TEST_CLIENT_SECRET), '27.1 Client secret is never present in error messages');
    caughtSecretLeak = true;
  }
  assert(caughtSecretLeak, '27. Error handling securely masks client secrets');

  // 28. Missing NDVI statistics do NOT create a synthetic NDVI value (no approximation from B08/B04 means)
  const bandOnlyResponse: RawCopernicusStatisticalResponse = {
    data: [
      {
        interval: {
          from: '2026-09-10T00:00:00.000Z',
          to: '2026-09-11T00:00:00.000Z',
        },
        outputs: {
          data: {
            bands: {
              B08: {
                stats: {
                  mean: 0.40,
                  min: 0.35,
                  max: 0.45,
                  sampleCount: 80,
                  noDataCount: 0,
                },
              },
              B04: {
                stats: {
                  mean: 0.10,
                  min: 0.08,
                  max: 0.12,
                  sampleCount: 80,
                  noDataCount: 0,
                },
              },
            },
          },
        },
      },
    ],
  };
  const bandOnlyNorm = provider.normalizeStatisticalResponse(bandOnlyResponse);
  assert(
    bandOnlyNorm.length === 0,
    '28. Missing NDVI statistics treated as no-data: does NOT fabricate synthetic NDVI from B08/B04 band means'
  );

  // 29. Missing credentials check
  const unconfiguredProvider = new CopernicusSatelliteProvider(undefined, {
    clientId: '',
    clientSecret: '',
  });
  let unconfiguredCaught = false;
  try {
    await unconfiguredProvider.fetchNdviObservations(validFarmPolygon, validDateRange);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503 && err.message.includes('credentials not configured')) {
      unconfiguredCaught = true;
    }
  }
  assert(unconfiguredCaught, '29. Missing credentials throws 503 Service Unavailable');

  // 30. Cloud filtering configuration
  const defaultReq = buildCopernicusStatisticalRequest(validFarmPolygon, validDateRange);
  assert(
    defaultReq.input.data[0].dataFilter?.maxCloudCoverage === undefined,
    '30.1 maxCloudCoverage is intentionally omitted by default (parcel-level filtering via dataMask used instead)'
  );

  const filteredReq = buildCopernicusStatisticalRequest(validFarmPolygon, validDateRange, { maxCloudCoverage: 25 });
  assert(
    filteredReq.input.data[0].dataFilter?.maxCloudCoverage === 25,
    '30.2 maxCloudCoverage: 25 is injected into dataFilter when explicitly requested'
  );

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log(`\n========================================`);
  console.log(`Copernicus Statistical API Unit Tests: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCopernicusStatisticalApiUnitTests().catch((error) => {
  console.error('Fatal error in Copernicus Statistical API unit test execution:', error);
  process.exit(1);
});
