/**
 * Open-Meteo Weather Provider Implementation
 * Fetches and normalizes live atmospheric observations from Open-Meteo forecast REST API.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';
import {
  IWeatherProvider,
  NormalizedWeatherDTO,
  RawOpenMeteoCurrentResponse,
  RawOpenMeteoHourlyResponse,
} from '../types/weather.types.js';

export class OpenMeteoProvider implements IWeatherProvider {
  public readonly providerName = 'Open-Meteo';
  private client: AxiosInstance;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(
    client?: AxiosInstance,
    baseUrl: string = env.OPEN_METEO_BASE_URL,
    timeoutMs: number = env.WEATHER_REQUEST_TIMEOUT_MS
  ) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.client =
      client ||
      axios.create({
        baseURL: this.baseUrl,
        timeout: this.timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AgriShield-Parametric/1.0',
        },
      });
  }

  /**
   * Parse Open-Meteo timestamp consistently as UTC Date.
   */
  public parseUtcTimestamp(timeStr: unknown): Date {
    if (!timeStr || typeof timeStr !== 'string') {
      throw AppError.badGateway('Malformed provider response: Missing or invalid observation timestamp');
    }
    const isoString = timeStr.endsWith('Z') ? timeStr : `${timeStr}Z`;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      throw AppError.badGateway(`Malformed provider response: Unparseable observation timestamp '${timeStr}'`);
    }
    return date;
  }

  /**
   * Validate geographic coordinate bounds.
   */
  private validateCoordinates(latitude: number, longitude: number): void {
    if (
      typeof latitude !== 'number' ||
      !isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw AppError.badRequest(`Invalid centroid latitude: ${latitude}. Must be between -90 and 90.`);
    }
    if (
      typeof longitude !== 'number' ||
      !isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw AppError.badRequest(`Invalid centroid longitude: ${longitude}. Must be between -180 and 180.`);
    }
  }

  /**
   * Validate normalized numeric weather domain metrics.
   */
  private validateMetrics(
    temperature: number,
    humidity: number,
    rainfall: number,
    windSpeed: number,
    windGust: number,
    weatherCode: number,
    context: string = 'current'
  ): void {
    if (typeof temperature !== 'number' || !isFinite(temperature) || temperature < -100 || temperature > 75) {
      throw AppError.badGateway(`Malformed provider response (${context}): Invalid temperature value '${temperature}'`);
    }
    if (typeof humidity !== 'number' || !isFinite(humidity) || humidity < 0 || humidity > 100) {
      throw AppError.badGateway(`Malformed provider response (${context}): Invalid humidity percentage '${humidity}'`);
    }
    if (typeof rainfall !== 'number' || !isFinite(rainfall) || rainfall < 0) {
      throw AppError.badGateway(`Malformed provider response (${context}): Invalid precipitation value '${rainfall}'`);
    }
    if (typeof windSpeed !== 'number' || !isFinite(windSpeed) || windSpeed < 0) {
      throw AppError.badGateway(`Malformed provider response (${context}): Invalid wind speed value '${windSpeed}'`);
    }
    if (typeof windGust !== 'number' || !isFinite(windGust) || windGust < 0) {
      throw AppError.badGateway(`Malformed provider response (${context}): Invalid wind gust value '${windGust}'`);
    }
    if (typeof weatherCode !== 'number' || !isFinite(weatherCode) || weatherCode < 0 || weatherCode > 99) {
      throw AppError.badGateway(`Malformed provider response (${context}): Invalid WMO weather code '${weatherCode}'`);
    }
  }

  /**
   * Handle Axios network and HTTP errors and map to standard AppError.
   */
  private handleAxiosError(error: unknown, endpointDesc: string): never {
    if (axios.isAxiosError(error)) {
      const err = error as AxiosError;
      if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
        throw AppError.serviceUnavailable(
          `Weather provider timeout: Open-Meteo ${endpointDesc} request failed to respond within ${this.timeoutMs}ms`
        );
      }
      if (err.response) {
        const status = err.response.status;
        if (status === 429) {
          throw AppError.tooManyRequests(
            'Weather provider rate limit exceeded: Open-Meteo request quota or rate limit hit. Please retry shortly.'
          );
        }
        if (status >= 500) {
          throw AppError.serviceUnavailable(
            `Weather provider unavailable: Open-Meteo returned HTTP ${status} for ${endpointDesc}`
          );
        }
        throw AppError.badGateway(
          `Weather provider error: Open-Meteo returned HTTP ${status} for ${endpointDesc}`
        );
      }
      if (err.request) {
        throw AppError.serviceUnavailable(
          `Weather provider unavailable: Could not connect to Open-Meteo (${err.code || err.message})`
        );
      }
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw AppError.badGateway(
      `Weather provider communication error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  /**
   * Fetch live current weather observation for a given coordinate.
   */
  async fetchCurrentWeather(latitude: number, longitude: number): Promise<NormalizedWeatherDTO> {
    this.validateCoordinates(latitude, longitude);

    let data: RawOpenMeteoCurrentResponse;
    try {
      const response = await this.client.get<RawOpenMeteoCurrentResponse>('', {
        params: {
          latitude,
          longitude,
          current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code',
          timezone: 'UTC',
        },
      });
      data = response.data;
    } catch (error) {
      this.handleAxiosError(error, 'current weather');
    }

    if (!data || typeof data !== 'object') {
      throw AppError.badGateway('Malformed provider response: Expected JSON object from Open-Meteo');
    }

    const current = data.current;
    if (!current || typeof current !== 'object') {
      throw AppError.badGateway('Malformed provider response: Missing "current" payload in Open-Meteo response');
    }

    const observedAt = this.parseUtcTimestamp(current.time);

    this.validateMetrics(
      current.temperature_2m,
      current.relative_humidity_2m,
      current.precipitation,
      current.wind_speed_10m,
      current.wind_gusts_10m,
      current.weather_code,
      'current'
    );

    return {
      observedAt,
      latitude: typeof data.latitude === 'number' ? data.latitude : latitude,
      longitude: typeof data.longitude === 'number' ? data.longitude : longitude,
      temperatureC: current.temperature_2m,
      humidityPercent: current.relative_humidity_2m,
      rainfallMm: current.precipitation,
      windSpeedKmh: current.wind_speed_10m,
      windGustKmh: current.wind_gusts_10m,
      weatherCode: current.weather_code,
      source: this.providerName,
    };
  }

  /**
   * Fetch recent hourly weather observations for the preceding 24-hour window.
   * Discards future forecast hours and strictly normalizes past observations.
   */
  async fetchRecentHourlyWeather(
    latitude: number,
    longitude: number,
    referenceNow?: Date
  ): Promise<NormalizedWeatherDTO[]> {
    this.validateCoordinates(latitude, longitude);

    let data: RawOpenMeteoHourlyResponse;
    try {
      const response = await this.client.get<RawOpenMeteoHourlyResponse>('', {
        params: {
          latitude,
          longitude,
          hourly: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code',
          past_days: 1,
          forecast_days: 1,
          timezone: 'UTC',
        },
      });
      data = response.data;
    } catch (error) {
      this.handleAxiosError(error, 'hourly weather');
    }

    if (!data || typeof data !== 'object') {
      throw AppError.badGateway('Malformed provider response: Expected JSON object from Open-Meteo');
    }

    const hourly = data.hourly;
    if (!hourly || typeof hourly !== 'object') {
      throw AppError.badGateway('Malformed provider response: Missing "hourly" payload in Open-Meteo response');
    }

    const {
      time,
      temperature_2m,
      relative_humidity_2m,
      precipitation,
      wind_speed_10m,
      wind_gusts_10m,
      weather_code,
    } = hourly;

    if (
      !Array.isArray(time) ||
      !Array.isArray(temperature_2m) ||
      !Array.isArray(relative_humidity_2m) ||
      !Array.isArray(precipitation) ||
      !Array.isArray(wind_speed_10m) ||
      !Array.isArray(wind_gusts_10m) ||
      !Array.isArray(weather_code)
    ) {
      throw AppError.badGateway('Malformed provider response: One or more hourly arrays are missing or malformed');
    }

    const length = time.length;
    if (
      temperature_2m.length !== length ||
      relative_humidity_2m.length !== length ||
      precipitation.length !== length ||
      wind_speed_10m.length !== length ||
      wind_gusts_10m.length !== length ||
      weather_code.length !== length
    ) {
      throw AppError.badGateway(
        `Malformed provider response: Mismatched hourly array lengths in Open-Meteo payload (time: ${length}, temp: ${temperature_2m.length}, humidity: ${relative_humidity_2m.length})`
      );
    }

    // Determine the preceding 24-hour observation window (UTC)
    const now = referenceNow || new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = now;

    const normalizedRecords: NormalizedWeatherDTO[] = [];

    for (let i = 0; i < length; i++) {
      const observedAt = this.parseUtcTimestamp(time[i]);

      // Only include observations within the preceding 24-hour window (ignore future forecast hours)
      if (observedAt >= windowStart && observedAt <= windowEnd) {
        this.validateMetrics(
          temperature_2m[i],
          relative_humidity_2m[i],
          precipitation[i],
          wind_speed_10m[i],
          wind_gusts_10m[i],
          weather_code[i],
          `hourly index ${i}`
        );

        normalizedRecords.push({
          observedAt,
          latitude: typeof data.latitude === 'number' ? data.latitude : latitude,
          longitude: typeof data.longitude === 'number' ? data.longitude : longitude,
          temperatureC: temperature_2m[i],
          humidityPercent: relative_humidity_2m[i],
          rainfallMm: precipitation[i],
          windSpeedKmh: wind_speed_10m[i],
          windGustKmh: wind_gusts_10m[i],
          weatherCode: weather_code[i],
          source: this.providerName,
        });
      }
    }

    // Sort observations chronologically ascending
    normalizedRecords.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

    return normalizedRecords;
  }
}

export const openMeteoProvider = new OpenMeteoProvider();
