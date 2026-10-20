/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Claim Status Badge Component
 *
 * Purely presentational component rendering styled visual badges for ClaimStatus:
 * - PAID: Emerald (CheckCircle2)
 * - APPROVED: Blue (Check)
 * - PENDING: Amber (Clock)
 * - REJECTED: Rose (XCircle)
 */

import React from 'react';
import { CheckCircle2, Check, Clock, XCircle } from 'lucide-react';
import { ClaimStatus } from '../../types';

export interface ClaimStatusBadgeProps {
  status: ClaimStatus;
  size?: 'sm' | 'md';
}

export const ClaimStatusBadge: React.FC<ClaimStatusBadgeProps> = ({
  status,
  size = 'md',
}) => {
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  switch (status) {
    case 'PAID':
      return (
        <span
          data-testid="claim-status-paid"
          className={`inline-flex items-center font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses}`}
        >
          <CheckCircle2 className={`${iconSizes} text-emerald-600 flex-shrink-0`} aria-hidden="true" />
          <span>Settled & Paid</span>
        </span>
      );

    case 'APPROVED':
      return (
        <span
          data-testid="claim-status-approved"
          className={`inline-flex items-center font-semibold rounded-full border bg-blue-50 text-blue-700 border-blue-200 ${sizeClasses}`}
        >
          <Check className={`${iconSizes} text-blue-600 flex-shrink-0`} aria-hidden="true" />
          <span>Approved</span>
        </span>
      );

    case 'PENDING':
      return (
        <span
          data-testid="claim-status-pending"
          className={`inline-flex items-center font-semibold rounded-full border bg-amber-50 text-amber-700 border-amber-200 ${sizeClasses}`}
        >
          <Clock className={`${iconSizes} text-amber-600 flex-shrink-0`} aria-hidden="true" />
          <span>Evaluation Pending</span>
        </span>
      );

    case 'REJECTED':
      return (
        <span
          data-testid="claim-status-rejected"
          className={`inline-flex items-center font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200 ${sizeClasses}`}
        >
          <XCircle className={`${iconSizes} text-rose-600 flex-shrink-0`} aria-hidden="true" />
          <span>Claim Rejected</span>
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
