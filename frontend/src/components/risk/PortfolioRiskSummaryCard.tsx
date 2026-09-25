/**
 * Module 6 Stage 6: Portfolio Risk Summary Card
 * Renders executive macro-level KPI metrics across the active farm portfolio.
 *
 * Displays:
 * - Total Active Farms
 * - Assessed Farms
 * - High Risk
 * - Moderate Risk
 * - Low Risk (Confirmed)
 * - Low Risk (Unconfirmed due to incomplete observation window)
 * - Unassessed Farms
 *
 * Supports Loading (skeleton), Success, Error, and Retry states.
 * Failure to load this summary card never blocks farm list table rendering.
 */

import React from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Layers,
  CheckCircle,
} from 'lucide-react';
import { PortfolioRiskSummaryDTO } from '../../types';

export interface PortfolioRiskSummaryCardProps {
  summary: PortfolioRiskSummaryDTO | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onViewRules?: () => void;
}

export const PortfolioRiskSummaryCard: React.FC<PortfolioRiskSummaryCardProps> = ({
  summary,
  loading,
  error,
  onRetry,
  onViewRules,
}) => {
  // 1. Loading State (Skeleton pulse cards)
  if (loading) {
    return (
      <div
        className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4"
        data-testid="portfolio-summary-loading"
      >
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 animate-pulse space-y-2"
            >
              <div className="h-3 w-16 bg-slate-200 rounded" />
              <div className="h-7 w-12 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Error State (Retryable banner, non-blocking)
  if (error) {
    return (
      <div
        className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900"
        data-testid="portfolio-summary-error"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Unable to load portfolio risk summary
            </p>
            <p className="text-xs text-amber-700">{error}</p>
          </div>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition self-start sm:self-auto"
          data-testid="portfolio-summary-retry-btn"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Summary
        </button>
      </div>
    );
  }

  // If no summary available yet
  if (!summary) {
    return null;
  }

  const metricItems = [
    {
      label: 'Active Farms',
      value: summary.totalFarms,
      icon: Layers,
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-800',
      badgeBg: 'bg-slate-100 text-slate-700',
      subtext: 'Monitoring scope',
      testId: 'metric-total-farms',
    },
    {
      label: 'Assessed',
      value: summary.assessedFarms,
      icon: CheckCircle,
      bg: 'bg-sky-50/50',
      border: 'border-sky-200/80',
      text: 'text-sky-900',
      badgeBg: 'bg-sky-100 text-sky-800',
      subtext: 'With latest run',
      testId: 'metric-assessed-farms',
    },
    {
      label: 'High Risk',
      value: summary.highRiskCount,
      icon: ShieldAlert,
      bg: 'bg-rose-50/70',
      border: 'border-rose-200',
      text: 'text-rose-900',
      badgeBg: 'bg-rose-100 text-rose-800 font-bold',
      subtext: 'Immediate attention',
      testId: 'metric-high-risk',
    },
    {
      label: 'Moderate Risk',
      value: summary.moderateRiskCount,
      icon: AlertTriangle,
      bg: 'bg-amber-50/70',
      border: 'border-amber-200',
      text: 'text-amber-900',
      badgeBg: 'bg-amber-100 text-amber-800 font-bold',
      subtext: 'Heightened monitoring',
      testId: 'metric-moderate-risk',
    },
    {
      label: 'Low Risk',
      value: summary.lowRiskCount,
      icon: CheckCircle2,
      bg: 'bg-emerald-50/70',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      badgeBg: 'bg-emerald-100 text-emerald-800 font-bold',
      subtext: 'Confirmed full coverage',
      testId: 'metric-low-risk',
    },
    {
      label: 'Unconfirmed',
      value: summary.lowRiskUnconfirmedCount,
      icon: AlertTriangle,
      bg: 'bg-amber-50/40',
      border: 'border-amber-200/60',
      text: 'text-amber-900',
      badgeBg: 'bg-amber-100/80 text-amber-800',
      subtext: 'Incomplete window',
      testId: 'metric-low-risk-unconfirmed',
    },
    {
      label: 'Unassessed',
      value: summary.unassessedFarms,
      icon: HelpCircle,
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-600',
      badgeBg: 'bg-slate-200/80 text-slate-700',
      subtext: 'No run recorded',
      testId: 'metric-unassessed-farms',
    },
  ];

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4"
      data-testid="portfolio-risk-summary-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Active Portfolio Climate Risk Overview
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              FarmStatus.ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Aggregated latest assessment statuses across active farm parcels.
            {summary.generatedAt && (
              <span className="ml-1 text-slate-400 font-mono text-[11px]" data-testid="portfolio-summary-generated-at">
                • Updated: {new Date(summary.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onViewRules && (
            <button
              onClick={onViewRules}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 px-3 py-1.5 rounded-lg transition"
              data-testid="summary-card-view-rules-btn"
            >
              View Parametric Rules
            </button>
          )}
          <button
            onClick={onRetry}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            title="Refresh summary"
            data-testid="summary-refresh-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid of Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {metricItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`p-3.5 rounded-xl border ${item.border} ${item.bg} flex flex-col justify-between transition hover:shadow-xs`}
              data-testid={item.testId}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-xs font-semibold text-slate-600 truncate">
                  {item.label}
                </span>
                <Icon className={`w-3.5 h-3.5 ${item.text} opacity-80 flex-shrink-0`} />
              </div>
              <div>
                <div className={`text-2xl font-black ${item.text} tracking-tight`}>
                  {item.value}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">
                  {item.subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
