/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Policy Status Badge Component
 *
 * Purely presentational component rendering styled visual badges for PolicyStatus:
 * - ACTIVE: Emerald (ShieldCheck)
 * - PENDING: Amber (Clock)
 * - EXHAUSTED: Slate (AlertCircle)
 * - CANCELLED: Rose (XCircle)
 */

import React from 'react';
import { ShieldCheck, Clock, AlertCircle, XCircle } from 'lucide-react';
import { PolicyStatus } from '../../types';

export interface PolicyStatusBadgeProps {
  status: PolicyStatus;
  size?: 'sm' | 'md';
}

export const PolicyStatusBadge: React.FC<PolicyStatusBadgeProps> = ({
  status,
  size = 'md',
}) => {
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  switch (status) {
    case 'ACTIVE':
      return (
        <span
          data-testid="policy-status-active"
          className={`inline-flex items-center font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses}`}
        >
          <ShieldCheck className={`${iconSizes} text-emerald-600 flex-shrink-0`} aria-hidden="true" />
          <span>Active Policy</span>
        </span>
      );

    case 'PENDING':
      return (
        <span
          data-testid="policy-status-pending"
          className={`inline-flex items-center font-semibold rounded-full border bg-amber-50 text-amber-700 border-amber-200 ${sizeClasses}`}
        >
          <Clock className={`${iconSizes} text-amber-600 flex-shrink-0`} aria-hidden="true" />
          <span>Underwriting Pending</span>
        </span>
      );

    case 'EXHAUSTED':
      return (
        <span
          data-testid="policy-status-exhausted"
          className={`inline-flex items-center font-semibold rounded-full border bg-slate-100 text-slate-700 border-slate-300 ${sizeClasses}`}
        >
          <AlertCircle className={`${iconSizes} text-slate-500 flex-shrink-0`} aria-hidden="true" />
          <span>Coverage Exhausted</span>
        </span>
      );

    case 'CANCELLED':
      return (
        <span
          data-testid="policy-status-cancelled"
          className={`inline-flex items-center font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200 ${sizeClasses}`}
        >
          <XCircle className={`${iconSizes} text-rose-600 flex-shrink-0`} aria-hidden="true" />
          <span>Policy Cancelled</span>
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full border bg-slate-100 text-slate-600 border-slate-200 ${sizeClasses}`}
        >
          <span>{status}</span>
        </span>
      );
  }
};
