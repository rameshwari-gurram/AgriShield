/**
 * Module 5: Weather Provider Unit Test Suite (Stage 2)
 * Tests provider abstraction, OpenMeteoProvider HTTP request construction,
 * normalization, UTC timestamps, validation, error mapping, and timeout resilience.
 * Zero network dependencies (fully mocked HTTP client).
 */

import { OpenMeteoProvider } from '../src/providers/openmeteo.provider.js';
import { AppError } from '../src/utils/apiError.js';
import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

class MockAxiosClient {
  public lastRequestParams: any = null;
  public mockResponse: any = null;
  public mockError: any = null;

  async get<T = any>(_url: string, config?: { params?: any }): Promise<AxiosResponse<T>> {
    this.lastRequestParams = config?.params;
    if (this.mockError) {
      throw this.mockError;
    }
    return {
      data: this.mockResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    };
  }
}

async function runWeatherProviderUnitTests() {
  console.log('🧪 Running Module 5 Stage 2: Weather Provider Unit Tests (Mocked)...\n');

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

  const mockAxios = new MockAxiosClient();
  const provider = new OpenMeteoProvider(mockAxios as unknown as AxiosInstance, 'https://mock.open-meteo.test/forecast', 8000);

  // ---------------------------------------------------------------------------
  // A. Current Weather Normalization
  // ---------------------------------------------------------------------------
  mockAxios.mockError = null;
  mockAxios.mockResponse = {
    latitude: 18.5204,
    longitude: 73.8567,
    generationtime_ms: 0.05,
    utc_offset_seconds: 0,
    timezone: 'UTC',
    elevation: 560,
    current: {
      time: '2026-09-22T06:30',
      temperature_2m: 29.4,
      relative_humidity_2m: 62,
      precipitation: 1.5,
      wind_speed_10m: 14.2,
      wind_gusts_10m: 21.0,
      weather_code: 61,
    },
  };

  const currentResult = await provider.fetchCurrentWeather(18.5204, 73.8567);
  assert(currentResult.temperatureC === 29.4, 'A.1 temperature_2m normalized to temperatureC (29.4)');
  assert(currentResult.humidityPercent === 62, 'A.2 relative_humidity_2m normalized to humidityPercent (62)');
  assert(currentResult.rainfallMm === 1.5, 'A.3 precipitation normalized to rainfallMm (1.5)');
  assert(currentResult.windSpeedKmh === 14.2, 'A.4 wind_speed_10m normalized to windSpeedKmh (14.2)');
  assert(currentResult.windGustKmh === 21.0, 'A.5 wind_gusts_10m normalized to windGustKmh (21.0)');
  assert(currentResult.weatherCode === 61, 'A.6 weather_code normalized to weatherCode (61)');
  assert(currentResult.source === 'Open-Meteo', 'A.7 Source is explicitly attributed to Open-Meteo');
  assert(currentResult.latitude === 18.5204 && currentResult.longitude === 73.8567, 'A.8 Coordinates preserved in normalized DTO');

  // ---------------------------------------------------------------------------
  // B. Recent Hourly Weather Normalization & 24-Hour Window Filtering
  // ---------------------------------------------------------------------------
  const referenceNow = new Date('2026-09-22T12:00:00Z');
  // Generate mock 48-hour dataset (past_days=1, forecast_days=1 from 2026-09-21T00:00 to 2026-09-22T23:00)
  const mockTimes: string[] = [];
  const mockTemps: number[] = [];
  const mockHumidity: number[] = [];
  const mockPrecip: number[] = [];
  const mockWind: number[] = [];
  const mockGusts: number[] = [];
  const mockCodes: number[] = [];

  const startDate = new Date('2026-09-21T00:00:00Z');
  for (let i = 0; i < 48; i++) {
    const d = new Date(startDate.getTime() + i * 3600 * 1000);
    const isoStr = d.toISOString().replace(':00.000Z', '');
    mockTimes.push(isoStr);
    mockTemps.push(20 + (i % 10));
    mockHumidity.push(50 + (i % 30));
    mockPrecip.push(i % 5 === 0 ? 2.0 : 0.0);
    mockWind.push(10 + (i % 8));
    mockGusts.push(15 + (i % 8));
    mockCodes.push(i % 3);
  }

  mockAxios.mockResponse = {
    latitude: 18.5204,
    longitude: 73.8567,
    timezone: 'UTC',
    hourly: {
      time: mockTimes,
      temperature_2m: mockTemps,
      relative_humidity_2m: mockHumidity,
      precipitation: mockPrecip,
      wind_speed_10m: mockWind,
      wind_gusts_10m: mockGusts,
      weather_code: mockCodes,
    },
  };

  const hourlyResults = await provider.fetchRecentHourlyWeather(18.5204, 73.8567, referenceNow);
  assert(Array.isArray(hourlyResults), 'B.1 fetchRecentHourlyWeather returns an array');
  assert(hourlyResults.length === 25, `B.2 Returns observations for preceding 24h window up to referenceNow (count: ${hourlyResults.length})`);
  assert(hourlyResults[0].observedAt.toISOString() === '2026-09-21T12:00:00.000Z', 'B.3 First observation matches window start (24 hours prior)');
  assert(hourlyResults[hourlyResults.length - 1].observedAt.toISOString() === '2026-09-22T12:00:00.000Z', 'B.4 Last observation matches referenceNow');
  assert(hourlyResults.every((r) => r.source === 'Open-Meteo'), 'B.5 Every hourly record has source: Open-Meteo');

  // ---------------------------------------------------------------------------
  // C. UTC Timestamp Normalization
  // ---------------------------------------------------------------------------
  const parsedUtcDate = provider.parseUtcTimestamp('2026-09-22T06:30');
  assert(parsedUtcDate instanceof Date, 'C.1 parseUtcTimestamp returns Date instance');
  assert(parsedUtcDate.toISOString() === '2026-09-22T06:30:00.000Z', 'C.2 Non-Z timestamp formatted deterministically to UTC ISO string');
  assert(parsedUtcDate.getUTCHours() === 6 && parsedUtcDate.getUTCMinutes() === 30, 'C.3 UTC hours and minutes match exactly');

  const withZDate = provider.parseUtcTimestamp('2026-09-22T06:30Z');
  assert(withZDate.toISOString() === '2026-09-22T06:30:00.000Z', 'C.4 Timestamp with trailing Z parsed cleanly');

  // ---------------------------------------------------------------------------
  // D. Correct Open-Meteo Request Parameters
  // ---------------------------------------------------------------------------
  mockAxios.mockResponse = {
    latitude: 18.5204,
    longitude: 73.8567,
    current: {
      time: '2026-09-22T06:30',
      temperature_2m: 25,
      relative_humidity_2m: 60,
      precipitation: 0,
      wind_speed_10m: 10,
      wind_gusts_10m: 15,
      weather_code: 1,
    },
  };
  await provider.fetchCurrentWeather(18.5204, 73.8567);
  assert(mockAxios.lastRequestParams.latitude === 18.5204, 'D.1 Latitude parameter sent in current weather request');
  assert(mockAxios.lastRequestParams.longitude === 73.8567, 'D.2 Longitude parameter sent in current weather request');
  assert(mockAxios.lastRequestParams.timezone === 'UTC', 'D.3 Timezone parameter set to UTC in current request');
  assert(
    mockAxios.lastRequestParams.current === 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code',
    'D.4 Exact required current variables queried'
  );

  mockAxios.mockResponse = {
    latitude: 18.5204,
    longitude: 73.8567,
    hourly: {
      time: ['2026-09-22T12:00'],
      temperature_2m: [25],
      relative_humidity_2m: [60],
      precipitation: [0],
      wind_speed_10m: [10],
      wind_gusts_10m: [15],
      weather_code: [1],
    },
  };
  await provider.fetchRecentHourlyWeather(18.5204, 73.8567, referenceNow);
  assert(mockAxios.lastRequestParams.past_days === 1, 'D.5 past_days=1 parameter sent in hourly weather request');
  assert(mockAxios.lastRequestParams.forecast_days === 1, 'D.6 forecast_days=1 parameter sent in hourly weather request');
  assert(mockAxios.lastRequestParams.timezone === 'UTC', 'D.7 Timezone parameter set to UTC in hourly request');

  // ---------------------------------------------------------------------------
  // E. Missing Field Handling
  // ---------------------------------------------------------------------------
  let missingCurrentCaught = false;
  mockAxios.mockResponse = { latitude: 18.52, longitude: 73.85 }; // Missing 'current'
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502) {
      missingCurrentCaught = true;
    }
  }
  assert(missingCurrentCaught, 'E.1 Missing "current" payload throws 502 Bad Gateway');

  let missingHourlyCaught = false;
  mockAxios.mockResponse = { latitude: 18.52, longitude: 73.85 }; // Missing 'hourly'
  try {
    await provider.fetchRecentHourlyWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502) {
      missingHourlyCaught = true;
    }
  }
  assert(missingHourlyCaught, 'E.2 Missing "hourly" payload throws 502 Bad Gateway');

  // ---------------------------------------------------------------------------
  // F. Mismatched Hourly Array Handling
  // ---------------------------------------------------------------------------
  let mismatchedCaught = false;
  mockAxios.mockResponse = {
    latitude: 18.52,
    longitude: 73.85,
    hourly: {
      time: ['2026-09-22T00:00', '2026-09-22T01:00'],
      temperature_2m: [25.0], // Length 1 vs time length 2
      relative_humidity_2m: [60, 65],
      precipitation: [0, 0],
      wind_speed_10m: [10, 12],
      wind_gusts_10m: [15, 18],
      weather_code: [1, 2],
    },
  };
  try {
    await provider.fetchRecentHourlyWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502 && err.message.includes('Mismatched hourly array lengths')) {
      mismatchedCaught = true;
    }
  }
  assert(mismatchedCaught, 'F.1 Mismatched hourly array length throws 502 Bad Gateway with descriptive reason');

  // ---------------------------------------------------------------------------
  // G. Invalid Timestamp Handling
  // ---------------------------------------------------------------------------
  let invalidTimestampCaught = false;
  try {
    provider.parseUtcTimestamp('invalid-date-not-a-timestamp');
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502) {
      invalidTimestampCaught = true;
    }
  }
  assert(invalidTimestampCaught, 'G.1 Unparseable timestamp throws 502 Bad Gateway');

  // ---------------------------------------------------------------------------
  // H. HTTP Error Handling (429 Rate Limit, 500 Server Error, 400 Bad Request)
  // ---------------------------------------------------------------------------
  let rateLimitCaught = false;
  mockAxios.mockError = {
    isAxiosError: true,
    response: { status: 429, data: { error: true, reason: 'Daily quota exceeded' } },
  };
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 429) {
      rateLimitCaught = true;
    }
  }
  assert(rateLimitCaught, 'H.1 Open-Meteo HTTP 429 translates to AppError 429 (Too Many Requests)');

  let serverErrorCaught = false;
  mockAxios.mockError = {
    isAxiosError: true,
    response: { status: 503, data: { error: true, reason: 'Service unavailable' } },
  };
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503) {
      serverErrorCaught = true;
    }
  }
  assert(serverErrorCaught, 'H.2 Open-Meteo HTTP 503 translates to AppError 503 (Service Unavailable)');

  // ---------------------------------------------------------------------------
  // I. Timeout & Network Failure Handling
  // ---------------------------------------------------------------------------
  let timeoutCaught = false;
  mockAxios.mockError = {
    isAxiosError: true,
    code: 'ECONNABORTED',
    message: 'timeout of 8000ms exceeded',
  };
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503 && err.message.includes('timeout')) {
      timeoutCaught = true;
    }
  }
  assert(timeoutCaught, 'I.1 ECONNABORTED timeout translates to AppError 503 with timeout message');

  let networkFailureCaught = false;
  mockAxios.mockError = {
    isAxiosError: true,
    code: 'ENOTFOUND',
    request: {},
    message: 'getaddrinfo ENOTFOUND api.open-meteo.com',
  };
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503 && err.message.includes('Could not connect to Open-Meteo')) {
      networkFailureCaught = true;
    }
  }
  assert(networkFailureCaught, 'I.2 Network failure translates to AppError 503 (Service Unavailable)');

  // ---------------------------------------------------------------------------
  // J. Malformed Provider Response Handling (Metrics Validation)
  // ---------------------------------------------------------------------------
  let negativeRainCaught = false;
  mockAxios.mockError = null;
  mockAxios.mockResponse = {
    latitude: 18.52,
    longitude: 73.85,
    current: {
      time: '2026-09-22T06:30',
      temperature_2m: 25.0,
      relative_humidity_2m: 60,
      precipitation: -5.0, // Negative rainfall!
      wind_speed_10m: 10,
      wind_gusts_10m: 15,
      weather_code: 1,
    },
  };
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502 && err.message.includes('Invalid precipitation value')) {
      negativeRainCaught = true;
    }
  }
  assert(negativeRainCaught, 'J.1 Negative precipitation value is rejected with 502 Bad Gateway');

  let invalidHumidityCaught = false;
  mockAxios.mockResponse = {
    latitude: 18.52,
    longitude: 73.85,
    current: {
      time: '2026-09-22T06:30',
      temperature_2m: 25.0,
      relative_humidity_2m: 120, // > 100%!
      precipitation: 0.0,
      wind_speed_10m: 10,
      wind_gusts_10m: 15,
      weather_code: 1,
    },
  };
  try {
    await provider.fetchCurrentWeather(18.52, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 502 && err.message.includes('Invalid humidity percentage')) {
      invalidHumidityCaught = true;
    }
  }
  assert(invalidHumidityCaught, 'J.2 Humidity > 100% is rejected with 502 Bad Gateway');

  // ---------------------------------------------------------------------------
  // K. Raw Open-Meteo Response Not Exposed
  // ---------------------------------------------------------------------------
  mockAxios.mockResponse = {
    latitude: 18.52,
    longitude: 73.85,
    generationtime_ms: 0.04,
    utc_offset_seconds: 0,
    timezone: 'UTC',
    elevation: 560,
    current: {
      time: '2026-09-22T06:30',
      temperature_2m: 25.0,
      relative_humidity_2m: 60,
      precipitation: 0.0,
      wind_speed_10m: 10,
      wind_gusts_10m: 15,
      weather_code: 1,
    },
  };
  const normalized = await provider.fetchCurrentWeather(18.52, 73.85);
  const keys = Object.keys(normalized);
  assert(!keys.includes('current'), 'K.1 Normalized DTO does not expose raw "current" object');
  assert(!keys.includes('generationtime_ms'), 'K.2 Normalized DTO does not expose "generationtime_ms"');
  assert(!keys.includes('utc_offset_seconds'), 'K.3 Normalized DTO does not expose "utc_offset_seconds"');
  assert(!keys.includes('elevation'), 'K.4 Normalized DTO does not expose "elevation"');
  assert(!keys.includes('temperature_2m'), 'K.5 Normalized DTO does not expose raw "temperature_2m" property');
  assert(keys.includes('temperatureC'), 'K.6 Normalized DTO exposes domain property "temperatureC"');
  assert(keys.includes('source'), 'K.7 Normalized DTO exposes domain property "source"');

  // ---------------------------------------------------------------------------
  // L. Coordinate Bounds Validation
  // ---------------------------------------------------------------------------
  let invalidLatCaught = false;
  try {
    await provider.fetchCurrentWeather(95.0, 73.85);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      invalidLatCaught = true;
    }
  }
  assert(invalidLatCaught, 'L.1 Out-of-bounds latitude (95°) rejected with 400 Bad Request');

  let invalidLonCaught = false;
  try {
    await provider.fetchCurrentWeather(18.52, 195.0);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      invalidLonCaught = true;
    }
  }
  assert(invalidLonCaught, 'L.2 Out-of-bounds longitude (195°) rejected with 400 Bad Request');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Weather Provider Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runWeatherProviderUnitTests().catch((error) => {
  console.error('Fatal error during weather provider unit test run:', error);
  process.exit(1);
});
