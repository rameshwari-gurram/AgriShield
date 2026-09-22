/**
 * Module 5: Farm Weather Monitoring Section
 * Displays current weather summary, query metadata, synchronization controls,
 * historical trend visualizations, and authoritative traceability disclaimers.
 *
 * Traceability & Attribution:
 * Stores the centroid coordinates used for the weather query, preserving query-location traceability.
 * Model-derived weather data for the farm centroid coordinates.
 * Not an on-site physical weather-station measurement.
 * Data source attributed to "Open-Meteo".
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CloudSun,
  Thermometer,
  Droplets,
  CloudRain,
  Wind,
  Compass,
  RefreshCw,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Info,
  Calendar,
} from 'lucide-react';
import { weatherService } from '../../services/weatherService';
import { WeatherRecord } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { WeatherHistoryChart } from './WeatherHistoryChart';
import { getWeatherCondition } from '../../utils/weatherCodes';

interface FarmWeatherSectionProps {
  farmId: string;
  hasBoundary: boolean;
  centroidCoordinates?: {
    latitude: number;
    longitude: number;
  };
}

export const FarmWeatherSection: React.FC<FarmWeatherSectionProps> = ({
  farmId,
  hasBoundary,
  centroidCoordinates,
}) => {
  // Weather state
  const [latestWeather, setLatestWeather] = useState<WeatherRecord | null>(null);
  const [historicalRecords, setHistoricalRecords] = useState<WeatherRecord[]>([]);

  // Loading & sync states
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Errors & notifications
  const [latestError, setLatestError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Date range state for historical chart (default: last 48 hours)
  const defaultToDate = new Date().toISOString().split('T')[0];
  const defaultFromDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);

  // Helper to translate backend errors into user-friendly messages
  const parseErrorMessage = (err: unknown, fallback: string): string => {
    const anyErr = err as any;
    const status = anyErr?.response?.status;
    const msg = anyErr?.response?.data?.message || anyErr?.message;

    if (status === 404) {
      return 'Weather data is not available for this farm yet.';
    }
    if (status === 429) {
      return 'Weather service rate limit reached. Please try again later.';
    }
    if (status === 503) {
      return 'Weather service is temporarily unavailable. Please try again.';
    }
    if (status === 400 && msg?.includes('boundary not found')) {
      return 'Farm boundary not found. Please digitize a boundary before syncing weather.';
    }
    return msg || fallback;
  };

  // Fetch latest weather from PostgreSQL
  const fetchLatestWeather = useCallback(async () => {
    try {
      setLoadingLatest(true);
      setLatestError(null);
      const res = await weatherService.getLatestWeather(farmId);
      setLatestWeather(res.data);
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.response?.status === 404) {
        // Normal state for a new farm parcel with 0 syncs
        setLatestWeather(null);
      } else {
        setLatestError(parseErrorMessage(err, 'Failed to retrieve latest weather.'));
      }
    } finally {
      setLoadingLatest(false);
    }
  }, [farmId]);

  // Fetch historical weather observations from PostgreSQL
  const fetchHistoricalWeather = useCallback(
    async (start: string, end: string) => {
      try {
        setLoadingHistory(true);
        setHistoryError(null);

        // Append UTC bounds for clean full-day coverage
        const fromIso = `${start}T00:00:00Z`;
        const toIso = `${end}T23:59:59Z`;

        const res = await weatherService.getHistoricalWeather(farmId, fromIso, toIso, 150);
        setHistoricalRecords(res.data);
      } catch (err: unknown) {
        setHistoryError(parseErrorMessage(err, 'Failed to retrieve historical observations.'));
      } finally {
        setLoadingHistory(false);
      }
    },
    [farmId]
  );

  // Initial load
  useEffect(() => {
    fetchLatestWeather();
    fetchHistoricalWeather(fromDate, toDate);
  }, [fetchLatestWeather, fetchHistoricalWeather, fromDate, toDate]);

  // Handle manual weather synchronization
  const handleSyncWeather = async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      setSyncNotice(null);

      const res = await weatherService.syncWeather(farmId);
      const syncData = res.data;

      // Update latest record
      setLatestWeather(syncData.record);
      setLatestError(null);

      // Refresh historical trends
      await fetchHistoricalWeather(fromDate, toDate);

      // Display informative result
      if (syncData.isInitialBackfill) {
        setSyncNotice({
          type: 'success',
          message: `Initial synchronization successful: ${syncData.recordsSynced} observations backfilled (including current and preceding 24h hourly data).`,
        });
      } else {
        setSyncNotice({
          type: 'success',
          message: `Weather synchronized: recorded latest observation from ${syncData.source}.`,
        });
      }
    } catch (err: unknown) {
      setSyncNotice({
        type: 'error',
        message: parseErrorMessage(err, 'Weather synchronization failed. Please try again.'),
      });
    } finally {
      setSyncing(false);
    }
  };

  // Preset date window filters
  const applyPresetWindow = (daysBack: number) => {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().split('T')[0];
    setFromDate(start);
    setToDate(end);
    fetchHistoricalWeather(start, end);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-7">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CloudSun className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-slate-900">Hyper-Local Weather Data</h2>
          </div>
          <p className="text-xs text-slate-500">
            Automated model observations referenced to the farm parcel's geographic centroid.
          </p>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSyncWeather}
            disabled={syncing || !hasBoundary}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-sm ${
              syncing || !hasBoundary
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95'
            }`}
            title={!hasBoundary ? 'Digitize a farm boundary first to enable weather sync' : 'Sync weather from Open-Meteo'}
          >
            {syncing ? (
              <>
                <LoadingSpinner size="sm" className="text-emerald-700" />
                <span>Synchronizing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync Weather</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Boundary Missing Warning Banner */}
      {!hasBoundary && (
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-amber-950">Boundary Required for Weather Synchronization</div>
            <p className="leading-relaxed text-amber-900/90">
              Weather model queries require authoritative geographic centroid coordinates derived from a digitized farm polygon. Please draw and save a boundary above to enable automated synchronization.
            </p>
          </div>
        </div>
      )}

      {/* Sync Status Toast / Notification */}
      {syncNotice && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-start gap-3 border transition-all animate-fadeIn ${
            syncNotice.type === 'success'
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/90 border-rose-200 text-rose-950'
          }`}
        >
          {syncNotice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="font-semibold">{syncNotice.type === 'success' ? 'Update Complete: ' : 'Sync Error: '}</span>
            <span>{syncNotice.message}</span>
          </div>
          <button
            onClick={() => setSyncNotice(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Current Weather Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Current Weather Summary
          </h3>
          {latestWeather && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Observed: {new Date(latestWeather.observedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {loadingLatest ? (
          <div className="p-8 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col items-center justify-center space-y-2">
            <LoadingSpinner size="md" />
            <span className="text-xs text-slate-500 font-medium">Loading weather data...</span>
          </div>
        ) : latestError ? (
          <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{latestError}</span>
          </div>
        ) : !latestWeather ? (
          /* Empty Weather State */
          <div className="p-8 rounded-2xl bg-slate-50/70 border border-dashed border-slate-300 flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CloudSun className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">No Weather Data Synchronized Yet</h4>
              <p className="text-xs text-slate-500 max-w-md">
                Weather observations have not yet been queried for this farm parcel. Click <strong>"Sync Weather"</strong> above to fetch current conditions and backfill the preceding 24 hours of hourly observations.
              </p>
            </div>
          </div>
        ) : (
          /* Populated Current Weather Cards */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* Condition */}
            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold uppercase">
                <CloudSun className="w-4 h-4 text-emerald-600" />
                <span>Condition</span>
              </div>
              <div className="text-sm font-bold text-slate-900 leading-tight">
                {latestWeather.weatherDescription || getWeatherCondition(latestWeather.weatherCode)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">WMO #{latestWeather.weatherCode}</div>
            </div>

            {/* Temperature */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold uppercase">
                <Thermometer className="w-4 h-4 text-rose-500" />
                <span>Temperature</span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {latestWeather.temperatureC}°<span className="text-xs font-semibold text-slate-500">C</span>
              </div>
              <div className="text-[10px] text-slate-400">At 2m elevation</div>
            </div>

            {/* Humidity */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold uppercase">
                <Droplets className="w-4 h-4 text-sky-500" />
                <span>Humidity</span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {latestWeather.humidityPercent}<span className="text-xs font-semibold text-slate-500">%</span>
              </div>
              <div className="text-[10px] text-slate-400">Relative humidity</div>
            </div>

            {/* Rainfall */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold uppercase">
                <CloudRain className="w-4 h-4 text-blue-500" />
                <span>Rainfall</span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {latestWeather.rainfallMm}<span className="text-xs font-semibold text-slate-500"> mm</span>
              </div>
              <div className="text-[10px] text-slate-400">Precipitation depth</div>
            </div>

            {/* Wind Speed */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold uppercase">
                <Wind className="w-4 h-4 text-teal-600" />
                <span>Wind Speed</span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {latestWeather.windSpeedKmh}<span className="text-xs font-semibold text-slate-500"> km/h</span>
              </div>
              <div className="text-[10px] text-slate-400">10m standard</div>
            </div>

            {/* Wind Gust */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold uppercase">
                <Compass className="w-4 h-4 text-indigo-500" />
                <span>Wind Gust</span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {latestWeather.windGustKmh}<span className="text-xs font-semibold text-slate-500"> km/h</span>
              </div>
              <div className="text-[10px] text-slate-400">Peak wind gust</div>
            </div>
          </div>
        )}
      </div>

      {/* Metadata & Spatial Traceability Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Attribution Card */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs text-slate-600">
          <div className="font-bold text-slate-800 flex items-center justify-between">
            <span>Data Provider & Attribution</span>
            <span className="font-mono text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded text-[11px]">
              {latestWeather?.source || 'Open-Meteo'}
            </span>
          </div>
          <div className="text-slate-500 leading-relaxed">
            Source: <strong className="text-slate-700">Open-Meteo</strong> Weather Forecast API (WMO NWP standard). Non-commercial open data for research and prototype telemetry.
          </div>
        </div>

        {/* Spatial Traceability Query Coordinates */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs text-slate-600">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            <span>Query Coordinates (Centroid Traceability)</span>
          </div>
          <div className="font-mono text-slate-800 font-semibold">
            Latitude: {latestWeather ? latestWeather.latitude.toFixed(6) : centroidCoordinates?.latitude.toFixed(6) || 'Pending'}° N,{' '}
            Longitude: {latestWeather ? latestWeather.longitude.toFixed(6) : centroidCoordinates?.longitude.toFixed(6) || 'Pending'}° E
          </div>
          <div className="text-[11px] text-slate-400">
            Extracted from the digitized boundary centroid for localized numerical weather modeling.
          </div>
        </div>
      </div>

      {/* Authoritative Weather Disclaimer */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1.5 shadow-sm leading-relaxed">
        <div className="font-bold text-slate-700 flex items-center gap-1.5">
          <Info className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <span>Weather Model & Traceability Disclaimer</span>
        </div>
        <p className="text-slate-600">
          Stores the centroid coordinates used for the weather query, preserving query-location traceability. Model-derived weather data for the farm centroid coordinates. Not an on-site physical weather-station measurement.
        </p>
      </div>

      {/* Historical Weather Trends & Date Range Controls */}
      <div className="space-y-4 pt-3 border-t border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Historical Weather Trends</h3>
            <p className="text-xs text-slate-500">
              Chronological observations persisted in PostgreSQL for parametric crop-risk evaluation.
            </p>
          </div>

          {/* Date Range Picker & Presets */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => applyPresetWindow(1)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              24 Hours
            </button>
            <button
              type="button"
              onClick={() => applyPresetWindow(7)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              7 Days
            </button>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent border-none text-xs focus:outline-none p-0 text-slate-800"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent border-none text-xs focus:outline-none p-0 text-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchHistoricalWeather(fromDate, toDate)}
              disabled={loadingHistory}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-medium transition-all text-xs"
            >
              Filter
            </button>
          </div>
        </div>

        {/* Recharts Component */}
        <WeatherHistoryChart
          records={historicalRecords}
          loading={loadingHistory}
          error={historyError}
        />
      </div>
    </div>
  );
};
