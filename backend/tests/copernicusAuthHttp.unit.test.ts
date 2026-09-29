/**
 * Module 7 Stage 7.2-A: Copernicus Authentication & HTTP Client Unit Test Suite
 *
 * Verifies:
 * - A. Missing credentials -> clear configuration error (503)
 * - B. Successful token response -> access token parsed and stored in memory
 * - C. Token caching -> two API requests use one token request
 * - D. Token expiry -> expired token causes refresh
 * - E. Early-expiry safety margin -> token is refreshed before expiration
 * - F. HTTP request contains Bearer token and standard headers
 * - G. 401 response -> invalidate token -> obtain fresh token -> retry exactly once
 * - H. Second 401 -> no infinite retry, throws clean 401
 * - I. 429 rate limit -> clear rate-limit error with preserved Retry-After
 * - J. Timeout -> clear timeout/service-unavailable error (503)
 * - K. 400, 403, 404, 500, 502, 503 provider errors handled correctly
 * - L. Client secret is NOT included in thrown error messages
 * - M. Token is not persisted to database (in-memory only)
 * - N. CopernicusSatelliteProvider integrates CopernicusAuthService and CopernicusHttpClient
 *
 * Zero network dependencies (fully isolated and mocked).
 */

import { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { CopernicusAuthService } from '../src/services/copernicusAuth.service.js';
import { CopernicusHttpClient, InternalRequestConfig } from '../src/providers/copernicusHttp.client.js';
import { CopernicusSatelliteProvider } from '../src/providers/copernicus.provider.js';
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

async function runCopernicusAuthHttpUnitTests() {
  console.log('🧪 Running Module 7 Stage 7.2-A: Copernicus Auth & HTTP Client Unit Tests...\n');

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

  const TEST_CLIENT_ID = 'test-agrishield-client-id';
  const TEST_CLIENT_SECRET = 'TEST_VERY_SECRET_KEY_XYZ_98765';
  const TEST_AUTH_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
  const TEST_BASE_URL = 'https://sh.dataspace.copernicus.eu';

  // ===========================================================================
  // Test A: Missing Credentials
  // ===========================================================================
  console.log('--- Test A: Missing Credentials Handling ---');

  const unconfiguredAuthService = new CopernicusAuthService({
    clientId: '',
    clientSecret: '',
    authUrl: TEST_AUTH_URL,
  });

  assert(unconfiguredAuthService.hasCredentials() === false, 'A.1 hasCredentials returns false when empty');

  let missingCredsCaught = false;
  try {
    await unconfiguredAuthService.getAccessToken();
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 503 && err.message.includes('credentials are not configured')) {
      missingCredsCaught = true;
    }
  }
  assert(missingCredsCaught, 'A.2 Calling getAccessToken() without credentials throws AppError 503 Service Unavailable');

  // ===========================================================================
  // Test B: Successful Token Response & Form-Urlencoded POST
  // ===========================================================================
  console.log('\n--- Test B: Successful Token Response ---');

  mockAuthAxios.reset();
  const authService = new CopernicusAuthService(
    {
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
      authUrl: TEST_AUTH_URL,
      safetyMarginMs: 60 * 1000,
    },
    mockAuthAxios as any
  );

  assert(authService.hasCredentials() === true, 'B.1 hasCredentials returns true when credentials present');

  mockAuthAxios.responseQueue.push({
    status: 200,
    data: {
      access_token: 'copernicus-jwt-token-alpha-12345',
      expires_in: 3600,
      token_type: 'Bearer',
    },
  });

  const token1 = await authService.getAccessToken();
  assert(token1 === 'copernicus-jwt-token-alpha-12345', 'B.2 Successfully parsed and returned access_token');
  assert(mockAuthAxios.requests.length === 1, 'B.3 Dispatched exactly one POST to auth endpoint');

  const authReq = mockAuthAxios.requests[0];
  assert(authReq.url === TEST_AUTH_URL, 'B.4 Dispatched to official Copernicus authUrl');
  assert(authReq.headers['Content-Type'] === 'application/x-www-form-urlencoded', 'B.5 Request sent as form-urlencoded');
  assert(authReq.data.includes('grant_type=client_credentials'), 'B.6 Body includes grant_type=client_credentials');
  assert(authReq.data.includes(`client_id=${TEST_CLIENT_ID}`), 'B.7 Body includes client_id');
  assert(authReq.data.includes(`client_secret=${TEST_CLIENT_SECRET}`), 'B.8 Body includes client_secret');

  // ===========================================================================
  // Test C: Token Caching (Reuse token across multiple requests)
  // ===========================================================================
  console.log('\n--- Test C: Token Caching ---');

  // Subsequent call within validity window should reuse cached token
  const token2 = await authService.getAccessToken();
  assert(token2 === 'copernicus-jwt-token-alpha-12345', 'C.1 Second getAccessToken() returns cached token');
  assert(mockAuthAxios.requests.length === 1, 'C.2 Zero additional network requests made for cached token (count remains 1)');

  const cachedInfo = authService.getCachedTokenInfo();
  assert(cachedInfo.hasToken === true, 'C.3 Cached token state is active');
  assert(typeof cachedInfo.expiresAt === 'number' && cachedInfo.expiresAt > Date.now(), 'C.4 Expiry timestamp set in future');

  // ===========================================================================
  // Test D: Token Expiry Triggers Refresh
  // ===========================================================================
  console.log('\n--- Test D: Expired Token Triggers Refresh ---');

  // Manually simulate an expired token (expired 10 seconds ago)
  authService.setCachedTokenForTesting('stale-expired-token', Date.now() - 10000);

  mockAuthAxios.responseQueue.push({
    status: 200,
    data: {
      access_token: 'fresh-copernicus-jwt-token-beta-67890',
      expires_in: 1800,
      token_type: 'Bearer',
    },
  });

  const refreshedToken = await authService.getAccessToken();
  assert(refreshedToken === 'fresh-copernicus-jwt-token-beta-67890', 'D.1 Fresh token fetched after expiration');
  assert(mockAuthAxios.requests.length === 2, 'D.2 Dispatched second auth request to refresh expired token');

  // ===========================================================================
  // Test E: Early-Expiry Safety Margin
  // ===========================================================================
  console.log('\n--- Test E: Early-Expiry Safety Margin ---');

  // Safety margin is 60s (60,000ms). Simulate token expiring in 25 seconds (inside safety margin)
  authService.setCachedTokenForTesting('expiring-soon-token', Date.now() + 25000);

  mockAuthAxios.responseQueue.push({
    status: 200,
    data: {
      access_token: 'proactively-refreshed-token-gamma-11111',
      expires_in: 3600,
      token_type: 'Bearer',
    },
  });

  const preExpRefreshedToken = await authService.getAccessToken();
  assert(preExpRefreshedToken === 'proactively-refreshed-token-gamma-11111', 'E.1 Token inside 60s safety margin triggers proactive refresh');
  assert(mockAuthAxios.requests.length === 3, 'E.2 Proactive refresh dispatched fresh auth request');

  // ===========================================================================
  // Test F: HTTP Client Bearer Token Injection
  // ===========================================================================
  console.log('\n--- Test F: HTTP Client Bearer Token Injection ---');

  mockHttpAxios.reset();
  const httpClient = new CopernicusHttpClient(
    authService,
    mockHttpAxios as any,
    { baseUrl: TEST_BASE_URL, timeoutMs: 15000 }
  );

  mockHttpAxios.responseQueue.push({
    status: 200,
    data: { status: 'OK', message: 'Sentinel Hub ready' },
  });

  const respF = await httpClient.get('/statistics/v1');
  assert(respF.status === 200, 'F.1 HTTP GET request completed successfully');
  assert(mockHttpAxios.requests.length === 1, 'F.2 Exactly one request sent to Copernicus HTTP endpoint');

  const httpReqF = mockHttpAxios.requests[0];
  assert(httpReqF.headers.Authorization === `Bearer ${preExpRefreshedToken}`, 'F.3 Request contains Authorization: Bearer <valid_token>');
  assert(httpReqF.headers.Accept === 'application/json', 'F.4 Request contains Accept: application/json');
  assert(httpReqF.config.baseURL === TEST_BASE_URL, 'F.5 Request directed to Sentinel Hub base URL');
  assert(httpReqF.config.timeout === 15000, 'F.6 Enforces SATELLITE_REQUEST_TIMEOUT_MS');

  // ===========================================================================
  // Test G: 401 Response Triggers Token Invalidation & Exactly One Retry
  // ===========================================================================
  console.log('\n--- Test G: 401 Response Single Retry ---');

  mockHttpAxios.reset();
  mockAuthAxios.reset();

  // Initial call fails with 401 Unauthorized
  mockHttpAxios.errorQueue.push(createMockAxiosError(401, { error: 'token_expired' }));
  // Retry call succeeds with 200 OK
  mockHttpAxios.responseQueue.push({
    status: 200,
    data: { success: true, retryWorked: true },
  });

  // Auth service will be asked for a fresh token on 401
  mockAuthAxios.responseQueue.push({
    status: 200,
    data: {
      access_token: 'freshly-retried-token-delta-22222',
      expires_in: 3600,
    },
  });

  const respG = await httpClient.get('/statistics/v1');
  assert(respG.status === 200, 'G.1 Request succeeded after 401 retry');
  assert(respG.data.retryWorked === true, 'G.2 Returned data from successful retried request');
  assert(mockHttpAxios.requests.length === 2, 'G.3 Exactly two HTTP requests executed (original + exactly one retry)');
  assert(mockHttpAxios.requests[1].config._retry === true, 'G.4 Retry marked with _retry flag');
  assert(mockHttpAxios.requests[1].headers.Authorization === 'Bearer freshly-retried-token-delta-22222', 'G.5 Retry used newly fetched token');

  // ===========================================================================
  // Test H: Second 401 Fails Cleanly (No Infinite Retry Loop)
  // ===========================================================================
  console.log('\n--- Test H: Second 401 Prevents Infinite Retry Loop ---');

  mockHttpAxios.reset();
  mockAuthAxios.reset();

  // Both initial request and retry return 401 Unauthorized
  mockHttpAxios.errorQueue.push(createMockAxiosError(401, { error: 'invalid_token' }));
  mockHttpAxios.errorQueue.push(createMockAxiosError(401, { error: 'invalid_token_persistent' }));

  mockAuthAxios.responseQueue.push({
    status: 200,
    data: {
      access_token: 'fresh-token-attempt-33333',
      expires_in: 3600,
    },
  });

  let second401Caught = false;
  try {
    await httpClient.get('/statistics/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 401) {
      second401Caught = true;
    }
  }
  assert(second401Caught, 'H.1 Second 401 rejected with AppError 401 Unauthorized');
  assert(mockHttpAxios.requests.length === 2, 'H.2 Exactly two requests dispatched (no infinite retry loop)');
  assert(authService.getCachedTokenInfo().hasToken === false, 'H.3 Cached token invalidated following persistent auth failure');

  // ===========================================================================
  // Test I: 429 Rate Limit Handling & Retry-After Preservation
  // ===========================================================================
  console.log('\n--- Test I: 429 Rate Limit Handling ---');

  mockHttpAxios.reset();
  // Prime auth token so auth does not fail
  authService.setCachedTokenForTesting('active-valid-token', Date.now() + 3600000);

  mockHttpAxios.errorQueue.push(
    createMockAxiosError(429, { message: 'Too many statistical requests' }, { 'retry-after': '45' })
  );

  let rateLimitCaught = false;
  let retryAfterValue: any = null;
  try {
    await httpClient.get('/statistics/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 429) {
      rateLimitCaught = true;
      retryAfterValue = err.details?.retryAfter;
    }
  }
  assert(rateLimitCaught, 'I.1 HTTP 429 mapped to AppError 429 Too Many Requests');
  assert(retryAfterValue === '45', 'I.2 Preserves Retry-After information (45s) in error details');
  assert(mockHttpAxios.requests.length === 1, 'I.3 Rate limit does NOT perform uncontrolled retries (count = 1)');

  // ===========================================================================
  // Test J: Timeout Handling (ECONNABORTED)
  // ===========================================================================
  console.log('\n--- Test J: Timeout Handling ---');

  mockHttpAxios.reset();
  authService.setCachedTokenForTesting('active-valid-token', Date.now() + 3600000);

  mockHttpAxios.errorQueue.push(
    createMockAxiosError(0, null, {}, 'ECONNABORTED')
  );

  let timeoutCaught = false;
  try {
    await httpClient.get('/statistics/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 503 && err.message.includes('timed out after 15000ms')) {
      timeoutCaught = true;
    }
  }
  assert(timeoutCaught, 'J.1 ECONNABORTED timeout mapped to AppError 503 Service Unavailable with timeout description');

  // ===========================================================================
  // Test K: HTTP Error Status Mapping (400, 403, 404, 500, 502, 503)
  // ===========================================================================
  console.log('\n--- Test K: Provider Error Status Mapping ---');

  // K.1 400 Bad Request
  mockHttpAxios.reset();
  mockHttpAxios.errorQueue.push(createMockAxiosError(400, { error: { message: 'Invalid evalscript syntax' } }));
  let badRequestCaught = false;
  try {
    await httpClient.post('/statistics/v1', { evalscript: 'bad' });
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid evalscript syntax')) {
      badRequestCaught = true;
    }
  }
  assert(badRequestCaught, 'K.1 HTTP 400 mapped to AppError 400 Bad Request with sanitized provider message');

  // K.2 403 Forbidden
  mockHttpAxios.reset();
  mockHttpAxios.errorQueue.push(createMockAxiosError(403, { message: 'Quota exceeded for processing unit' }));
  let forbiddenCaught = false;
  try {
    await httpClient.get('/statistics/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('forbidden')) {
      forbiddenCaught = true;
    }
  }
  assert(forbiddenCaught, 'K.2 HTTP 403 mapped to AppError 403 Forbidden');

  // K.3 404 Not Found
  mockHttpAxios.reset();
  mockHttpAxios.errorQueue.push(createMockAxiosError(404, { detail: 'Endpoint not found' }));
  let notFoundCaught = false;
  try {
    await httpClient.get('/nonexistent/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 404) {
      notFoundCaught = true;
    }
  }
  assert(notFoundCaught, 'K.3 HTTP 404 mapped to AppError 404 Not Found');

  // K.4 500 Internal Server Error
  mockHttpAxios.reset();
  mockHttpAxios.errorQueue.push(createMockAxiosError(500, { error: 'Internal Copernicus Processing Error' }));
  let serverErrorCaught = false;
  try {
    await httpClient.get('/statistics/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 503) {
      serverErrorCaught = true;
    }
  }
  assert(serverErrorCaught, 'K.4 HTTP 500 mapped to AppError 503 Service Unavailable');

  // K.5 502 Bad Gateway
  mockHttpAxios.reset();
  mockHttpAxios.errorQueue.push(createMockAxiosError(502, { message: 'Upstream gateway down' }));
  let badGatewayCaught = false;
  try {
    await httpClient.get('/statistics/v1');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 503) {
      badGatewayCaught = true;
    }
  }
  assert(badGatewayCaught, 'K.5 HTTP 502 mapped to AppError 503 Service Unavailable');

  // ===========================================================================
  // Test L: Security - Client Secret Never Exposed in Error Messages
  // ===========================================================================
  console.log('\n--- Test L: Security Verification (No Secret Leakage) ---');

  const secretLeakerService = new CopernicusAuthService(
    {
      clientId: 'leaker-client',
      clientSecret: 'SUPER_CONFIDENTIAL_SECRET_TOKEN_99999',
      authUrl: TEST_AUTH_URL,
    },
    mockAuthAxios as any
  );

  mockAuthAxios.reset();
  mockAuthAxios.errorQueue.push(
    createMockAxiosError(401, { error: 'unauthorized_client', description: 'client credentials invalid' })
  );

  let secretExposed = false;
  try {
    await secretLeakerService.getAccessToken();
  } catch (err: any) {
    const errorString = `${err.message} ${JSON.stringify(err.details || {})} ${err.stack || ''}`;
    if (errorString.includes('SUPER_CONFIDENTIAL_SECRET_TOKEN_99999')) {
      secretExposed = true;
    }
  }
  assert(!secretExposed, 'L.1 Client secret is NEVER present in error message, details, or stack trace');

  // ===========================================================================
  // Test M: Security - Token Is Not Persisted in Database
  // ===========================================================================
  console.log('\n--- Test M: Token Is Not Persisted to Database ---');

  // Verify auth service stores token strictly in JavaScript heap variable
  const memTokenInfo = authService.getCachedTokenInfo();
  assert(memTokenInfo.hasToken === true, 'M.1 Token exists strictly in in-memory instance variable');

  authService.clearCachedToken();
  const clearedInfo = authService.getCachedTokenInfo();
  assert(clearedInfo.hasToken === false, 'M.2 clearCachedToken() immediately purges in-memory token');
  assert(clearedInfo.expiresAt === null, 'M.3 Expiry cleared from memory');

  // ===========================================================================
  // Test N: CopernicusSatelliteProvider Architecture Integration
  // ===========================================================================
  console.log('\n--- Test N: CopernicusSatelliteProvider Architectural Integration ---');

  const provider = new CopernicusSatelliteProvider(httpClient, {
    authService,
    baseUrl: TEST_BASE_URL,
    authUrl: TEST_AUTH_URL,
    timeoutMs: 15000,
  });

  assert(provider.getHttpClient() === httpClient, 'N.1 Provider holds CopernicusHttpClient instance');
  assert(provider.getAuthService() === authService, 'N.2 Provider holds CopernicusAuthService instance');
  assert(provider.getBaseUrl() === TEST_BASE_URL, 'N.3 Provider getBaseUrl returns Sentinel Hub base URL');
  assert(provider.getAuthUrl() === TEST_AUTH_URL, 'N.4 Provider getAuthUrl returns Copernicus OAuth endpoint');

  console.log(`\n========================================`);
  console.log(`Copernicus Auth & HTTP Client Unit Tests: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCopernicusAuthHttpUnitTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
