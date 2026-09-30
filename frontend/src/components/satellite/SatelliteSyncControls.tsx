/**
 * Module 7: Stage 7.2-F — F-4
 * Satellite Sync Controls Component
 *
 * Provides manual satellite synchronization controls:
 * - Start Date (From) & End Date (To) selection
 * - Optional Maximum Cloud Coverage (%) filter
 * - Boundary requirement enforcement
 * - Loading, success audit results, validation errors, and API error states
 * - Dispatches strictly via satelliteService.syncSatellite(farmId, payload)
 *
 * NOTE: The frontend NEVER calls Copernicus directly.
 * All requests route through the AgriShield backend API gateway.
 */

import React, { useState } from 'react';
import {
  Satellite,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { satelliteService } from '../../services/satelliteService';
import {
  SatelliteSyncRequest,
  SatelliteSyncResultDTO,
} from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';

/**
 * Returns today's date in local YYYY-MM-DD format.
 */
export const getTodayStr = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns a default start date (14 days before today) in local YYYY-MM-DD format.
 */
export const getDefaultFromDateStr = (): string => {
  const d = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Converts date strings into valid ISO-8601 timestamps for the backend contract.
 * If toDateStr is today, clamps to now.toISOString() to prevent clock skew / future date rejection.
 */
export const formatSyncRangeToIso = (
  fromDateStr: string,
  toDateStr: string
): { from: string; to: string } => {
  const fromIso = `${fromDateStr}T00:00:00.000Z`;
  const endOfDay = new Date(`${toDateStr}T23:59:59.999Z`);
  const now = new Date();
  const toIso = endOfDay > now ? now.toISOString() : endOfDay.toISOString();
  return { from: fromIso, to: toIso };
};

export interface SyncValidationErrors {
  fromDate?: string;
  toDate?: string;
  maxCloudCoverage?: string;
  boundary?: string;
  general?: string;
}

/**
 * Pure validation logic for satellite synchronization inputs.
 */
export function validateSyncInput(
  fromDate: string,
  toDate: string,
  maxCloudCoverage: string,
  hasBoundary: boolean
): { valid: boolean; errors: SyncValidationErrors; payload?: SatelliteSyncRequest } {
  const errors: SyncValidationErrors = {};

  if (!hasBoundary) {
    errors.boundary =
      'Farm boundary is required before satellite synchronization can be performed.';
  }

  if (!fromDate || !fromDate.trim()) {
    errors.fromDate = 'Start date (From) is required.';
  }

  if (!toDate || !toDate.trim()) {
    errors.toDate = 'End date (To) is required.';
  }

  const todayStr = getTodayStr();

  if (fromDate && toDate) {
    if (fromDate > toDate) {
      errors.fromDate = 'Start date (From) cannot be after End date (To).';
    }
    if (toDate > todayStr) {
      errors.toDate = 'End date (To) cannot be in the future.';
    }
  }

  let parsedCloud: number | undefined = undefined;
  if (maxCloudCoverage && maxCloudCoverage.trim() !== '') {
    const num = Number(maxCloudCoverage.trim());
    if (isNaN(num)) {
      errors.maxCloudCoverage = 'Maximum cloud coverage must be a valid number.';
    } else if (num < 0 || num > 100) {
      errors.maxCloudCoverage = 'Maximum cloud coverage must be between 0% and 100%.';
    } else {
      parsedCloud = num;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  const { from: fromIso, to: toIso } = formatSyncRangeToIso(fromDate, toDate);

  const payload: SatelliteSyncRequest = {
    from: fromIso,
    to: toIso,
    ...(parsedCloud !== undefined ? { maxCloudCoverage: parsedCloud } : {}),
  };

  return { valid: true, errors: {}, payload };
}

/**
 * Translates Axios/API errors into contextual user-friendly messages.
 */
export const parseSyncErrorMessage = (err: unknown, fallback: string): string => {
  const anyErr = err as any;
  const status = anyErr?.response?.status;
  const msg = anyErr?.response?.data?.message || anyErr?.message;

  if (status === 400) {
    return msg || 'Invalid synchronization parameters.';
  }
  if (status === 404 && msg?.toLowerCase().includes('boundary')) {
    return 'Farm boundary not found. Please digitize a boundary before syncing satellite data.';
  }
  if (status === 404) {
    return 'Farm parcel not found.';
  }
  if (status === 409) {
    return msg || 'Satellite synchronization conflict occurred.';
  }
  if (status === 429) {
    return 'Copernicus Data Space rate limit reached. Please wait a moment before trying again.';
  }
  if (status === 503) {
    return 'Copernicus Data Space Ecosystem is temporarily unavailable. Please try again later.';
  }
  return msg || fallback;
};

export interface SatelliteSyncControlsProps {
  farmId: string;
  hasBoundary: boolean;
  onSyncSuccess?: (result: SatelliteSyncResultDTO) => void;
  // Optional injection props for deterministic testing
  initialFromDate?: string;
  initialToDate?: string;
  initialMaxCloudCoverage?: string;
  initialSyncing?: boolean;
  initialResult?: SatelliteSyncResultDTO | null;
  initialError?: string | null;
}

export const SatelliteSyncControls: React.FC<SatelliteSyncControlsProps> = ({
  farmId,
  hasBoundary,
  onSyncSuccess,
  initialFromDate,
  initialToDate,
  initialMaxCloudCoverage = '',
  initialSyncing = false,
  initialResult = null,
  initialError = null,
}) => {
  const [fromDate, setFromDate] = useState<string>(
    initialFromDate !== undefined ? initialFromDate : getDefaultFromDateStr()
  );
  const [toDate, setToDate] = useState<string>(
    initialToDate !== undefined ? initialToDate : getTodayStr()
  );
  const [maxCloudCoverage, setMaxCloudCoverage] = useState<string>(initialMaxCloudCoverage);

  const [syncing, setSyncing] = useState<boolean>(initialSyncing);
  const [syncResult, setSyncResult] = useState<SatelliteSyncResultDTO | null>(initialResult);
  const [error, setError] = useState<string | null>(initialError);
  const [validationErrors, setValidationErrors] = useState<SyncValidationErrors>({});

  const handleSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (syncing || !hasBoundary) return;

    const validation = validateSyncInput(fromDate, toDate, maxCloudCoverage, hasBoundary);
    if (!validation.valid || !validation.payload) {
      setValidationErrors(validation.errors);
      return;
    }

    setValidationErrors({});
    setSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const res = await satelliteService.syncSatellite(farmId, validation.payload);
      setSyncResult(res.data);
      if (onSyncSuccess) {
        onSyncSuccess(res.data);
      }
    } catch (err: unknown) {
      setError(
        parseSyncErrorMessage(err, 'Failed to synchronize satellite observations. Please try again.')
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="satellite-sync-controls">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            <h3 className="text-base font-bold text-slate-900">Satellite Data Synchronization</h3>
          </div>
          <p className="text-xs text-slate-500">
            Query Copernicus Sentinel-2 MSI Level-2A surface reflectance for the farm parcel boundary.
          </p>
        </div>
      </div>

      {/* Boundary Missing Warning Banner */}
      {!hasBoundary && (
        <div
          className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3 shadow-sm"
          data-testid="sync-boundary-warning"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <div className="font-bold text-amber-950">Farm Boundary Required</div>
            <p className="text-amber-900/90 leading-relaxed">
              Satellite synchronization requires a registered geospatial farm boundary to define the polygon area of interest (AOI) for Copernicus Sentinel-2 pixel sampling. Please digitize a boundary before syncing.
            </p>
          </div>
        </div>
      )}

      {/* General Validation / Boundary Error Banner */}
      {validationErrors.boundary && (
        <div
          className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2"
          data-testid="validation-boundary-error"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          <span>{validationErrors.boundary}</span>
        </div>
      )}

      {/* Sync Inputs Form */}
      <form onSubmit={handleSync} className="space-y-4" data-testid="sync-form">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* From Date */}
          <div>
            <label
              htmlFor="sync-from-date"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Start Date (From) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="sync-from-date"
                name="fromDate"
                type="date"
                value={fromDate}
                max={getTodayStr()}
                disabled={syncing || !hasBoundary}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  if (validationErrors.fromDate) {
                    setValidationErrors((prev) => ({ ...prev, fromDate: undefined }));
                  }
                }}
                className={`w-full text-xs rounded-xl border px-3 py-2 text-slate-800 bg-white transition-all focus:outline-none focus:ring-2 ${
                  validationErrors.fromDate
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-slate-200 focus:ring-indigo-100 focus:border-indigo-500'
                } ${syncing || !hasBoundary ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                data-testid="sync-from-date-input"
              />
            </div>
            {validationErrors.fromDate && (
              <p
                className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium"
                data-testid="error-from-date"
              >
                <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {validationErrors.fromDate}
              </p>
            )}
          </div>

          {/* To Date */}
          <div>
            <label
              htmlFor="sync-to-date"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              End Date (To) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="sync-to-date"
                name="toDate"
                type="date"
                value={toDate}
                max={getTodayStr()}
                disabled={syncing || !hasBoundary}
                onChange={(e) => {
                  setToDate(e.target.value);
                  if (validationErrors.toDate) {
                    setValidationErrors((prev) => ({ ...prev, toDate: undefined }));
                  }
                }}
                className={`w-full text-xs rounded-xl border px-3 py-2 text-slate-800 bg-white transition-all focus:outline-none focus:ring-2 ${
                  validationErrors.toDate
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-slate-200 focus:ring-indigo-100 focus:border-indigo-500'
                } ${syncing || !hasBoundary ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                data-testid="sync-to-date-input"
              />
            </div>
            {validationErrors.toDate && (
              <p
                className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium"
                data-testid="error-to-date"
              >
                <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {validationErrors.toDate}
              </p>
            )}
          </div>

          {/* Max Cloud Coverage (Optional) */}
          <div>
            <label
              htmlFor="sync-cloud-coverage"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Max Cloud Coverage (%) <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <input
                id="sync-cloud-coverage"
                name="maxCloudCoverage"
                type="number"
                min="0"
                max="100"
                step="any"
                placeholder="Optional (0 – 100)"
                value={maxCloudCoverage}
                disabled={syncing || !hasBoundary}
                onChange={(e) => {
                  setMaxCloudCoverage(e.target.value);
                  if (validationErrors.maxCloudCoverage) {
                    setValidationErrors((prev) => ({ ...prev, maxCloudCoverage: undefined }));
                  }
                }}
                className={`w-full text-xs rounded-xl border px-3 py-2 text-slate-800 bg-white transition-all focus:outline-none focus:ring-2 ${
                  validationErrors.maxCloudCoverage
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-slate-200 focus:ring-indigo-100 focus:border-indigo-500'
                } ${syncing || !hasBoundary ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                data-testid="sync-cloud-input"
              />
            </div>
            {validationErrors.maxCloudCoverage && (
              <p
                className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium"
                data-testid="error-cloud-coverage"
              >
                <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {validationErrors.maxCloudCoverage}
              </p>
            )}
          </div>
        </div>

        {/* Sync Action Button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={syncing || !hasBoundary}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-sm ${
              syncing || !hasBoundary
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95'
            }`}
            title={
              !hasBoundary
                ? 'Digitize a farm boundary first to enable satellite synchronization'
                : 'Synchronize satellite observations from Copernicus Sentinel-2'
            }
            data-testid="sync-submit-button"
          >
            {syncing ? (
              <>
                <LoadingSpinner size="sm" className="text-emerald-700" />
                <span data-testid="sync-loading-text">Syncing satellite observations...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Sync Satellite Data</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Successful Synchronization Result Card */}
      {syncResult && (
        <div
          className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-3 shadow-sm animate-fadeIn"
          data-testid="sync-result-box"
        >
          <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
            <span>Satellite Synchronization Completed</span>
          </div>

          {/* Counts Grid */}
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-xs">
              <span className="text-slate-500 block text-[11px]">Fetched Scenes</span>
              <span
                className="text-lg font-black font-mono text-slate-900"
                data-testid="sync-total-fetched"
              >
                {syncResult.totalFetched}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-xs">
              <span className="text-emerald-700 block text-[11px] font-medium">Synced Records</span>
              <span
                className="text-lg font-black font-mono text-emerald-700"
                data-testid="sync-synced-count"
              >
                {syncResult.syncedCount}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-xs">
              <span className="text-slate-500 block text-[11px]">No-Data Skipped</span>
              <span
                className="text-lg font-black font-mono text-slate-700"
                data-testid="sync-skipped-count"
              >
                {syncResult.skippedNoDataCount}
              </span>
            </div>
          </div>

          {/* Skipped NO_DATA Informative Notice */}
          {syncResult.skippedNoDataCount > 0 && (
            <div
              className="text-xs text-amber-800 bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2"
              data-testid="sync-skipped-notice"
            >
              <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Some satellite observations contained no usable data and were skipped ({syncResult.skippedNoDataCount} skipped).
              </span>
            </div>
          )}

          {/* Zero Observation Explanation */}
          {syncResult.syncedCount === 0 && (
            <div
              className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5"
              data-testid="sync-zero-notice"
            >
              {syncResult.totalFetched === 0
                ? 'No satellite scenes were found for this farm parcel in the selected date range.'
                : 'All fetched satellite observations contained no-data pixels or heavy clouds and were skipped.'}
            </div>
          )}
        </div>
      )}

      {/* API / Network Error Banner */}
      {error && (
        <div
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5 shadow-sm animate-fadeIn"
          data-testid="sync-error-box"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5 flex-1">
            <div className="font-bold text-rose-950">Synchronization Failed</div>
            <p className="text-rose-800/90" data-testid="sync-error-message">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-700 font-bold text-sm ml-2"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Provenance Notice */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-700">Copernicus Sentinel-2 Integration: </span>
        Directly queries European Space Agency (ESA) Copernicus Data Space Ecosystem via the Sentinel Hub Statistical API. Observations are normalized and persisted in PostgreSQL for parametric crop-risk indexing.
      </div>
    </div>
  );
};
