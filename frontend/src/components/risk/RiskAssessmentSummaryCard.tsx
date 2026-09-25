/**
 * Module 6 Stage 5B-2: Risk Assessment Summary Card
 * Presents overall climate risk, evaluation timestamp, rules triggered,
 * evaluated record counts, and meteorological narrative.
 *
 * NOTE: The frontend NEVER calculates or recalculates risk, severity, or coverage.
 * It strictly renders backend-provided fields.
 */

import React from 'react';
import {
  Clock,
  Layers,
  Activity,
  FileText,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { RiskAssessment } from '../../types';

export interface RiskAssessmentSummaryCardProps {
  assessment: RiskAssessment;
  onViewProvenance?: (assessment: RiskAssessment) => void;
}

export const RiskAssessmentSummaryCard: React.FC<RiskAssessmentSummaryCardProps> = ({
  assessment,
  onViewProvenance,
}) => {
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

  const isLowUnconfirmed =
    assessment.overallRisk === 'LOW' && assessment.hasInsufficientDataCoverage;

  const getRiskTitle = (): string => {
    if (isLowUnconfirmed) {
      return 'LOW (UNCONFIRMED)';
    }
    return assessment.overallRisk;
  };

  const getRiskSubtitle = (): string => {
    if (assessment.overallRisk === 'HIGH') {
      return 'Severe climate hazard triggered';
    }
    if (assessment.overallRisk === 'MODERATE') {
      return 'Moderate climate hazard triggered';
    }
    if (isLowUnconfirmed) {
      return 'Incomplete window: low risk unconfirmed';
    }
    return 'No thresholds triggered across complete window';
  };

  const getRiskCardBg = (): string => {
    if (assessment.overallRisk === 'HIGH') {
      return 'bg-rose-50/70 border-rose-200 text-rose-900';
    }
    if (assessment.overallRisk === 'MODERATE') {
      return 'bg-amber-50/70 border-amber-200 text-amber-900';
    }
    if (isLowUnconfirmed) {
      return 'bg-amber-50/70 border-amber-300 text-amber-900';
    }
    return 'bg-emerald-50/70 border-emerald-200 text-emerald-900';
  };

  const getRiskBadgeColor = (): string => {
    if (assessment.overallRisk === 'HIGH') {
      return 'text-rose-700';
    }
    if (assessment.overallRisk === 'MODERATE') {
      return 'text-amber-700';
    }
    if (isLowUnconfirmed) {
      return 'text-amber-800';
    }
    return 'text-emerald-700';
  };

  const getRiskCaptionColor = (): string => {
    if (assessment.overallRisk === 'HIGH') {
      return 'text-rose-600';
    }
    if (assessment.overallRisk === 'MODERATE') {
      return 'text-amber-600';
    }
    if (isLowUnconfirmed) {
      return 'text-amber-700';
    }
    return 'text-emerald-600';
  };

  return (
    <div className="space-y-4">
      {/* 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Risk Card */}
        <div className={`p-5 rounded-2xl border space-y-1 ${getRiskCardBg()}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${getRiskBadgeColor()}`}>
              Overall Risk
            </span>
            {assessment.overallRisk === 'HIGH' ? (
              <ShieldAlert className="w-4 h-4 text-rose-600" aria-hidden="true" />
            ) : isLowUnconfirmed ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
            ) : assessment.overallRisk === 'MODERATE' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            )}
          </div>
          <div className="text-2xl font-black">{getRiskTitle()}</div>
          <div className={`text-xs font-medium ${getRiskCaptionColor()}`}>
            {getRiskSubtitle()}
          </div>
        </div>

        {/* Assessed Timestamp & Version */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Assessed At</span>
          </div>
          <div className="text-sm font-bold text-slate-900">
            {formatDateTime(assessment.assessedAt)}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Version: {assessment.assessmentVersion}
          </div>
        </div>

        {/* Rules Triggered */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Activity className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Rules Evaluated</span>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {assessment.triggeredRuleCount}
            <span className="text-xs font-semibold text-slate-400 ml-1">
              / {assessment.ruleCount} triggered
            </span>
          </div>
          <div className="text-xs text-slate-500">Evaluated active IMD rules</div>
        </div>

        {/* Weather Records */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Layers className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Weather Records</span>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {assessment.weatherRecordCount}
          </div>
          <div className="text-xs text-slate-500">Hourly observations evaluated</div>
        </div>
      </div>

      {/* Assessment Summary Narrative & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
        <div className="flex items-start gap-2.5">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold text-slate-900">Summary: </span>
            {assessment.summary}
          </div>
        </div>

        {onViewProvenance && (
          <button
            onClick={() => onViewProvenance(assessment)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition text-xs font-semibold shadow-sm self-start sm:self-center"
            title="View assessment provenance and technical audit details"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>View Provenance</span>
          </button>
        )}
      </div>

      {/* Non-Legal Parametric Platform Disclaimer */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-700">Parametric Evaluation Notice: </span>
        Climate risk assessment is an objective physical evaluation against configured scientific thresholds. It is strictly not an insurance claim approval, insurance policy eligibility determination, legal land ownership verification, or payout authorization.
      </div>
    </div>
  );
};
