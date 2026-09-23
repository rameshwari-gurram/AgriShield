/**
 * Module 6 Stage 5B-1: Farm Climate Risk Dashboard Foundation
 * Container component for farm-level climate risk monitoring.
 *
 * NOTE: The frontend NEVER calculates thresholds, severity, or overall risk.
 * The backend is the single source of truth for all risk determinations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Play,
  RefreshCw,
  Clock,
  Layers,
  Activity,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { RiskAssessment } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';

export interface FarmRiskSectionProps {
  farmId: string;
  initialAssessment?: RiskAssessment | null;
  initialLoading?: boolean;
  initialError?: string | null;
  initialActionError?: string | null;
  initialRunning?: boolean;
}

export const FarmRiskSection: React.FC<FarmRiskSectionProps> = ({
  farmId,
  initialAssessment = null,
  initialLoading = true,
  initialError = null,
  initialActionError = null,
  initialRunning = false,
}) => {
  const [latestAssessment, setLatestAssessment] = useState<RiskAssessment | null>(initialAssessment);
  const [loadingLatest, setLoadingLatest] = useState(initialLoading);
  const [runningAssessment, setRunningAssessment] = useState(initialRunning);
  const [latestError, setLatestError] = useState<string | null>(initialError);
  const [actionError, setActionError] = useState<string | null>(initialActionError);

  // Helper to translate backend errors into user-friendly messages
  const parseErrorMessage = (err: unknown, fallback: string): string => {
    const anyErr = err as any;
    const status = anyErr?.response?.status;
    const msg = anyErr?.response?.data?.message || anyErr?.message;

    if (status === 404 && msg?.toLowerCase().includes('weather records')) {
      return 'Weather records are required to perform a climate risk assessment. Please synchronize weather data first.';
    }
    if (status === 404) {
      return 'No climate risk assessments found for this farm parcel.';
    }
    if (status === 429) {
      return 'Too many requests. Please wait a moment before trying again.';
    }
    if (status === 503) {
      return 'Climate risk service is temporarily unavailable. Please try again.';
    }
    return msg || fallback;
  };

  // Fetch the newest persisted assessment
  const fetchLatestAssessment = useCallback(async () => {
    try {
      setLoadingLatest(true);
      setLatestError(null);
      setActionError(null);
      const res = await riskAssessmentService.getLatestRiskAssessment(farmId);
      setLatestAssessment(res.data);
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.response?.status === 404) {
        // Expected empty state for farms with zero assessments
        setLatestAssessment(null);
      } else {
        setLatestError(parseErrorMessage(err, 'Failed to retrieve latest risk assessment.'));
      }
    } finally {
      setLoadingLatest(false);
    }
  }, [farmId]);

  useEffect(() => {
    if (initialAssessment === null && initialLoading) {
      fetchLatestAssessment();
    }
  }, [fetchLatestAssessment, initialAssessment, initialLoading]);

  // Handle triggering a new assessment
  const handleRunAssessment = async () => {
    if (runningAssessment) return;
    try {
      setRunningAssessment(true);
      setActionError(null);
      const res = await riskAssessmentService.createRiskAssessment(farmId);
      setLatestAssessment(res.data);
    } catch (err: unknown) {
      setActionError(parseErrorMessage(err, 'Failed to execute risk assessment.'));
    } finally {
      setRunningAssessment(false);
    }
  };

  const formatDateTime = (isoString?: string): string => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900">Climate Risk Assessment</h3>
            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 uppercase">
              Module 6
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Objective meteorological threshold evaluation based on IMD scientific guidelines.
          </p>
        </div>

        {/* Header Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAssessment}
            disabled={runningAssessment || loadingLatest}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition"
          >
            {runningAssessment ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Assessing Climate Risk...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{latestAssessment ? 'Re-run Assessment' : 'Run Assessment'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content Area */}
      {loadingLatest ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-slate-400 font-medium">Loading climate risk assessment...</p>
        </div>
      ) : latestError ? (
        /* Unexpected API Error State */
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-rose-900">Failed to Load Risk Assessment</h4>
            <p className="text-xs text-rose-700 max-w-md mx-auto">{latestError}</p>
          </div>
          <button
            onClick={fetchLatestAssessment}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : !latestAssessment ? (
        /* Expected Empty State (404 on /latest) */
        <div className="p-8 text-center space-y-4 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-sm font-bold text-slate-800">No Assessment Found</h4>
            <p className="text-xs text-slate-500">
              No climate risk assessment has been performed for this farm parcel yet.
            </p>
          </div>
          <button
            onClick={handleRunAssessment}
            disabled={runningAssessment}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition"
          >
            {runningAssessment ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Assessing Climate Risk...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Initial Risk Assessment</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* Populated Risk Assessment Foundation */
        <div className="space-y-5">
          {/* Insufficient Data Warning Banner */}
          {latestAssessment.hasInsufficientDataCoverage && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <span>Incomplete Weather Data</span>
                </div>
                <p className="leading-relaxed text-amber-900">
                  Some climate-risk rules could not be evaluated because the required weather observation window is incomplete (fewer than 24 consecutive hourly records).
                </p>
                <p className="font-semibold text-amber-950">
                  The displayed LOW risk must not be interpreted as confirmed low risk.
                </p>
              </div>
            </div>
          )}

          {/* Assessment Summary Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Overall Risk Card */}
            <div
              className={`p-5 rounded-2xl border space-y-1 ${
                latestAssessment.overallRisk === 'HIGH'
                  ? 'bg-rose-50/70 border-rose-200'
                  : latestAssessment.overallRisk === 'MODERATE'
                  ? 'bg-amber-50/70 border-amber-200'
                  : latestAssessment.hasInsufficientDataCoverage
                  ? 'bg-amber-50/70 border-amber-300'
                  : 'bg-emerald-50/70 border-emerald-200'
              }`}
            >
              <div
                className={`text-xs font-semibold uppercase tracking-wider ${
                  latestAssessment.overallRisk === 'HIGH'
                    ? 'text-rose-700'
                    : latestAssessment.overallRisk === 'MODERATE'
                    ? 'text-amber-700'
                    : latestAssessment.hasInsufficientDataCoverage
                    ? 'text-amber-800'
                    : 'text-emerald-700'
                }`}
              >
                Overall Risk
              </div>
              <div
                className={`text-2xl font-black ${
                  latestAssessment.overallRisk === 'HIGH'
                    ? 'text-rose-900'
                    : latestAssessment.overallRisk === 'MODERATE'
                    ? 'text-amber-900'
                    : latestAssessment.hasInsufficientDataCoverage
                    ? 'text-amber-900'
                    : 'text-emerald-900'
                }`}
              >
                {latestAssessment.overallRisk === 'LOW' && latestAssessment.hasInsufficientDataCoverage
                  ? 'LOW (UNCONFIRMED)'
                  : latestAssessment.overallRisk}
              </div>
              <div
                className={`text-xs font-medium ${
                  latestAssessment.overallRisk === 'HIGH'
                    ? 'text-rose-600'
                    : latestAssessment.overallRisk === 'MODERATE'
                    ? 'text-amber-600'
                    : latestAssessment.hasInsufficientDataCoverage
                    ? 'text-amber-700'
                    : 'text-emerald-600'
                }`}
              >
                {latestAssessment.overallRisk === 'HIGH'
                  ? 'Severe climate hazard triggered'
                  : latestAssessment.overallRisk === 'MODERATE'
                  ? 'Moderate climate hazard triggered'
                  : latestAssessment.hasInsufficientDataCoverage
                  ? 'Incomplete window: low risk unconfirmed'
                  : 'No thresholds triggered across complete window'}
              </div>
            </div>

            {/* Assessment Timestamp & Version Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Assessed Date</span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {formatDateTime(latestAssessment.assessedAt)}
              </div>
              <div className="text-xs text-slate-500 font-mono">
                Version: {latestAssessment.assessmentVersion}
              </div>
            </div>

            {/* Rules Triggered Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Activity className="w-3.5 h-3.5 text-slate-500" />
                <span>Rules Triggered</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {latestAssessment.triggeredRuleCount}
                <span className="text-xs font-semibold text-slate-400 ml-1">
                  / {latestAssessment.ruleCount}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Evaluated active IMD rules
              </div>
            </div>

            {/* Weather Records Evaluated Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Weather Records</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {latestAssessment.weatherRecordCount}
              </div>
              <div className="text-xs text-slate-500">
                Hourly observations evaluated
              </div>
            </div>
          </div>

          {/* Assessment Summary Narrative */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">Summary: </span>
              {latestAssessment.summary}
            </div>
          </div>

          {/* Non-Legal Platform Disclaimer */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">Parametric Evaluation Notice: </span>
            Climate risk assessment is an objective physical evaluation against configured scientific thresholds. It is strictly not an insurance claim approval, insurance policy eligibility determination, legal land ownership verification, or payout authorization.
          </div>
        </div>
      )}
    </div>
  );
};
