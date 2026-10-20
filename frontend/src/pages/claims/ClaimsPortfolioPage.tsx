/**
 * Module 10: End-to-End System Integration & Audit
 * Stage 10.1B: Unified Claims Portfolio Page
 *
 * Farmer-facing portfolio experience for parametric claims:
 * - Aggregates claims across all farm parcels owned by the authenticated producer.
 * - Displays authoritative IMD trigger rule codes, observed vs threshold values, payout amounts, and status.
 * - Features an explicit Statutory/Advisory Separation Banner clarifying that Module 8 ML predictions do not determine claims.
 * - Provides technical provenance inspection via ClaimAuditModal.
 * - Strictly omits any farmer-facing approve, reject, or settlement controls.
 * - Never invokes financial settlement automatically from a page load or render.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt,
  RefreshCw,
  Lock,
  AlertCircle,
  Sprout,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  FileText,
  Info,
  Coins,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProducerAuthModal } from '../../components/auth/ProducerAuthModal';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ClaimStatusBadge } from '../../components/policy/ClaimStatusBadge';
import { ClaimAuditModal } from '../../components/policy/ClaimAuditModal';
import { ClaimWithFarm, RiskSeverity } from '../../types';
import {
  policyClaimService,
  parsePolicyClaimErrorMessage,
  ParsedPolicyClaimError,
} from '../../services/policyClaimService';

function formatCurrency(amountStr: string | number | undefined): string {
  if (amountStr === undefined || amountStr === null) return '—';
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return `₹${amountStr}`;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoStr: string | null | undefined): string {
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

export interface ClaimsPortfolioPageProps {
  initialClaims?: ClaimWithFarm[];
  initialLoading?: boolean;
  initialError?: ParsedPolicyClaimError | null;
}

export const ClaimsPortfolioPage: React.FC<ClaimsPortfolioPageProps> = ({
  initialClaims,
  initialLoading,
  initialError,
}) => {
  const { isAuthenticated, activeProducer, producerToken } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [claims, setClaims] = useState<ClaimWithFarm[]>(initialClaims || []);
  const [loading, setLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : initialClaims ? false : true
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<ParsedPolicyClaimError | null>(initialError || null);

  // Modal State
  const [selectedClaimForAudit, setSelectedClaimForAudit] = useState<ClaimWithFarm | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchClaims = useCallback(
    async (isRefresh: boolean = false) => {
      if (!isAuthenticated || !activeProducer) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const res = await policyClaimService.getFarmerClaims(activeProducer.id, {
          token: producerToken || undefined,
        });
        setClaims(res.data || []);
      } catch (err: unknown) {
        const parsed = parsePolicyClaimErrorMessage(err, 'Failed to load claims portfolio.');
        setError(parsed);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, activeProducer, producerToken]
  );

  useEffect(() => {
    if (initialClaims === undefined) {
      fetchClaims();
    }
  }, [fetchClaims, initialClaims]);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = claims.length;
    const pendingCount = claims.filter((c) => c.status === 'PENDING').length;
    const approvedCount = claims.filter((c) => c.status === 'APPROVED').length;
    const paidList = claims.filter((c) => c.status === 'PAID');
    const paidCount = paidList.length;
    const rejectedCount = claims.filter((c) => c.status === 'REJECTED').length;

    let totalDisbursed = 0;
    paidList.forEach((c) => {
      const val = parseFloat(c.payoutAmount);
      if (!isNaN(val)) totalDisbursed += val;
    });

    return {
      total,
      pendingCount,
      approvedCount,
      paidCount,
      rejectedCount,
      totalDisbursed,
    };
  }, [claims]);

  // Filtered claims list
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesNum = c.claimNumber.toLowerCase().includes(term);
        const matchesRule = c.triggerRuleCode.toLowerCase().includes(term);
        const matchesFarm = c.farm?.farmName.toLowerCase().includes(term);
        const matchesRef = c.payoutReference?.toLowerCase().includes(term);
        return Boolean(matchesNum || matchesRule || matchesFarm || matchesRef);
      }
      return true;
    });
  }, [claims, statusFilter, searchTerm]);

  return (
    <div data-testid="claims-portfolio-page" className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-2">
            <Receipt className="w-3.5 h-3.5" />
            Module 9 &bull; Automated Settlement
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Parametric Claims Portfolio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Historical and evaluated parametric indemnity claims triggered by authoritative IMD meteorological rules.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isAuthenticated && (
            <button
              onClick={() => fetchClaims(true)}
              disabled={refreshing || loading}
              data-testid="refresh-claims-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`}
              />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}

          {!isAuthenticated && (
            <button
              onClick={() => setAuthModalOpen(true)}
              data-testid="login-producer-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Verify Mobile OTP</span>
            </button>
          )}
        </div>
      </div>

      {/* Advisory & Statutory Separation Notice Banner */}
      <div
        data-testid="advisory-separation-notice"
        className="p-5 rounded-2xl bg-sky-50/80 border border-sky-200 text-xs text-sky-950 space-y-2 shadow-xs"
      >
        <div className="flex items-center gap-2 font-bold text-sm text-sky-900">
          <Info className="w-4 h-4 text-sky-700 flex-shrink-0" />
          <span>Statutory Insurance Separation Notice</span>
        </div>
        <p className="leading-relaxed text-sky-900/90 text-[11px]">
          Vegetation health predictions (NDVI) and crop stress probability scores from Module 8 are strictly
          experimental advisory indicators designed for agronomic decision support. Parametric claim eligibility,
          trigger thresholds, and indemnity disbursements are determined{' '}
          <strong className="font-semibold text-sky-950">
            exclusively by authoritative meteorological rule evaluations (Module 6)
          </strong>{' '}
          and active policy terms. Machine learning forecasts never determine claim settlement.
        </p>
      </div>

      {/* Unauthenticated Access Banner */}
      {!isAuthenticated && (
        <div
          data-testid="claims-portfolio-auth-alert"
          className="p-8 rounded-3xl bg-amber-50/80 border border-amber-200 text-center space-y-4 max-w-2xl mx-auto shadow-xs"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100/90 text-amber-800 flex items-center justify-center shadow-xs">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-amber-950">Producer Authentication Required</h3>
            <p className="text-xs text-amber-900/90 max-w-md mx-auto leading-relaxed">
              Parametric claim records, indemnity amounts, and simulated disbursement references are confidential financial data. Please authenticate with your registered mobile number to access your claim history.
            </p>
          </div>
          <div>
            <button
              onClick={() => setAuthModalOpen(true)}
              data-testid="auth-alert-modal-trigger"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Lock className="w-4 h-4" />
              <span>Authenticate with Mobile OTP</span>
            </button>
          </div>
        </div>
      )}

      {/* Authenticated Producer Session & Metrics */}
      {isAuthenticated && (
        <>
          {/* Active Producer Bar */}
          {activeProducer && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>
                  Authenticated Producer:{' '}
                  <span className="font-semibold text-slate-900">{activeProducer.fullName}</span>{' '}
                  <span className="text-slate-400 font-mono">({activeProducer.mobileNumber})</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Claim history strictly scoped to verified farmer parcels
              </div>
            </div>
          )}

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Claims</span>
                <Receipt className="w-4 h-4 text-slate-400" />
              </div>
              <div data-testid="metric-total-claims" className="text-xl font-extrabold text-slate-900">
                {metrics.total}
              </div>
              <div className="text-[10px] text-slate-400">All evaluated events</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Pending Review</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div data-testid="metric-pending-claims" className="text-xl font-extrabold text-amber-700">
                {metrics.pendingCount}
              </div>
              <div className="text-[10px] text-slate-400">Awaiting approval</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Approved</span>
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              </div>
              <div data-testid="metric-approved-claims" className="text-xl font-extrabold text-blue-700">
                {metrics.approvedCount}
              </div>
              <div className="text-[10px] text-slate-400">Ready for settlement</div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-emerald-800 text-xs font-medium">
                <span>Settled & Paid</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div data-testid="metric-paid-claims" className="text-xl font-extrabold text-emerald-950">
                {metrics.paidCount}
              </div>
              <div className="text-[10px] text-emerald-700">Disbursed with SIM ref</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Disbursed</span>
                <Coins className="w-4 h-4 text-emerald-600" />
              </div>
              <div data-testid="metric-total-disbursed" className="text-xl font-extrabold text-slate-900">
                {formatCurrency(metrics.totalDisbursed)}
              </div>
              <div className="text-[10px] text-slate-400">Simulated indemnity</div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search claims by number, trigger rule, or farm..."
                className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-500 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">All Claims</option>
                <option value="PAID">Settled & Paid</option>
                <option value="APPROVED">Approved Only</option>
                <option value="PENDING">Pending Review</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div data-testid="claims-portfolio-loading" className="py-16 text-center space-y-3">
              <LoadingSpinner size="lg" className="mx-auto text-emerald-600" />
              <p className="text-xs text-slate-500 font-medium">Loading claims portfolio across farms...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div
              data-testid="claims-portfolio-error"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-3 shadow-xs"
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span>Unable to Load Claims</span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">{error.message}</p>
              <button
                onClick={() => fetchClaims()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-rose-300 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredClaims.length === 0 && (
            <div
              data-testid="claims-portfolio-empty"
              className="py-16 px-6 rounded-3xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-3"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800">
                  {claims.length === 0 ? 'No Parametric Claims Recorded' : 'No Matching Claims'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {claims.length === 0
                    ? 'No meteorological trigger thresholds have been breached across your farms. Parametric claims evaluate automatically when authoritative weather rules detect extreme events.'
                    : 'No claims match the active search and filter parameters.'}
                </p>
              </div>
              {claims.length === 0 && (
                <div className="pt-2">
                  <Link
                    to="/farms"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
                  >
                    <Sprout className="w-3.5 h-3.5" />
                    <span>View Registered Farms</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Claims Table */}
          {!loading && !error && filteredClaims.length > 0 && (
            <div
              data-testid="claims-portfolio-table"
              className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Claim Number</th>
                      <th className="py-3 px-4">Farm Parcel</th>
                      <th className="py-3 px-4">Trigger Rule</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">Observed / Threshold</th>
                      <th className="py-3 px-4">Payout Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Settlement Reference</th>
                      <th className="py-3 px-4 text-right">Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredClaims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <div>{claim.claimNumber}</div>
                          <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5">
                            {formatDate(claim.createdAt)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {claim.farm ? (
                            <Link
                              to={`/farms/${claim.farm.id}`}
                              className="font-medium text-emerald-700 hover:text-emerald-800 transition"
                            >
                              {claim.farm.farmName}
                            </Link>
                          ) : (
                            <span className="text-slate-400">Parcel #{claim.policyId.slice(0, 8)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {claim.triggerRuleCode}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getSeverityBadgeClass(
                              claim.severity
                            )}`}
                          >
                            {claim.severity.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <span className="font-semibold text-slate-900">
                            {claim.observedValue !== null ? claim.observedValue : 'N/A'}
                          </span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-slate-500">{claim.thresholdValue}</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono text-xs">
                          {formatCurrency(claim.payoutAmount)}
                        </td>
                        <td className="py-3 px-4">
                          <ClaimStatusBadge status={claim.status} />
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {claim.status === 'PAID' && claim.payoutReference && (
                            <span className="text-emerald-700 font-semibold">{claim.payoutReference}</span>
                          )}
                          {claim.status === 'REJECTED' && claim.rejectionReason && (
                            <span className="text-rose-600 italic truncate max-w-xs block" title={claim.rejectionReason}>
                              {claim.rejectionReason}
                            </span>
                          )}
                          {claim.status === 'PENDING' && <span className="text-slate-400">Awaiting Approval</span>}
                          {claim.status === 'APPROVED' && <span className="text-blue-600">Approved for Settlement</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedClaimForAudit(claim);
                              setAuditModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium text-[11px] shadow-2xs transition"
                          >
                            <FileText className="w-3 h-3 text-slate-400" />
                            <span>Audit</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Claim Audit & Technical Provenance Modal */}
      <ClaimAuditModal
        claim={selectedClaimForAudit}
        policy={selectedClaimForAudit?.policy || null}
        isOpen={auditModalOpen}
        onClose={() => {
          setAuditModalOpen(false);
          setSelectedClaimForAudit(null);
        }}
      />

      {/* Producer Auth Modal */}
      <ProducerAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => {
          setAuthModalOpen(false);
          fetchClaims();
        }}
      />
    </div>
  );
};
