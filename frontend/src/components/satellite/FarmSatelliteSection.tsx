/**
 * Module 7: Stage 7.2-F — F-6
 * Farm Satellite Section Orchestrator
 *
 * Top-level container component orchestrating:
 * 1. SatelliteSyncControls (F-4) — Manual synchronization trigger & audit
 * 2. NdviSummaryCard (F-3) — Latest NDVI observation display & classification
 * 3. NdviHistoryChart (F-5) — Historical NDVI time-series trajectory
 *
 * Responsibilities:
 * - Coordinates parallel data fetching for latest & historical observations
 * - Handles HTTP 404 as normal "no data yet" empty state
 * - Refreshes latest & historical data upon successful synchronization (onSyncSuccess)
 * - Passes boundary prerequisite to sync controls
 * - Never calculates NDVI, risk, or classification client-side
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Satellite,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { satelliteService } from '../../services/satelliteService';
import {
  NdviObservationDTO,
  SatelliteSyncResultDTO,
} from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { NdviSummaryCard } from './NdviSummaryCard';
import { SatelliteSyncControls } from './SatelliteSyncControls';
import { NdviHistoryChart } from './NdviHistoryChart';

export interface FarmSatelliteSectionProps {
  farmId: string;
  hasBoundary: boolean;
  // Optional injection props for deterministic testing & SSR
  initialLatest?: NdviObservationDTO | null;
  initialHistorical?: NdviObservationDTO[];
  initialLoadingLatest?: boolean;
  initialLoadingHistory?: boolean;
  initialLatestError?: string | null;
  initialHistoryError?: string | null;
}

export const FarmSatelliteSection: React.FC<FarmSatelliteSectionProps> = ({
  farmId,
  hasBoundary,
  initialLatest = null,
  initialHistorical = [],
  initialLoadingLatest = false,
  initialLoadingHistory = false,
  initialLatestError = null,
  initialHistoryError = null,
}) => {
  // State: Latest observation
  const [latestObservation, setLatestObservation] = useState<NdviObservationDTO | null>(
    initialLatest
  );
  const [loadingLatest, setLoadingLatest] = useState<boolean>(initialLoadingLatest);
  const [latestError, setLatestError] = useState<string | null>(initialLatestError);

  // State: Historical observations
  const [historicalObservations, setHistoricalObservations] = useState<NdviObservationDTO[]>(
    initialHistorical
  );
  const [loadingHistory, setLoadingHistory] = useState<boolean>(initialLoadingHistory);
  const [historyError, setHistoryError] = useState<string | null>(initialHistoryError);

  // Concurrency & mounting safety
  const isMountedRef = useRef<boolean>(true);
  const isRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const parseErrorMessage = (err: unknown, fallback: string): string => {
    const anyErr = err as any;
    const status = anyErr?.response?.status;
    const msg = anyErr?.response?.data?.message || anyErr?.message;

    if (status === 404) {
      return fallback;
    }
    if (status === 429) {
      return 'Satellite data rate limit reached. Please wait a moment before trying again.';
    }
    if (status === 503) {
      return 'Satellite observation service is temporarily unavailable. Please try again.';
    }
    return msg || fallback;
  };

  /**
   * Fetch the newest persisted NDVI observation from PostgreSQL.
   * HTTP 404 is treated as a normal empty state ("no observation yet").
   */
  const fetchLatestNdvi = useCallback(async (): Promise<void> => {
    try {
      setLoadingLatest(true);
      setLatestError(null);
      const res = await satelliteService.getLatestNdvi(farmId);
      if (isMountedRef.current) {
        setLatestObservation(res.data);
      }
    } catch (err: unknown) {
      const anyErr = err as any;
      if (isMountedRef.current) {
        if (anyErr?.response?.status === 404) {
          // Normal state: no observations have been synced yet
          setLatestObservation(null);
        } else {
          setLatestError(
            parseErrorMessage(err, 'Failed to retrieve latest satellite observation.')
          );
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingLatest(false);
      }
    }
  }, [farmId]);

  /**
   * Fetch historical NDVI observations from PostgreSQL.
   * HTTP 404 is treated as an empty dataset.
   */
  const fetchHistoricalNdvi = useCallback(async (): Promise<void> => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const res = await satelliteService.getHistoricalNdvi(farmId);
      if (isMountedRef.current) {
        setHistoricalObservations(res.data || []);
      }
    } catch (err: unknown) {
      const anyErr = err as any;
      if (isMountedRef.current) {
        if (anyErr?.response?.status === 404) {
          setHistoricalObservations([]);
        } else {
          setHistoryError(
            parseErrorMessage(err, 'Failed to retrieve historical satellite observations.')
          );
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingHistory(false);
      }
    }
  }, [farmId]);

  /**
   * Parallel initial data fetch on mount or farmId change.
   */
  useEffect(() => {
    // If initial values were passed for testing, skip auto-fetch
    if (
      initialLatest !== null ||
      initialHistorical.length > 0 ||
      initialLoadingLatest ||
      initialLoadingHistory ||
      initialLatestError !== null ||
      initialHistoryError !== null
    ) {
      return;
    }

    if (!hasBoundary) {
      // Avoid unnecessary queries when boundary is missing
      setLatestObservation(null);
      setHistoricalObservations([]);
      return;
    }

    // Parallel fetch for latest and history
    fetchLatestNdvi();
    fetchHistoricalNdvi();
  }, [
    farmId,
    hasBoundary,
    fetchLatestNdvi,
    fetchHistoricalNdvi,
    initialLatest,
    initialHistorical,
    initialLoadingLatest,
    initialLoadingHistory,
    initialLatestError,
    initialHistoryError,
  ]);

  /**
   * Refreshes both latest and historical data after a successful manual sync.
   * Prevents concurrent double-refreshes.
   */
  const handleSyncSuccess = async (_result: SatelliteSyncResultDTO): Promise<void> => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      await Promise.allSettled([fetchLatestNdvi(), fetchHistoricalNdvi()]);
    } finally {
      isRefreshingRef.current = false;
    }
  };

  /**
   * Manual refresh handler from the section header.
   */
  const handleManualRefresh = async (): Promise<void> => {
    if (loadingLatest || loadingHistory || isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      await Promise.allSettled([fetchLatestNdvi(), fetchHistoricalNdvi()]);
    } finally {
      isRefreshingRef.current = false;
    }
  };

  return (
    <div
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-7"
      data-testid="farm-satellite-section"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Satellite className="w-6 h-6 text-indigo-600" aria-hidden="true" />
            <h2 className="text-xl font-bold text-slate-900">Satellite Remote Sensing & NDVI</h2>
          </div>
          <p className="text-xs text-slate-500">
            Copernicus Sentinel-2 optical imagery (10m BOA surface reflectance) and farm-level vegetation index tracking.
          </p>
        </div>

        {/* Section Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loadingLatest || loadingHistory || !hasBoundary}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shadow-xs ${
              loadingLatest || loadingHistory || !hasBoundary
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 active:scale-95'
            }`}
            title={
              !hasBoundary
                ? 'Digitize a farm boundary first to enable satellite observation refresh'
                : 'Refresh satellite observations from database'
            }
            data-testid="satellite-refresh-button"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingLatest || loadingHistory ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Part 1: Satellite Synchronization Controls (F-4) */}
      <SatelliteSyncControls
        farmId={farmId}
        hasBoundary={hasBoundary}
        onSyncSuccess={handleSyncSuccess}
      />

      {/* Part 2: Latest NDVI Summary (F-3) */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Latest Vegetation Health (NDVI)
          </h3>
          {latestObservation && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Observed: {new Date(latestObservation.observedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {loadingLatest ? (
          <div
            className="p-8 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col items-center justify-center space-y-2"
            data-testid="latest-ndvi-loading"
          >
            <LoadingSpinner size="md" />
            <span className="text-xs text-slate-500 font-medium">
              Loading latest NDVI observation...
            </span>
          </div>
        ) : latestError ? (
          <div
            className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 shadow-xs"
            data-testid="latest-ndvi-error"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" aria-hidden="true" />
            <span>{latestError}</span>
          </div>
        ) : !latestObservation ? (
          <div
            className="p-8 rounded-2xl bg-slate-50/70 border border-dashed border-slate-300 flex flex-col items-center text-center space-y-3"
            data-testid="latest-ndvi-empty"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Satellite className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">
                No Satellite Observation Synchronized Yet
              </h4>
              <p className="text-xs text-slate-500 max-w-md">
                NDVI observations have not been synchronized for this farm parcel yet. Use the synchronization controls above to query Copernicus Sentinel-2.
              </p>
            </div>
          </div>
        ) : (
          <NdviSummaryCard observation={latestObservation} />
        )}
      </div>

      {/* Part 3: Historical NDVI Trend Chart (F-5) */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">Historical NDVI Trend</h3>
          <p className="text-xs text-slate-500">
            Zonal mean vegetative trajectory across Sentinel-2 overpasses.
          </p>
        </div>

        <NdviHistoryChart
          observations={historicalObservations}
          loading={loadingHistory}
          error={historyError}
        />
      </div>
    </div>
  );
};
