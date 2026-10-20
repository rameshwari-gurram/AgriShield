/**
 * Module 6 Stage 5B-2 / Module 10 Stage 10.2: Risk Event Card Component
 * Presents detailed metrics and metadata for a single climate-risk rule evaluation.
 *
 * Stage 10.2 Enhancement:
 * - Integrates assessment-driven parametric claim evaluation for eligible (TRIGGERED) events.
 * - Allows authenticated, authorized producers to initiate claim evaluation without manual UUID entry.
 * - Displays active claim status, duplicate claim notices, and clear error / loading states.
 * - Enforces Statutory Separation Notice: Module 8 ML forecasts are never used as claim evidence.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Info,
  Calendar,
  Layers,
  ShieldCheck,
  Lock,
  Receipt,
  ChevronRight,
} from 'lucide-react';
import { RiskEvent, Claim } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ProducerAuthModal } from '../auth/ProducerAuthModal';
import { LoadingSpinner } from '../LoadingSpinner';
import {
  policyClaimService,
  parsePolicyClaimErrorMessage,
} from '../../services/policyClaimService';

export interface RiskEventCardProps {
  event: RiskEvent;
  farmId?: string;
  farmerId?: string;
  existingClaim?: Claim | null;
  onClaimEvaluated?: (claim: Claim) => void;
}

function formatCurrency(amountStr: string | number | undefined): string {
  if (amountStr === undefined || amountStr === null) return '—';
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return `₹${amountStr}`;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const RiskEventCard: React.FC<RiskEventCardProps> = ({
  event,
  farmId,
  farmerId,
  existingClaim = null,
  onClaimEvaluated,
}) => {
  const auth = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluatedClaim, setEvaluatedClaim] = useState<Claim | null>(null);
  const [duplicateClaimInfo, setDuplicateClaimInfo] = useState<{
    claimNumber?: string;
    message: string;
  } | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  const activeClaim = evaluatedClaim || existingClaim;
  const isTriggered = event.triggered || event.status === 'TRIGGERED';

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

  const handleEvaluate = async () => {
    if (isEvaluating) return;
    if (!farmId) {
      setEvalError('Farm identifier is missing. Cannot locate active insurance policies.');
      return;
    }

    try {
      setIsEvaluating(true);
      setEvalError(null);
      setDuplicateClaimInfo(null);

      // 1. Fetch active policy covering this event's observation timestamp (SEC-10.2-02)
      // Strictly date-aware: only policies covering event.observedAt are eligible.
      const activePolicyRes = await policyClaimService.getActiveFarmPolicy(
        farmId,
        event.observedAt,
        { token: auth.producerToken || undefined }
      );

      const targetPolicy = activePolicyRes.data;

      if (!targetPolicy) {
        setEvalError(
          'No active insurance policy covered this farm on the observation date.'
        );
        return;
      }

      // 2. Verify hazard type coverage
      if (!targetPolicy.coveredHazards.includes(event.hazardType)) {
        setEvalError(
          `Hazard type '${event.hazardType}' is not covered under active policy '${targetPolicy.policyNumber}'. Covered hazards: ${targetPolicy.coveredHazards.join(', ')}.`
        );
        return;
      }

      // 3. Dispatch claim evaluation to backend (SEC-10.2-01: payoutConfig omitted so server uses authoritative multipliers)
      const evalRes = await policyClaimService.evaluateParametricClaim(
        {
          policyId: targetPolicy.id,
          assessmentId: event.assessmentId,
          riskEventId: event.id,
        },
        { token: auth.producerToken || undefined }
      );

      if (evalRes.success && evalRes.data) {
        setEvaluatedClaim(evalRes.data);
        if (onClaimEvaluated) {
          onClaimEvaluated(evalRes.data);
        }
      }
    } catch (err: unknown) {
      const anyErr = err as any;
      const status = anyErr?.response?.status;
      const backendMessage = anyErr?.response?.data?.message || anyErr?.message || '';

      if (status === 409) {
        // Duplicate claim detected
        const match = backendMessage.match(/CLM-[A-Z0-9-]+/i);
        setDuplicateClaimInfo({
          claimNumber: match ? match[0] : undefined,
          message: backendMessage || 'A claim has already been evaluated for this risk event.',
        });
      } else {
        const parsed = parsePolicyClaimErrorMessage(err, 'Failed to evaluate parametric claim.');
        setEvalError(parsed.message);
      }
    } finally {
      setIsEvaluating(false);
    }
  };

  const isOwner = farmerId && auth.activeProducer ? auth.isOwnerOfFarm(farmerId) : auth.isAuthenticated;

  return (
    <div
      data-testid={`risk-event-card-${event.id}`}
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
            {event.observationWindow?.replace(/_/g, ' ') || '24h'}
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

      {/* Stage 10.2: Assessment-Driven Parametric Claim Evaluation Section */}
      {isTriggered && (
        <div className="mt-4 pt-3 border-t border-slate-200/80">
          {/* Case 1: Active or newly evaluated claim exists */}
          {activeClaim ? (
            <div
              data-testid={`claim-evaluated-box-${event.id}`}
              className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs space-y-2 shadow-2xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Parametric Claim Registered</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                    {activeClaim.status}
                  </span>
                </div>
                <span className="font-mono font-bold text-slate-900 text-[11px] bg-white px-2 py-0.5 rounded border border-emerald-200 self-start sm:self-auto">
                  {activeClaim.claimNumber}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Calculated Payout: </span>
                  <span className="font-bold text-slate-900 font-mono">
                    {formatCurrency(activeClaim.payoutAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Trigger Rule: </span>
                  <span className="font-mono text-slate-700 font-semibold">{activeClaim.triggerRuleCode}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px]">
                <span className="text-emerald-800 text-[10px]">
                  {activeClaim.status === 'PENDING'
                    ? 'Evaluated in PENDING status subject to automated policy verification'
                    : activeClaim.status === 'PAID'
                    ? 'Indemnity disbursed via simulated banking transfer'
                    : activeClaim.status}
                </span>
                <Link
                  to="/claims"
                  className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:text-emerald-900 hover:underline"
                >
                  <span>View in Claims Portfolio</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : duplicateClaimInfo ? (
            /* Case 2: Duplicate evaluation detected (HTTP 409 Conflict) */
            <div
              data-testid={`claim-duplicate-box-${event.id}`}
              className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-sky-950">
                  <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />
                  <span>Claim Already Evaluated</span>
                </div>
                {duplicateClaimInfo.claimNumber && (
                  <span className="font-mono font-bold text-slate-800 text-[11px] bg-white px-2 py-0.5 rounded border border-sky-200">
                    {duplicateClaimInfo.claimNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-sky-900/90 leading-relaxed">
                {duplicateClaimInfo.message}
              </p>
              <div className="pt-1.5 border-t border-sky-200/60 flex items-center justify-end text-[11px]">
                <Link
                  to="/claims"
                  className="inline-flex items-center gap-1 text-sky-800 font-semibold hover:text-sky-950 hover:underline"
                >
                  <span>View in Claims Portfolio</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : !auth.isAuthenticated ? (
            /* Case 3: Unauthenticated user prompt */
            <div
              data-testid={`claim-auth-prompt-${event.id}`}
              className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
            >
              <div className="space-y-0.5">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Parametric Claim Evaluation Eligible</span>
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed">
                  Meteorological threshold breached. Authenticate as Producer to evaluate prospective claim under your active policy terms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                data-testid={`auth-eval-btn-${event.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs transition self-start sm:self-center whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Authenticate to Evaluate</span>
              </button>
            </div>
          ) : !isOwner ? (
            /* Case 4: Unauthorized producer */
            <div
              data-testid={`claim-unauthorized-alert-${event.id}`}
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>Access Denied: Parametric claim evaluation is restricted to the registered owner of this farm parcel.</span>
            </div>
          ) : (
            /* Case 5: Authenticated & Authorized - Evaluation Available */
            <div
              data-testid={`claim-evaluate-panel-${event.id}`}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5 shadow-2xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Parametric Claim Evaluation Available</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Evaluates physical meteorological breach against active policy rules. Creates claim in PENDING status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={isEvaluating}
                  data-testid={`evaluate-claim-btn-${event.id}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition whitespace-nowrap self-start sm:self-center"
                >
                  {isEvaluating ? (
                    <>
                      <LoadingSpinner size="sm" className="text-white" />
                      <span>Evaluating Claim...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Evaluate Parametric Claim</span>
                    </>
                  )}
                </button>
              </div>

              {evalError && (
                <div
                  data-testid={`eval-error-alert-${event.id}`}
                  className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start justify-between gap-2"
                >
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span>{evalError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEvalError(null)}
                    aria-label="Dismiss error"
                    className="text-rose-500 hover:text-rose-700 text-xs font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Statutory Insurance Separation Notice */}
              <div className="text-[10px] text-slate-400 italic leading-relaxed">
                * Evaluation uses authoritative Module 6 meteorological risk events ({event.ruleCode}) and active policy terms. Module 8 ML forecasts & NDVI predictions are advisory only and never determine insurance claims.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Producer Auth Modal */}
      <ProducerAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => {
          setAuthModalOpen(false);
        }}
      />
    </div>
  );
};
