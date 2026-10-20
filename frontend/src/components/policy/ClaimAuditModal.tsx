/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Claim Audit & Provenance Modal Component
 *
 * Read-only modal displaying technical provenance for a parametric claim:
 * - Claim identity, dates, status, and associated policy ID.
 * - Authoritative Module 6 assessment ID and risk-event ID.
 * - Trigger rule code, severity, observed value, and threshold.
 * - Actual payout amount and simulated settlement reference (when present).
 * - Paid timestamp and rejection reason (when present).
 * - Full raw JSON inspection tab with clipboard copy and .json download.
 * - Approved parametric simulation disclaimer.
 *
 * NOTE (Provenance Invariant):
 * The Claim DTO does not expose the raw severity multiplier fraction.
 * The modal strictly displays the persisted payoutAmount without fabricating
 * unsupported mathematical formulas.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Copy,
  Download,
  Check,
  Shield,
  Layers,
  Code,
  AlertTriangle,
  Receipt,
  Info,
} from 'lucide-react';
import { Claim, Policy } from '../../types';
import { ClaimStatusBadge } from './ClaimStatusBadge';

export interface ClaimAuditModalProps {
  claim: Claim | null;
  policy?: Policy | null;
  isOpen: boolean;
  onClose: () => void;
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
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

export const ClaimAuditModal: React.FC<ClaimAuditModalProps> = ({
  claim,
  policy,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'provenance' | 'json'>('provenance');

  // Close on Escape key with cleanup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !claim) {
    return null;
  }

  // Serializes strictly the displayed claim DTO
  const serializedJson = JSON.stringify(claim, null, 2);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(serializedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([serializedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `claim-audit-${claim.claimNumber}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-audit-modal-title"
      data-testid="claim-audit-modal"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <Receipt className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="claim-audit-modal-title" className="text-base font-bold text-slate-900">
                  Claim Technical Provenance & Audit
                </h3>
                <ClaimStatusBadge status={claim.status} size="sm" />
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Claim Ref: {claim.claimNumber}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close audit modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-100 bg-slate-50/40">
          <button
            onClick={() => setActiveTab('provenance')}
            data-testid="tab-provenance"
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'provenance'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="w-4 h-4" aria-hidden="true" />
            <span>Audit Trail & Provenance</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            data-testid="tab-json"
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'json'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Code className="w-4 h-4" aria-hidden="true" />
            <span>Raw Claim JSON</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {activeTab === 'provenance' ? (
            <div className="space-y-5">
              {/* Entitlement & Settlement Summary */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <span className="font-semibold text-slate-700">Calculated Payout Entitlement</span>
                  <span
                    data-testid="audit-payout-amount"
                    className="text-base font-bold font-mono text-slate-900"
                  >
                    {formatCurrency(claim.payoutAmount)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Settlement Status</span>
                    <span className="font-semibold text-slate-800">{claim.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Evaluation Timestamp</span>
                    <span className="font-mono text-slate-800">{formatDate(claim.createdAt)}</span>
                  </div>
                </div>

                {claim.payoutReference && (
                  <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-slate-500 font-medium">Simulated Transaction Reference:</span>
                    <span
                      data-testid="audit-payout-reference"
                      className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                    >
                      {claim.payoutReference}
                    </span>
                  </div>
                )}

                {claim.paidAt && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Simulated Settlement Date:</span>
                    <span data-testid="audit-paid-at" className="font-mono">
                      {formatDate(claim.paidAt)}
                    </span>
                  </div>
                )}

                {claim.rejectionReason && (
                  <div
                    data-testid="audit-rejection-reason"
                    className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 space-y-1"
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                      <span>Rejection Rationale:</span>
                    </div>
                    <p className="text-xs leading-relaxed">{claim.rejectionReason}</p>
                  </div>
                )}
              </div>

              {/* Authoritative Meteorological Trigger Provenance */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Module 6 Parametric Trigger Provenance</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200/80 bg-white">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Trigger Rule Code</span>
                    <span
                      data-testid="audit-rule-code"
                      className="font-mono font-bold text-slate-900"
                    >
                      {claim.triggerRuleCode}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 block">Event Severity</span>
                    <span
                      data-testid="audit-severity"
                      className="font-semibold text-slate-800"
                    >
                      {claim.severity}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 block">Observed Metric Value</span>
                    <span
                      data-testid="audit-observed-value"
                      className="font-mono font-bold text-slate-900"
                    >
                      {claim.observedValue !== null ? claim.observedValue : 'N/A'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 block">Parametric Trigger Threshold</span>
                    <span
                      data-testid="audit-threshold-value"
                      className="font-mono font-bold text-slate-900"
                    >
                      {claim.thresholdValue}
                    </span>
                  </div>
                </div>
              </div>

              {/* Persisted Audit Provenance UUIDs */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Database Provenance Identifiers</span>
                </h4>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 font-mono text-[11px] space-y-1.5 text-slate-600">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-slate-400">Claim UUID:</span>
                    <span data-testid="audit-claim-id" className="text-slate-800 select-all">
                      {claim.id}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-slate-400">Policy UUID:</span>
                    <span data-testid="audit-policy-id" className="text-slate-800 select-all">
                      {claim.policyId}
                      {policy?.policyNumber ? ` (${policy.policyNumber})` : ''}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-slate-400">Assessment UUID (Module 6):</span>
                    <span data-testid="audit-assessment-id" className="text-slate-800 select-all">
                      {claim.assessmentId}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-slate-400">Risk Event UUID:</span>
                    <span data-testid="audit-risk-event-id" className="text-slate-800 select-all">
                      {claim.riskEventId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mandatory Parametric Legal Disclaimer */}
              <div
                data-testid="audit-disclaimer"
                className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed flex items-start gap-2.5"
              >
                <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  <strong>Parametric Automation Notice: </strong>
                  This record reflects an automated parametric index evaluation. Claim generation and payouts are derived strictly from authoritative meteorological observations against approved trigger thresholds. Payout transactions are simulated within the prototype platform.
                </p>
              </div>
            </div>
          ) : (
            /* Tab 2: Raw JSON Inspection */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-mono">ClaimResponseDTO payload</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJson}
                    data-testid="copy-json-btn"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    )}
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>

                  <button
                    onClick={handleDownloadJson}
                    data-testid="download-json-btn"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download .json</span>
                  </button>
                </div>
              </div>

              <pre
                data-testid="claim-json-content"
                className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-96"
              >
                {serializedJson}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition"
          >
            Close Audit View
          </button>
        </div>
      </div>
    </div>
  );
};
