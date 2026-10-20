/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Farm Policy & Claims Container Component
 *
 * Container component mounted on FarmDetailPage:
 * - Resiliently fetches farm policies and claims via Promise.allSettled().
 * - Displays active PolicyCard, ClaimHistoryTable, and ClaimAuditModal.
 * - Handles loading, empty, partial-success, 401 Auth, 403 Forbidden, 404 Not Found, and 500 error states.
 * - Does NOT include approve, reject, settle, or evaluation controls.
 * - Strictly avoids displaying unverified fallback records or another farmer's data.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Lock,
  ServerCrash,
  AlertCircle,
  FileQuestion,
  ShieldCheck,
} from 'lucide-react';
import { Policy, Claim } from '../../types';
import {
  policyClaimService,
  parsePolicyClaimErrorMessage,
  ParsedPolicyClaimError,
} from '../../services/policyClaimService';
import { PolicyCard } from './PolicyCard';
import { ClaimHistoryTable } from './ClaimHistoryTable';
import { ClaimAuditModal } from './ClaimAuditModal';
import { LoadingSpinner } from '../LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { ProducerAuthModal } from '../auth/ProducerAuthModal';

export interface FarmPolicyClaimsSectionProps {
  farmId: string;
  initialPolicies?: Policy[];
  initialClaims?: Claim[];
  initialLoading?: boolean;
  initialError?: string | null;
  token?: string;
  onOpenAuthModal?: () => void;
}

export const FarmPolicyClaimsSection: React.FC<FarmPolicyClaimsSectionProps> = ({
  farmId,
  initialPolicies,
  initialClaims,
  initialLoading,
  initialError,
  token,
  onOpenAuthModal,
}) => {
  const auth = useAuth();
  const effectiveToken = token !== undefined ? token : auth.producerToken;
  const [producerAuthModalOpen, setProducerAuthModalOpen] = useState(false);

  const [policies, setPolicies] = useState<Policy[]>(initialPolicies || []);
  const [claims, setClaims] = useState<Claim[]>(initialClaims || []);
  const [loading, setLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialPolicies && !initialClaims && !initialError
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [generalError, setGeneralError] = useState<ParsedPolicyClaimError | null>(
    initialError ? parsePolicyClaimErrorMessage(initialError) : null
  );
  const [policyError, setPolicyError] = useState<ParsedPolicyClaimError | null>(null);
  const [claimError, setClaimError] = useState<ParsedPolicyClaimError | null>(null);

  // Modal State
  const [selectedClaimForAudit, setSelectedClaimForAudit] = useState<Claim | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);

  const fetchData = useCallback(
    async (isRefresh: boolean = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setGeneralError(null);
        setPolicyError(null);
        setClaimError(null);

        const [policiesResult, claimsResult] = await Promise.allSettled([
          policyClaimService.getFarmPolicies(farmId, { token: effectiveToken || undefined }),
          policyClaimService.getFarmClaims(farmId, { token: effectiveToken || undefined }),
        ]);

        // Process Policies Result
        if (policiesResult.status === 'fulfilled') {
          setPolicies(policiesResult.value.data || []);
        } else {
          const parsed = parsePolicyClaimErrorMessage(policiesResult.reason);
          setPolicyError(parsed);
          setPolicies([]);
        }

        // Process Claims Result
        if (claimsResult.status === 'fulfilled') {
          setClaims(claimsResult.value.data || []);
        } else {
          const parsed = parsePolicyClaimErrorMessage(claimsResult.reason);
          setClaimError(parsed);
          setClaims([]);
        }
      } catch (err: unknown) {
        const parsed = parsePolicyClaimErrorMessage(err);
        setGeneralError(parsed);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [farmId, effectiveToken]
  );

  useEffect(() => {
    if (!initialPolicies && !initialClaims && !initialError) {
      fetchData(false);
    }
  }, [fetchData, initialPolicies, initialClaims, initialError, effectiveToken]);

  const handleOpenAuditModal = (claim: Claim) => {
    setSelectedClaimForAudit(claim);
    setAuditModalOpen(true);
  };

  const handleCloseAuditModal = () => {
    setSelectedClaimForAudit(null);
    setAuditModalOpen(false);
  };

  // Determine active policy (prefers status ACTIVE, falls back to latest issued or first)
  const activePolicy =
    policies.find((p) => p.status === 'ACTIVE') ||
    policies.find((p) => p.status === 'PENDING') ||
    policies[0] ||
    null;

  // Resolve matching policy for the inspected claim in audit modal
  const associatedPolicyForModal = selectedClaimForAudit
    ? policies.find((p) => p.id === selectedClaimForAudit.policyId) || activePolicy
    : null;

  // Check for critical authorization or not-found errors
  const activeAuthError =
    (generalError?.isAuthError && generalError) ||
    (policyError?.isAuthError && policyError) ||
    (claimError?.isAuthError && claimError) ||
    null;

  const activeNotFoundError =
    (generalError?.isNotFound && generalError) ||
    (policyError?.isNotFound && policyError) ||
    (claimError?.isNotFound && claimError) ||
    null;

  return (
    <div
      data-testid="farm-policy-claims-section"
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900">
              Parametric Insurance & Automated Claims
            </h3>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              Module 9
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Underwritten weather contracts with algorithmic claim evaluation and simulated payout settlement.
            Payout entitlements execute automatically when authoritative Module 6 parametric rules are triggered.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {auth.isAuthenticated && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{auth.activeProducer?.fullName}</span>
            </div>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            data-testid="refresh-policy-claims-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition disabled:opacity-50"
            title="Refresh policies and claims"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton State */}
      {loading ? (
        <div
          data-testid="policy-claims-loading"
          className="p-12 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3"
        >
          <LoadingSpinner size="md" className="mx-auto text-emerald-600" />
          <div className="text-xs text-slate-500 font-medium">
            Loading parametric insurance policies and claims...
          </div>
        </div>
      ) : activeAuthError ? (
        /* 401 / 403 Authentication & Ownership Restriction */
        <div
          data-testid="policy-claims-auth-alert"
          className="p-6 rounded-2xl bg-slate-50 border border-slate-300 text-slate-800 space-y-3"
        >
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-slate-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">
                Producer Authentication Required
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {activeAuthError.message}
              </p>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 pl-9">
            In adherence to platform data isolation and privacy policies, insurance contracts and claims history are confidential and restricted strictly to the verified parcel producer (<code className="font-mono text-slate-700">farm.farmerId === req.user.id</code>).
          </div>
          <div className="pl-9 pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => (onOpenAuthModal ? onOpenAuthModal() : setProducerAuthModalOpen(true))}
              data-testid="policy-claims-auth-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition shadow-xs active:scale-95"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Authenticate as Producer</span>
            </button>
            {auth.isAuthenticated && (
              <button
                type="button"
                onClick={auth.logout}
                className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1"
              >
                Switch Account
              </button>
            )}
          </div>
        </div>
      ) : activeNotFoundError ? (
        /* 404 Farm Parcel Not Found */
        <div
          data-testid="policy-claims-not-found-alert"
          className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <FileQuestion className="w-5 h-5 text-amber-600 flex-shrink-0" aria-hidden="true" />
            <span>Farm Parcel Not Found</span>
          </div>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            {activeNotFoundError.message}
          </p>
        </div>
      ) : generalError && generalError.isServerError ? (
        /* 500 / Network Error */
        <div
          data-testid="policy-claims-server-error-alert"
          className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 space-y-3"
        >
          <div className="flex items-start gap-3">
            <ServerCrash className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-rose-900">Service Temporarily Unavailable</h4>
              <p className="text-xs text-rose-800 leading-relaxed">{generalError.message}</p>
            </div>
          </div>
          <div className="pl-9">
            <button
              onClick={() => fetchData(false)}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-rose-300 text-xs font-bold text-rose-800 hover:bg-rose-50 transition shadow-2xs"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
        /* Populated / Main Section Content */
        <div className="space-y-6">
          {/* Policy Overview Card */}
          {policyError ? (
            <div
              data-testid="policy-fetch-error-banner"
              className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" aria-hidden="true" />
                <span>Failed to load policy contract: {policyError.message}</span>
              </div>
              <button
                onClick={() => fetchData(true)}
                className="text-xs font-bold text-rose-700 hover:underline flex-shrink-0"
              >
                Retry
              </button>
            </div>
          ) : (
            <PolicyCard policy={activePolicy} allPoliciesCount={policies.length} />
          )}

          {/* Claims History Table */}
          {claimError ? (
            <div
              data-testid="claim-fetch-error-banner"
              className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" aria-hidden="true" />
                <span>Failed to load claims history: {claimError.message}</span>
              </div>
              <button
                onClick={() => fetchData(true)}
                className="text-xs font-bold text-rose-700 hover:underline flex-shrink-0"
              >
                Retry
              </button>
            </div>
          ) : (
            <ClaimHistoryTable
              claims={claims}
              onViewAudit={handleOpenAuditModal}
            />
          )}

          {/* Transparent Provenance Modal */}
          <ClaimAuditModal
            claim={selectedClaimForAudit}
            policy={associatedPolicyForModal}
            isOpen={auditModalOpen}
            onClose={handleCloseAuditModal}
          />
        </div>
      )}

      {/* Producer Authentication Modal */}
      <ProducerAuthModal
        isOpen={producerAuthModalOpen}
        onClose={() => setProducerAuthModalOpen(false)}
        onAuthenticated={() => fetchData(true)}
      />
    </div>
  );
};
