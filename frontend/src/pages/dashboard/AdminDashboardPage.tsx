/**
 * AgriShield Stage 3, Step 3: Admin Dashboard
 *
 * Dedicated Underwriting & Governance Portal for authenticated Administrators:
 * - Macro KPI portfolio overview across all registered farmers and farms.
 * - Module 6 authoritative parametric risk portfolio summary and rules catalog.
 * - Underwriting queue: inspect and issue PENDING policies via POST /policies/:id/issue.
 * - Claims adjudication queue: inspect, approve (POST /claims/:id/approve), reject with reason
 *   (POST /claims/:id/reject), and settle (POST /claims/:id/settle) parametric claims.
 * - Consequential action confirmation dialogs with duplicate-submission protection.
 * - Transparent error reporting and complete zero-state handling.
 * - Mandatory Module 6/8 governance separation notice (ML is purely advisory).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  Sprout,
  Receipt,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  XCircle,
  Coins,
  FileCheck2,
  AlertCircle,
  Info,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { farmerService } from '../../services/farmerService';
import { farmService } from '../../services/farmService';
import { policyClaimService } from '../../services/policyClaimService';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import {
  Farmer,
  Farm,
  PolicyWithFarm,
  ClaimWithFarm,
  PortfolioRiskSummaryDTO,
} from '../../types';
import { PortfolioRiskSummaryCard } from '../../components/risk/PortfolioRiskSummaryCard';
import { RiskRuleCatalogModal } from '../../components/risk/RiskRuleCatalogModal';
import { PolicyStatusBadge } from '../../components/policy/PolicyStatusBadge';
import { ClaimStatusBadge } from '../../components/policy/ClaimStatusBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export interface AdminDashboardPageProps {
  initialFarmers?: Farmer[];
  initialFarms?: Farm[];
  initialPolicies?: PolicyWithFarm[];
  initialClaims?: ClaimWithFarm[];
  initialSummary?: PortfolioRiskSummaryDTO | null;
  initialLoading?: boolean;
  initialError?: string | null;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  initialFarmers,
  initialFarms,
  initialPolicies,
  initialClaims,
  initialSummary,
  initialLoading,
  initialError = null,
}) => {
  const { user } = useAuth();
  const adminName = (user as any)?.username || (user as any)?.fullName || 'Administrator';

  const [farmers, setFarmers] = useState<Farmer[]>(initialFarmers || []);
  const [farms, setFarms] = useState<Farm[]>(initialFarms || []);
  const [policies, setPolicies] = useState<PolicyWithFarm[]>(initialPolicies || []);
  const [claims, setClaims] = useState<ClaimWithFarm[]>(initialClaims || []);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioRiskSummaryDTO | null>(
    initialSummary !== undefined ? initialSummary : null
  );

  const [loading, setLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : initialFarms === undefined
  );
  const [error, setError] = useState<string | null>(initialError);

  // Modals & Action States
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Action Dialog States
  const [issuingPolicy, setIssuingPolicy] = useState<PolicyWithFarm | null>(null);
  const [approvingClaim, setApprovingClaim] = useState<ClaimWithFarm | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<ClaimWithFarm | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [settlingClaim, setSettlingClaim] = useState<ClaimWithFarm | null>(null);
  const [simulatedTxId, setSimulatedTxId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchAdminData = useCallback(async () => {
    if (initialFarms !== undefined) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Farmers, Farms, and Portfolio Risk Summary in parallel
      const [farmerRes, farmRes, summaryRes] = await Promise.allSettled([
        farmerService.getFarmers({ limit: 100 }),
        farmService.getFarms({ limit: 100 }),
        riskAssessmentService.getPortfolioRiskSummary(),
      ]);

      let loadedFarms: Farm[] = [];
      if (farmRes.status === 'fulfilled' && farmRes.value?.data?.farms) {
        loadedFarms = farmRes.value.data.farms;
        setFarms(loadedFarms);
      }

      if (farmerRes.status === 'fulfilled' && farmerRes.value?.data?.farmers) {
        setFarmers(farmerRes.value.data.farmers);
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value?.data) {
        setPortfolioSummary(summaryRes.value.data);
      }

      // 2. Fetch Policies and Claims for loaded farms
      if (loadedFarms.length > 0) {
        const [polRes, clmRes] = await Promise.allSettled([
          policyClaimService.getPoliciesForFarms(loadedFarms),
          policyClaimService.getClaimsForFarms(loadedFarms),
        ]);

        if (polRes.status === 'fulfilled') {
          setPolicies(polRes.value);
        }
        if (clmRes.status === 'fulfilled') {
          setClaims(clmRes.value);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve administrative holdings';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [initialFarms]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  // Handle Policy Issuance (POST /policies/:id/issue)
  const handleConfirmIssuePolicy = async () => {
    if (!issuingPolicy || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setActionError(null);

      const res = await policyClaimService.issuePolicy(issuingPolicy.id);
      setActionSuccess(`Policy ${res.data.policyNumber} issued and activated successfully.`);

      // Update local policy state
      setPolicies((prev) =>
        prev.map((p) => (p.id === issuingPolicy.id ? { ...p, status: 'ACTIVE' } : p))
      );
      setIssuingPolicy(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to issue policy.';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Claim Approval (POST /claims/:id/approve)
  const handleConfirmApproveClaim = async () => {
    if (!approvingClaim || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setActionError(null);

      const res = await policyClaimService.approveClaim(approvingClaim.id);
      setActionSuccess(`Claim ${res.data.claimNumber} approved successfully. Ready for settlement.`);

      // Update local claim state
      setClaims((prev) =>
        prev.map((c) => (c.id === approvingClaim.id ? { ...c, status: 'APPROVED' } : c))
      );
      setApprovingClaim(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to approve claim.';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Claim Rejection (POST /claims/:id/reject)
  const handleConfirmRejectClaim = async () => {
    if (!rejectingClaim || isSubmitting) return;
    const reason = rejectionReason.trim();
    if (reason.length < 3) {
      setActionError('Rejection reason must be at least 3 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      setActionError(null);

      const res = await policyClaimService.rejectClaim(rejectingClaim.id, reason);
      setActionSuccess(`Claim ${res.data.claimNumber} rejected.`);

      // Update local claim state
      setClaims((prev) =>
        prev.map((c) =>
          c.id === rejectingClaim.id ? { ...c, status: 'REJECTED', rejectionReason: reason } : c
        )
      );
      setRejectingClaim(null);
      setRejectionReason('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to reject claim.';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Claim Settlement (POST /claims/:id/settle)
  const handleConfirmSettleClaim = async () => {
    if (!settlingClaim || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setActionError(null);

      const txId = simulatedTxId.trim() || undefined;
      const res = await policyClaimService.settleClaim(settlingClaim.id, txId);
      setActionSuccess(
        `Claim ${res.data.claimNumber} settled and paid via reference ${res.data.payoutReference || 'simulated transaction'}.`
      );

      // Update local claim state
      setClaims((prev) =>
        prev.map((c) =>
          c.id === settlingClaim.id
            ? { ...c, status: 'PAID', payoutReference: res.data.payoutReference }
            : c
        )
      );
      setSettlingClaim(null);
      setSimulatedTxId('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to settle claim.';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Aggregates & Queues
  const pendingPolicies = policies.filter((p) => p.status === 'PENDING');
  const activePolicies = policies.filter((p) => p.status === 'ACTIVE');
  const pendingClaims = claims.filter((c) => c.status === 'PENDING');
  const approvedClaims = claims.filter((c) => c.status === 'APPROVED');
  const totalPaidAmount = claims
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + (Number(c.payoutAmount) || 0), 0);

  return (
    <div
      className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
      data-testid="admin-dashboard-container"
    >
      {/* 1. Header Banner */}
      <section className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
              <span>Administrative Underwriting & Governance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Administrator Control Center
            </h1>
            <p className="text-xs sm:text-sm text-purple-200/80">
              Signed in as <strong className="text-white font-mono">{adminName}</strong> • System-wide policy issuance, parametric claims adjudication, and risk surveillance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/farmers"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-xs uppercase tracking-wider transition shadow-md"
              data-testid="admin-farmers-link"
            >
              <Users className="w-4 h-4" />
              <span>Farmer Registry</span>
            </Link>
            <Link
              to="/farms"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs uppercase tracking-wider backdrop-blur-sm border border-white/20 transition"
              data-testid="admin-farms-link"
            >
              <Sprout className="w-4 h-4" />
              <span>All Farm Parcels</span>
            </Link>
            <button
              onClick={fetchAdminData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs backdrop-blur-sm border border-white/20 transition disabled:opacity-50"
              title="Refresh holdings"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Operation Feedback Alerts */}
      {actionSuccess && (
        <div
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between"
          data-testid="admin-action-success"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between"
          data-testid="admin-action-error"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Loading State */}
      {loading && (
        <div
          className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4"
          data-testid="admin-dashboard-loading"
        >
          <LoadingSpinner size="lg" />
          <p className="text-sm font-medium text-slate-600">
            Loading administrative portfolio metrics, underwriting queues, and claim records...
          </p>
        </div>
      )}

      {/* 3. Error State */}
      {!loading && error && (
        <div
          className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-4"
          data-testid="admin-dashboard-error"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold">Failed to Load Administrative Portfolio</h4>
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          </div>
          <button
            onClick={fetchAdminData}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4. Operational Metrics KPI Grid */}
      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-metric-cards">
          {/* Total Farmers */}
          <Link
            to="/farmers"
            className="bg-white rounded-2xl border border-slate-200 hover:border-purple-300 p-5 shadow-xs transition space-y-1 block"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registered Farmers</span>
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{farmers.length}</div>
            <div className="text-[11px] text-purple-700 font-semibold flex items-center gap-1">
              <span>View registry</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </Link>

          {/* Registered Farm Parcels */}
          <Link
            to="/farms"
            className="bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 p-5 shadow-xs transition space-y-1 block"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monitored Parcels</span>
              <Sprout className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{farms.length}</div>
            <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
              <span>Inspect parcels</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </Link>

          {/* Policies Queue */}
          <Link
            to="/policies"
            className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 p-5 shadow-xs transition space-y-1 block"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Policies</span>
              <ShieldCheck className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">
              {activePolicies.length} <span className="text-sm font-normal text-slate-500">Active</span>
            </div>
            <div className="text-[11px] text-blue-700 font-semibold">
              {pendingPolicies.length} pending issuance
            </div>
          </Link>

          {/* Claims Queue */}
          <Link
            to="/claims"
            className="bg-white rounded-2xl border border-slate-200 hover:border-amber-300 p-5 shadow-xs transition space-y-1 block"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Claims Queue</span>
              <Receipt className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">
              {pendingClaims.length + approvedClaims.length}{' '}
              <span className="text-sm font-normal text-slate-500">Awaiting Action</span>
            </div>
            <div className="text-[11px] text-amber-700 font-semibold">
              ₹{totalPaidAmount.toLocaleString('en-IN')} total disbursed
            </div>
          </Link>
        </div>
      )}

      {/* 5. Macro Portfolio Risk Summary Card */}
      {!loading && !error && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Portfolio Climate Risk Surveillance</h2>
              <p className="text-xs text-slate-500">
                Authoritative Module 6 risk assessment across all active agricultural plots.
              </p>
            </div>
            <button
              onClick={() => setCatalogModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-600" />
              <span>Parametric Rules Catalog</span>
            </button>
          </div>

          <PortfolioRiskSummaryCard
            summary={portfolioSummary}
            loading={false}
            error={null}
            onRetry={fetchAdminData}
            onViewRules={() => setCatalogModalOpen(true)}
          />
        </section>
      )}

      {/* 6. Underwriting Queue: Pending Policy Issuance */}
      {!loading && !error && (
        <section className="space-y-4" data-testid="underwriting-queue-section">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Underwriting & Policy Issuance Queue</h2>
              <p className="text-xs text-slate-500">
                Pending parametric policies requiring administrative validation and issuance.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
              {pendingPolicies.length} Pending
            </span>
          </div>

          {pendingPolicies.length === 0 ? (
            <div
              className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-2 shadow-xs"
              data-testid="empty-policy-queue"
            >
              <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-900">No Policies Pending Issuance</h4>
              <p className="text-xs text-slate-500">
                All created parametric insurance contracts are currently active, expired, or processed.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[10px] font-bold">
                    <tr>
                      <th className="px-5 py-3">Policy Number</th>
                      <th className="px-5 py-3">Farm Parcel</th>
                      <th className="px-5 py-3">Crop</th>
                      <th className="px-5 py-3">Sum Insured</th>
                      <th className="px-5 py-3">Premium</th>
                      <th className="px-5 py-3">Covered Hazards</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingPolicies.map((pol) => (
                      <tr key={pol.id} className="hover:bg-slate-50/80 transition" data-testid={`policy-row-${pol.id}`}>
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                          {pol.policyNumber}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          {pol.farm?.farmName || pol.farmId}
                        </td>
                        <td className="px-5 py-3.5">{pol.cropName}</td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">
                          ₹{Number(pol.sumInsured).toLocaleString('en-IN')}
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">
                          ₹{Number(pol.premiumAmount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="truncate max-w-[140px] block" title={pol.coveredHazards?.join(', ')}>
                            {pol.coveredHazards?.length || 0} Hazards
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <PolicyStatusBadge status={pol.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => setIssuingPolicy(pol)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition"
                            data-testid={`issue-policy-btn-${pol.id}`}
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Issue Policy</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 7. Claims Adjudication & Settlement Queue */}
      {!loading && !error && (
        <section className="space-y-4" data-testid="claims-adjudication-section">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Parametric Claims Adjudication Queue</h2>
              <p className="text-xs text-slate-500">
                Triggered claims awaiting administrative approval, rejection, or financial settlement.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
              {pendingClaims.length + approvedClaims.length} Actionable
            </span>
          </div>

          {claims.length === 0 ? (
            <div
              className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-2 shadow-xs"
              data-testid="empty-claims-queue"
            >
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-900">All Claims Clear</h4>
              <p className="text-xs text-slate-500">
                No parametric claims have been triggered or recorded in the system.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[10px] font-bold">
                    <tr>
                      <th className="px-5 py-3">Claim Number</th>
                      <th className="px-5 py-3">Farm Parcel</th>
                      <th className="px-5 py-3">Trigger Rule</th>
                      <th className="px-5 py-3">Observed vs Threshold</th>
                      <th className="px-5 py-3">Payout Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Adjudication Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {claims.map((clm) => (
                      <tr key={clm.id} className="hover:bg-slate-50/80 transition" data-testid={`claim-row-${clm.id}`}>
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                          {clm.claimNumber}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          {clm.farm?.farmName || clm.farm?.id || 'Farm Parcel'}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-purple-800">
                          {clm.triggerRuleCode}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-rose-700">{clm.observedValue || 'Breach'}</span> / {clm.thresholdValue}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">
                          ₹{Number(clm.payoutAmount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-5 py-3.5">
                          <ClaimStatusBadge status={clm.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1.5">
                          {clm.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => setApprovingClaim(clm)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition"
                                data-testid={`approve-claim-btn-${clm.id}`}
                              >
                                <Check className="w-3 h-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingClaim(clm);
                                  setRejectionReason('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition"
                                data-testid={`reject-claim-btn-${clm.id}`}
                              >
                                <X className="w-3 h-3" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                          {clm.status === 'APPROVED' && (
                            <button
                              onClick={() => {
                                setSettlingClaim(clm);
                                setSimulatedTxId(`SIM-PAY-${Date.now().toString().slice(-6)}`);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-[11px] transition shadow-xs"
                              data-testid={`settle-claim-btn-${clm.id}`}
                            >
                              <Coins className="w-3.5 h-3.5" />
                              <span>Settle Payout</span>
                            </button>
                          )}
                          {clm.status === 'PAID' && (
                            <span className="text-[11px] font-mono text-emerald-700">
                              Ref: {clm.payoutReference || 'Paid'}
                            </span>
                          )}
                          {clm.status === 'REJECTED' && (
                            <span className="text-[11px] text-rose-600 italic">
                              {clm.rejectionReason || 'Rejected'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 8. Statutory Governance & ML Advisory Decoupling Safeguard */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <Info className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">
            Administrative Governance & Parametric Engine Integrity
          </p>
          <p className="leading-relaxed text-[11px] text-slate-500">
            Module 6 <code className="text-purple-700 font-bold">ClimateRiskRuleEngine</code> remains the sole authoritative parametric trigger engine. Module 8 ML probabilities, SHAP values, and forecasts are advisory only and never directly issue policies, trigger claims, determine payouts, or override policy contract terms.
          </p>
        </div>
      </div>

      {/* Modals & Dialogs */}
      <RiskRuleCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />

      {/* Confirmation Modal: Issue Policy */}
      {issuingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4" data-testid="issue-policy-modal">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Confirm Policy Issuance</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to issue policy <strong className="text-slate-800">{issuingPolicy.policyNumber}</strong>?
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-600">
              <div>Sum Insured: <strong className="text-slate-900">₹{Number(issuingPolicy.sumInsured).toLocaleString('en-IN')}</strong></div>
              <div>Crop: <strong className="text-slate-900">{issuingPolicy.cropName}</strong></div>
              <div>Status Transition: <span className="font-mono text-purple-700 font-bold">PENDING → ACTIVE</span></div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setIssuingPolicy(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmIssuePolicy}
                disabled={isSubmitting}
                data-testid="confirm-issue-policy-btn"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide transition shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? <LoadingSpinner size="sm" /> : <Check className="w-4 h-4" />}
                <span>Confirm & Issue</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Approve Claim */}
      {approvingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4" data-testid="approve-claim-modal">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Approve Parametric Claim</h3>
              <p className="text-xs text-slate-500">
                Confirm approval of claim <strong className="text-slate-800">{approvingClaim.claimNumber}</strong>.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-600">
              <div>Payout Amount: <strong className="text-slate-900">₹{Number(approvingClaim.payoutAmount).toLocaleString('en-IN')}</strong></div>
              <div>Trigger Rule: <span className="font-mono text-purple-700 font-bold">{approvingClaim.triggerRuleCode}</span></div>
              <div>Status Transition: <span className="font-mono text-emerald-700 font-bold">PENDING → APPROVED</span></div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setApprovingClaim(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApproveClaim}
                disabled={isSubmitting}
                data-testid="confirm-approve-claim-btn"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide transition shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? <LoadingSpinner size="sm" /> : <Check className="w-4 h-4" />}
                <span>Approve Claim</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reject Claim */}
      {rejectingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4" data-testid="reject-claim-modal">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Reject Parametric Claim</h3>
              <p className="text-xs text-slate-500">
                Rejecting claim <strong className="text-slate-800">{rejectingClaim.claimNumber}</strong>. An explicit rejection reason is required.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Rejection Reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State the technical, weather, or policy reason for rejecting this claim..."
                rows={3}
                className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                data-testid="reject-reason-input"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setRejectingClaim(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejectClaim}
                disabled={isSubmitting || rejectionReason.trim().length < 3}
                data-testid="confirm-reject-claim-btn"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wide transition shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? <LoadingSpinner size="sm" /> : <X className="w-4 h-4" />}
                <span>Reject Claim</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Settle Claim */}
      {settlingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4" data-testid="settle-claim-modal">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Execute Parametric Settlement</h3>
              <p className="text-xs text-slate-500">
                Execute payout for approved claim <strong className="text-slate-800">{settlingClaim.claimNumber}</strong>.
              </p>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl text-xs space-y-1 text-purple-900">
              <div>Payout Disbursement: <strong className="text-purple-950 font-bold">₹{Number(settlingClaim.payoutAmount).toLocaleString('en-IN')}</strong></div>
              <div>Status Transition: <span className="font-mono text-purple-700 font-bold">APPROVED → PAID</span></div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Simulated Transaction Reference (Optional)</label>
              <input
                type="text"
                value={simulatedTxId}
                onChange={(e) => setSimulatedTxId(e.target.value)}
                placeholder="SIM-PAY-123456"
                className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                data-testid="settle-tx-input"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setSettlingClaim(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSettleClaim}
                disabled={isSubmitting}
                data-testid="confirm-settle-claim-btn"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs uppercase tracking-wide transition shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? <LoadingSpinner size="sm" /> : <Coins className="w-4 h-4" />}
                <span>Execute Settlement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
