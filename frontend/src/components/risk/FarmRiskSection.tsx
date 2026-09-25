/**
 * Module 6 Stage 5B-2: Farm Climate Risk Dashboard
 * Orchestrating container component for farm-level climate risk monitoring:
 * - RiskAssessmentSummaryCard
 * - InsufficientDataWarning
 * - RiskEventList (RiskEventCard)
 * - RiskAssessmentHistory
 * - HistoricalAssessmentModal
 *
 * NOTE: The frontend NEVER calculates thresholds, severity, or overall risk.
 * The backend is the single source of truth for all risk determinations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Play,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { RiskAssessment } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { RiskAssessmentSummaryCard } from './RiskAssessmentSummaryCard';
import { InsufficientDataWarning } from './InsufficientDataWarning';
import { RiskEventList } from './RiskEventList';
import { RiskAssessmentHistory } from './RiskAssessmentHistory';
import { HistoricalAssessmentModal } from './HistoricalAssessmentModal';
import { RiskAssessmentAuditModal } from './RiskAssessmentAuditModal';

export interface FarmRiskSectionProps {
  farmId: string;
  initialAssessment?: RiskAssessment | null;
  initialLoading?: boolean;
  initialError?: string | null;
  initialActionError?: string | null;
  initialRunning?: boolean;
  initialHistory?: RiskAssessment[];
  initialHistoryLoading?: boolean;
  initialHistoryError?: string | null;
}

export const FarmRiskSection: React.FC<FarmRiskSectionProps> = ({
  farmId,
  initialAssessment = null,
  initialLoading = true,
  initialError = null,
  initialActionError = null,
  initialRunning = false,
  initialHistory = [],
  initialHistoryLoading = false,
  initialHistoryError = null,
}) => {
  // Latest assessment state
  const [latestAssessment, setLatestAssessment] = useState<RiskAssessment | null>(initialAssessment);
  const [loadingLatest, setLoadingLatest] = useState(initialLoading);
  const [runningAssessment, setRunningAssessment] = useState(initialRunning);
  const [latestError, setLatestError] = useState<string | null>(initialError);
  const [actionError, setActionError] = useState<string | null>(initialActionError);

  // History state
  const [history, setHistory] = useState<RiskAssessment[]>(initialHistory);
  const [loadingHistory, setLoadingHistory] = useState(initialHistoryLoading);
  const [historyError, setHistoryError] = useState<string | null>(initialHistoryError);
  const [historyLimit, setHistoryLimit] = useState<number>(10);

  // Modal drilldown state
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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
        setLatestError(parseErrorMessage(err, 'Unable to load climate risk assessment.'));
      }
    } finally {
      setLoadingLatest(false);
    }
  }, [farmId]);

  // Fetch assessment history list
  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const res = await riskAssessmentService.getRiskAssessmentHistory(farmId, historyLimit);
      setHistory(res.data);
    } catch {
      setHistoryError('Unable to load assessment history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [farmId, historyLimit]);

  // Mount effects
  useEffect(() => {
    if (initialAssessment === null && initialLoading) {
      fetchLatestAssessment();
    }
  }, [fetchLatestAssessment, initialAssessment, initialLoading]);

  useEffect(() => {
    if (initialHistory.length === 0 && !initialHistoryLoading && !initialHistoryError) {
      // Auto-fetch history on farm mount or limit change if not overridden
      fetchHistory();
    }
  }, [fetchHistory, initialHistory.length, initialHistoryLoading, initialHistoryError]);

  // Handle triggering a new assessment
  const handleRunAssessment = async () => {
    if (runningAssessment) return;
    try {
      setRunningAssessment(true);
      setActionError(null);
      const res = await riskAssessmentService.createRiskAssessment(farmId);
      setLatestAssessment(res.data);
      // Refresh history list immediately upon successful assessment execution
      fetchHistory();
    } catch (err: unknown) {
      setActionError(parseErrorMessage(err, 'Unable to run risk assessment. Please try again.'));
    } finally {
      setRunningAssessment(false);
    }
  };

  const handleLimitChange = (newLimit: number) => {
    setHistoryLimit(newLimit);
  };

  const handleSelectHistoricalAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedAssessmentId(null);
  };

  // Provenance modal state
  const [provenanceAssessment, setProvenanceAssessment] = useState<RiskAssessment | null>(null);
  const [provenanceModalOpen, setProvenanceModalOpen] = useState(false);

  const handleOpenProvenance = (assessment: RiskAssessment) => {
    setProvenanceAssessment(assessment);
    setProvenanceModalOpen(true);
  };

  const handleCloseProvenance = () => {
    setProvenanceModalOpen(false);
    setProvenanceAssessment(null);
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
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Assessing Climate Risk...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
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
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
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
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-rose-900">Failed to Load Risk Assessment</h4>
            <p className="text-xs text-rose-700 max-w-md mx-auto">{latestError}</p>
          </div>
          <button
            onClick={fetchLatestAssessment}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      ) : !latestAssessment ? (
        /* Expected Empty State (404 on /latest) */
        <div className="p-8 text-center space-y-4 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <ShieldAlert className="w-6 h-6" aria-hidden="true" />
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
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Assessing Climate Risk...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>Run Initial Risk Assessment</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* Populated Risk Assessment Dashboard */
        <div className="space-y-6">
          <InsufficientDataWarning
            hasInsufficientDataCoverage={latestAssessment.hasInsufficientDataCoverage}
          />
          <RiskAssessmentSummaryCard
            assessment={latestAssessment}
            onViewProvenance={handleOpenProvenance}
          />
          <RiskEventList events={latestAssessment.events || []} />
          <RiskAssessmentHistory
            farmId={farmId}
            history={history}
            loading={loadingHistory}
            error={historyError}
            limit={historyLimit}
            onLimitChange={handleLimitChange}
            onSelectAssessment={handleSelectHistoricalAssessment}
            onRetry={fetchHistory}
          />
        </div>
      )}

      {/* Historical Assessment Modal */}
      <HistoricalAssessmentModal
        assessmentId={selectedAssessmentId}
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onViewProvenance={handleOpenProvenance}
      />

      {/* Assessment Provenance View Modal */}
      <RiskAssessmentAuditModal
        assessment={provenanceAssessment}
        isOpen={provenanceModalOpen}
        onClose={handleCloseProvenance}
      />
    </div>
  );
};
