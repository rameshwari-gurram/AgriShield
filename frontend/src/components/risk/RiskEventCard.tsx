/**
 * Module 6 Stage 5B-2: Risk Event Card Component
 * Presents detailed metrics and metadata for a single climate-risk rule evaluation.
 *
 * NOTE: The frontend NEVER compares observedValue against thresholdValue,
 * and NEVER calculates whether an event is triggered or its status.
 * All decisions and values are rendered directly from backend records.
 */

import React from 'react';
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Info,
  Calendar,
  Layers,
} from 'lucide-react';
import { RiskEvent } from '../../types';

export interface RiskEventCardProps {
  event: RiskEvent;
}

export const RiskEventCard: React.FC<RiskEventCardProps> = ({ event }) => {
  // Format observed value - strictly display 'N/A' when null without converting to 0
  const formattedObservedValue =
    event.observedValue !== null && event.observedValue !== undefined
      ? `${event.observedValue.toFixed(2)} ${event.unit}`
      : 'N/A';

  const formattedThresholdValue = `${event.thresholdValue.toFixed(2)} ${event.unit}`;

  const formatSourceType = (sourceType: string): string => {
    if (sourceType === 'OFFICIAL_REFERENCE') {
      return 'Official Reference';
    }
    if (sourceType === 'PROJECT_INDICATOR') {
      return 'Project Indicator';
    }
    return sourceType;
  };

  const getStatusBadge = () => {
    switch (event.status) {
      case 'TRIGGERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
            <span>TRIGGERED</span>
          </span>
        );
      case 'INSUFFICIENT_DATA':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>INSUFFICIENT_DATA</span>
          </span>
        );
      case 'NOT_TRIGGERED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <CheckCircle className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>NOT_TRIGGERED</span>
          </span>
        );
    }
  };

  const getSeverityBadge = () => {
    switch (event.severity) {
      case 'VERY_HIGH':
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
            {event.severity}
          </span>
        );
      case 'MODERATE':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {event.severity}
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            {event.severity}
          </span>
        );
    }
  };

  return (
    <div
      className={`p-5 rounded-2xl border transition-all ${
        event.status === 'TRIGGERED'
          ? 'bg-rose-50/40 border-rose-200 shadow-sm'
          : event.status === 'INSUFFICIENT_DATA'
          ? 'bg-amber-50/30 border-amber-200'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Header: Rule Name & Status Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-slate-900">{event.ruleName}</h4>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {event.ruleCode}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
            <span>{event.hazardType.replace(/_/g, ' ')}</span>
            <span>•</span>
            <span>{event.measurement.replace(/_/g, ' ')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getSeverityBadge()}
          {getStatusBadge()}
        </div>
      </div>

      {/* Grid of Key Numerical & Observation Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs">
        {/* Observed Value */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] text-slate-400 font-medium">Observed</span>
          <div className="text-sm font-bold text-slate-900 font-mono">
            {formattedObservedValue}
          </div>
        </div>

        {/* Threshold Value */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] text-slate-400 font-medium">Threshold</span>
          <div className="text-sm font-bold text-slate-900 font-mono">
            {formattedThresholdValue}
          </div>
        </div>

        {/* Observation Window */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] text-slate-400 font-medium">Window</span>
          <div className="text-sm font-semibold text-slate-800">
            {event.observationWindow.replace(/_/g, ' ')}
          </div>
        </div>

        {/* Source Attribution */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] text-slate-400 font-medium">Source</span>
          <div className="text-xs font-semibold text-slate-800 truncate" title={formatSourceType(event.sourceType)}>
            {formatSourceType(event.sourceType)}
          </div>
        </div>
      </div>

      {/* Source Reference & Explanation */}
      <div className="space-y-2 pt-1 text-xs">
        {event.sourceReference && (
          <div className="text-slate-500 flex items-start gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong className="text-slate-700">Reference: </strong>
              {event.sourceReference}
            </span>
          </div>
        )}

        {event.explanation && (
          <div className="text-slate-600 flex items-start gap-1.5 bg-slate-50/60 p-2.5 rounded-lg border border-slate-100">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong className="text-slate-700">Explanation: </strong>
              {event.explanation}
            </span>
          </div>
        )}

        {event.observedAt && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-slate-400" aria-hidden="true" />
            <span>Observed Date: {new Date(event.observedAt).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};
