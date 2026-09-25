/**
 * Module 6 Stage 5B-3: Farm Risk Badge Component
 * Purely presentational badge displaying a farm parcel's resolved climate risk status.
 *
 * NOTE: This component does NOT make API calls, does NOT fetch data, and does NOT
 * calculate risk thresholds, bands, or severity. It strictly presents the status
 * passed down by its parent data-fetching owner.
 */

import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  MinusCircle,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';

export type FarmRiskStatus =
  | 'LOADING'
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'LOW_UNCONFIRMED'
  | 'NO_ASSESSMENT'
  | 'RISK_UNAVAILABLE';

export interface FarmRiskBadgeProps {
  status: FarmRiskStatus;
  size?: 'sm' | 'md';
}

export const FarmRiskBadge: React.FC<FarmRiskBadgeProps> = ({ status, size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  switch (status) {
    case 'HIGH':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-bold border bg-rose-50 text-rose-700 border-rose-200 ${sizeClasses}`}
          data-testid="farm-risk-badge-high"
        >
          <AlertTriangle className={`${iconSize} text-rose-600 flex-shrink-0`} aria-hidden="true" />
          <span>HIGH</span>
        </span>
      );

    case 'MODERATE':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-bold border bg-amber-50 text-amber-700 border-amber-200 ${sizeClasses}`}
          data-testid="farm-risk-badge-moderate"
        >
          <AlertCircle className={`${iconSize} text-amber-600 flex-shrink-0`} aria-hidden="true" />
          <span>MODERATE</span>
        </span>
      );

    case 'LOW':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-bold border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses}`}
          data-testid="farm-risk-badge-low"
        >
          <CheckCircle className={`${iconSize} text-emerald-600 flex-shrink-0`} aria-hidden="true" />
          <span>LOW</span>
        </span>
      );

    case 'LOW_UNCONFIRMED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-bold border bg-amber-50 text-amber-800 border-amber-300 ${sizeClasses}`}
          data-testid="farm-risk-badge-low-unconfirmed"
          title="Incomplete weather observation window prevents conclusive low-risk confirmation"
        >
          <AlertTriangle className={`${iconSize} text-amber-600 flex-shrink-0`} aria-hidden="true" />
          <span>LOW (UNCONFIRMED)</span>
        </span>
      );

    case 'NO_ASSESSMENT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-medium border bg-slate-100 text-slate-600 border-slate-200 ${sizeClasses}`}
          data-testid="farm-risk-badge-no-assessment"
        >
          <MinusCircle className={`${iconSize} text-slate-400 flex-shrink-0`} aria-hidden="true" />
          <span>NO ASSESSMENT</span>
        </span>
      );

    case 'RISK_UNAVAILABLE':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-medium border border-dashed bg-slate-50 text-slate-500 border-slate-300 ${sizeClasses}`}
          data-testid="farm-risk-badge-risk-unavailable"
          title="Could not retrieve climate risk status"
        >
          <HelpCircle className={`${iconSize} text-slate-400 flex-shrink-0`} aria-hidden="true" />
          <span>RISK UNAVAILABLE</span>
        </span>
      );

    case 'LOADING':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-medium border bg-slate-50 text-slate-400 border-slate-200 ${sizeClasses}`}
          data-testid="farm-risk-badge-loading"
        >
          <RefreshCw className={`${iconSize} animate-spin text-slate-400 flex-shrink-0`} aria-hidden="true" />
          <span>LOADING...</span>
        </span>
      );
  }
};
