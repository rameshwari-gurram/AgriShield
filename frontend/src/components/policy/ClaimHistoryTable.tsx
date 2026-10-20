/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Claim History Table Component
 *
 * Tabular display of historical parametric claims for a farm parcel.
 * - Shows claim dates, claim numbers, trigger rule codes, severity, observed vs threshold values, payout amounts, and status.
 * - Displays simulated payout references only when present (strictly maintaining simulated status).
 * - Surfaces rejection reasons when present.
 * - Emits onViewAudit handler for technical provenance inspection.
 * - Gracefully handles empty claims lists without fabricating records.
 */

import React from 'react';
import {
  FileText,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { Claim, RiskSeverity } from '../../types';
import { ClaimStatusBadge } from './ClaimStatusBadge';

export interface ClaimHistoryTableProps {
  claims: Claim[];
  onViewAudit?: (claim: Claim) => void;
}

function formatCurrency(amountStr: string | number): string {
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return `₹${amountStr}`;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

function getSeverityBadgeClass(severity: RiskSeverity): string {
  switch (severity) {
    case 'VERY_HIGH':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'HIGH':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'MODERATE':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'LOW':
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export const ClaimHistoryTable: React.FC<ClaimHistoryTableProps> = ({
  claims,
  onViewAudit,
}) => {
  if (!claims || claims.length === 0) {
    return (
      <div
        data-testid="claim-history-empty"
        className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-3"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <Receipt className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-800">No Parametric Claims Recorded</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            No meteorological trigger thresholds have been breached for this farm parcel.
            Parametric claims are generated automatically when authoritative Module 6 weather rule conditions are met.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="claim-history-table"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden space-y-0"
    >
      <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            <span>Parametric Claims History</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated index-triggered claim evaluations and simulated settlements.
          </p>
        </div>
        <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          {claims.length} {claims.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/75 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider">
              <th className="py-3 px-4">Claim ID & Date</th>
              <th className="py-3 px-4">Trigger Rule & Hazard</th>
              <th className="py-3 px-4">Metric vs Threshold</th>
              <th className="py-3 px-4">Payout Amount</th>
              <th className="py-3 px-4">Status & Reference</th>
              <th className="py-3 px-4 text-right">Provenance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {claims.map((claim) => (
              <tr
                key={claim.id}
                data-testid={`claim-row-${claim.id}`}
                className="hover:bg-slate-50/60 transition-colors"
              >
                {/* Claim Number & Date */}
                <td className="py-3.5 px-4 space-y-0.5">
                  <div className="font-mono font-bold text-slate-900">
                    {claim.claimNumber}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Evaluated: {formatDate(claim.createdAt)}
                  </div>
                </td>

                {/* Trigger Rule & Severity */}
                <td className="py-3.5 px-4 space-y-1">
                  <div className="font-mono font-semibold text-slate-800">
                    {claim.triggerRuleCode}
                  </div>
                  <span
                    className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded border ${getSeverityBadgeClass(
                      claim.severity
                    )}`}
                  >
                    {claim.severity} SEVERITY
                  </span>
                </td>

                {/* Observed vs Threshold */}
                <td className="py-3.5 px-4 space-y-0.5 font-mono text-slate-600">
                  <div>
                    Observed:{' '}
                    <strong className="text-slate-900">
                      {claim.observedValue !== null ? claim.observedValue : 'N/A'}
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Threshold: {claim.thresholdValue}
                  </div>
                </td>

                {/* Payout Amount */}
                <td className="py-3.5 px-4">
                  <div className="font-mono font-bold text-base text-slate-900">
                    {formatCurrency(claim.payoutAmount)}
                  </div>
                  <div className="text-[10px] text-slate-400">Calculated Entitlement</div>
                </td>

                {/* Status & Reference */}
                <td className="py-3.5 px-4 space-y-1">
                  <ClaimStatusBadge status={claim.status} size="sm" />

                  {/* Payout Reference (Simulated) */}
                  {claim.payoutReference && (
                    <div
                      data-testid={`claim-reference-${claim.id}`}
                      className="font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block"
                      title="Simulated Parametric Settlement Transaction ID"
                    >
                      {claim.payoutReference}
                    </div>
                  )}

                  {/* Rejection Note */}
                  {claim.status === 'REJECTED' && claim.rejectionReason && (
                    <div
                      data-testid={`claim-rejection-${claim.id}`}
                      className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200 max-w-xs space-y-0.5"
                    >
                      <div className="font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-rose-600" aria-hidden="true" />
                        <span>Rejection Reason:</span>
                      </div>
                      <p className="line-clamp-2">{claim.rejectionReason}</p>
                    </div>
                  )}
                </td>

                {/* Provenance Audit Action */}
                <td className="py-3.5 px-4 text-right">
                  {onViewAudit && (
                    <button
                      onClick={() => onViewAudit(claim)}
                      data-testid={`view-audit-btn-${claim.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
                      title="Inspect full technical audit provenance"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      <span>Audit</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
