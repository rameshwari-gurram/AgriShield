/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Policy Card Component
 *
 * Displays policy status, coverage amount, premium, remaining coverage,
 * coverage window, and covered hazards.
 *
 * Adheres strictly to invariant rules:
 * - Preserves monetary values as decimal strings without floating-point math.
 * - Handles empty or missing policy states gracefully without fabricating data.
 */

import React, { useState } from 'react';
import {
  Shield,
  Calendar,
  Copy,
  Check,
  Zap,
  TrendingDown,
  Coins,
  Sprout,
} from 'lucide-react';
import { Policy } from '../../types';
import { PolicyStatusBadge } from './PolicyStatusBadge';

export interface PolicyCardProps {
  policy: Policy | null;
  allPoliciesCount?: number;
}

const HAZARD_LABELS: Record<string, string> = {
  HIGH_TEMPERATURE: 'Extreme Heat',
  LOW_TEMPERATURE: 'Cold Wave',
  HEAVY_RAINFALL: 'Heavy Rainfall (24h)',
  DEFICIT_RAINFALL: 'Rainfall Deficit',
  HIGH_HUMIDITY: 'Excessive Humidity',
  LOW_HUMIDITY: 'Severe Dry Air',
  STRONG_WIND: 'High Wind',
  SOIL_MOISTURE_DEFICIT: 'Soil Moisture Stress',
  INTENSE_RAINFALL: 'Intense Rainfall (3h)',
  CONSECUTIVE_DRY_DAYS: 'Dry Spell',
  EXTREME_HEATWAVE: 'Extreme Heatwave',
};

function formatCurrency(amountStr: string | number): string {
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return `₹${amountStr}`;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoStr: string): string {
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

export const PolicyCard: React.FC<PolicyCardProps> = ({
  policy,
  allPoliciesCount,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPolicyNumber = async () => {
    if (!policy?.policyNumber) return;
    try {
      await navigator.clipboard.writeText(policy.policyNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // 1. Empty State
  if (!policy) {
    return (
      <div
        data-testid="policy-card-empty"
        className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-3"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <Shield className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-800">No Active Parametric Policy</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            There is currently no active insurance contract covering this farm parcel.
            Parametric policies activate upon verified underwriting issuance.
          </p>
        </div>
      </div>
    );
  }

  // Calculate visual progress for display
  const sumInsuredNum = parseFloat(policy.sumInsured) || 1;
  const paidNum = parseFloat(policy.cumulativePaidAmount) || 0;
  const paidPercent = Math.min(100, Math.max(0, (paidNum / sumInsuredNum) * 100));

  return (
    <div
      data-testid="policy-card"
      className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-5"
    >
      {/* Policy Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
            <h4 className="text-base font-bold text-slate-900">
              Parametric Insurance Contract
            </h4>
            <PolicyStatusBadge status={policy.status} size="sm" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span>Contract #{policy.policyNumber}</span>
            <button
              onClick={handleCopyPolicyNumber}
              title="Copy policy number"
              className="p-1 hover:text-slate-800 transition"
              aria-label="Copy policy number"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {allPoliciesCount && allPoliciesCount > 1 ? (
          <div className="text-[11px] font-medium text-slate-500 self-start sm:self-auto bg-slate-100 px-2.5 py-1 rounded-full">
            {allPoliciesCount} total policies on parcel
          </div>
        ) : null}
      </div>

      {/* Financial Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Sum Insured */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Sum Insured</span>
            <Coins className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <div
            data-testid="policy-sum-insured"
            className="text-lg font-bold text-slate-900 font-mono"
          >
            {formatCurrency(policy.sumInsured)}
          </div>
          <div className="text-[11px] text-slate-400">Total contractual coverage cap</div>
        </div>

        {/* Remaining Coverage */}
        <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-800 font-medium">
            <span>Remaining Coverage</span>
            <Shield className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          </div>
          <div
            data-testid="policy-remaining-coverage"
            className="text-lg font-bold text-emerald-950 font-mono"
          >
            {formatCurrency(policy.remainingCoverage)}
          </div>
          <div className="text-[11px] text-emerald-700/80">Available for future claims</div>
        </div>

        {/* Cumulative Paid */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Cumulative Claims Paid</span>
            <TrendingDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <div
            data-testid="policy-cumulative-paid"
            className="text-lg font-bold text-slate-900 font-mono"
          >
            {formatCurrency(policy.cumulativePaidAmount)}
          </div>
          <div className="text-[11px] text-slate-400">Settled payouts to date</div>
        </div>
      </div>

      {/* Coverage Utilization Bar */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Coverage Utilization</span>
          <span className="font-mono font-medium">{paidPercent.toFixed(1)}% settled</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            data-testid="policy-utilization-bar"
            className={`h-full transition-all duration-300 ${
              policy.status === 'EXHAUSTED'
                ? 'bg-slate-500'
                : paidPercent > 75
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${paidPercent}%` }}
          />
        </div>
      </div>

      {/* Contract Parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs border-t border-slate-100">
        <div className="flex items-center gap-2 text-slate-600">
          <Sprout className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
          <span>
            Covered Crop: <strong className="text-slate-900">{policy.cropName}</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Premium: <strong className="text-slate-900">{formatCurrency(policy.premiumAmount)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
          <span>
            Coverage Period:{' '}
            <strong className="text-slate-900">
              {formatDate(policy.startDate)} — {formatDate(policy.endDate)}
            </strong>
          </span>
        </div>
      </div>

      {/* Covered Parametric Hazards */}
      {policy.coveredHazards && policy.coveredHazards.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>Covered Weather Hazards:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {policy.coveredHazards.map((hazard) => (
              <span
                key={hazard}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 text-slate-700 border border-slate-200/80"
              >
                {HAZARD_LABELS[hazard] || hazard}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
