/**
 * Module 6 Stage 5B-2: Risk Assessment History Component
 * Renders previous parametric climate risk evaluations for a farm.
 * Includes a simple limit selector and modal drilldown on click.
 *
 * NOTE: The frontend NEVER recalculates risk decisions.
 */

import React from 'react';
import { History, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { RiskAssessment } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';

export interface RiskAssessmentHistoryProps {
  farmId: string;
  history: RiskAssessment[];
  loading: boolean;
  error: string | null;
  limit: number;
  onLimitChange: (limit: number) => void;
  onSelectAssessment: (assessmentId: string) => void;
  onRetry: () => void;
}

export const RiskAssessmentHistory: React.FC<RiskAssessmentHistoryProps> = ({
  history,
  loading,
  error,
  limit,
  onLimitChange,
  onSelectAssessment,
  onRetry,
}) => {
  const limitOptions = [5, 10, 20];

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

  const getRiskBadge = (item: RiskAssessment) => {
    const isUnconfirmed = item.overallRisk === 'LOW' && item.hasInsufficientDataCoverage;
    if (item.overallRisk === 'HIGH') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
          HIGH
        </span>
      );
    }
    if (item.overallRisk === 'MODERATE') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          MODERATE
        </span>
      );
    }
    if (isUnconfirmed) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          LOW (UNCONFIRMED)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        LOW
      </span>
    );
  };

  return (
    <div className="space-y-4 pt-4 border-t border-slate-100">
      {/* Header & Limit Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <h4 className="text-base font-bold text-slate-900">Assessment History</h4>
        </div>

        {/* Limit Selector */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="font-medium mr-1">Show:</span>
          {limitOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => onLimitChange(opt)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                limit === opt
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* History Content */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center space-y-2">
          <LoadingSpinner size="md" />
          <p className="text-xs text-slate-400 font-medium">Loading assessment history...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-rose-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600" aria-hidden="true" />
            <span>Unable to load assessment history.</span>
          </div>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-white border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      ) : history.length === 0 ? (
        <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500">
          No previous assessments available.
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectAssessment(item.id)}
              className="p-3.5 sm:p-4 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 flex items-center justify-between gap-4 cursor-pointer transition group"
            >
              {/* Left Column: Date & Version */}
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition">
                  {formatDateTime(item.assessedAt)}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  v{item.assessmentVersion} • {item.weatherRecordCount} weather records
                </div>
              </div>

              {/* Middle/Right: Triggers & Overall Risk */}
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-slate-700">
                    {item.triggeredRuleCount} / {item.ruleCount} triggered
                  </div>
                  <div className="text-[10px] text-slate-400">IMD rules</div>
                </div>

                <div>{getRiskBadge(item)}</div>

                <ChevronRight
                  className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition"
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
