/**
 * Module 10: End-to-End System Integration & Audit
 * Stage 10.1A: Unified Policy Portfolio Page
 *
 * Farmer-facing portfolio experience for parametric insurance policies:
 * - Aggregates policies across all farm parcels owned by the authenticated producer.
 * - Displays active coverage metrics, policy statuses, crop types, and remaining balances.
 * - Handles unauthenticated, loading, empty, and error states gracefully.
 * - Prevents cross-farmer data exposure by strictly scoping queries to verified producer farms.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  RefreshCw,
  Lock,
  AlertCircle,
  Calendar,
  Sprout,
  Search,
  Filter,
  ArrowRight,
  Coins,
  Copy,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProducerAuthModal } from '../../components/auth/ProducerAuthModal';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { PolicyStatusBadge } from '../../components/policy/PolicyStatusBadge';
import { PolicyWithFarm } from '../../types';
import {
  policyClaimService,
  parsePolicyClaimErrorMessage,
  ParsedPolicyClaimError,
} from '../../services/policyClaimService';

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

function formatCurrency(amountStr: string | number | undefined): string {
  if (amountStr === undefined || amountStr === null) return '—';
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return `₹${amountStr}`;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoStr: string | undefined): string {
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

export interface PolicyPortfolioPageProps {
  initialPolicies?: PolicyWithFarm[];
  initialLoading?: boolean;
  initialError?: ParsedPolicyClaimError | null;
}

export const PolicyPortfolioPage: React.FC<PolicyPortfolioPageProps> = ({
  initialPolicies,
  initialLoading,
  initialError,
}) => {
  const { isAuthenticated, activeProducer, producerToken } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [policies, setPolicies] = useState<PolicyWithFarm[]>(initialPolicies || []);
  const [loading, setLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : initialPolicies ? false : true
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<ParsedPolicyClaimError | null>(initialError || null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPolicies = useCallback(
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

        const res = await policyClaimService.getFarmerPolicies(activeProducer.id, {
          token: producerToken || undefined,
        });
        setPolicies(res.data || []);
      } catch (err: unknown) {
        const parsed = parsePolicyClaimErrorMessage(err, 'Failed to load policy portfolio.');
        setError(parsed);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, activeProducer, producerToken]
  );

  useEffect(() => {
    if (initialPolicies === undefined) {
      fetchPolicies();
    }
  }, [fetchPolicies, initialPolicies]);

  const handleCopy = async (policyNumber: string, id: string) => {
    try {
      await navigator.clipboard.writeText(policyNumber);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const total = policies.length;
    const activeList = policies.filter((p) => p.status === 'ACTIVE');
    const activeCount = activeList.length;

    let totalSumInsured = 0;
    let totalRemaining = 0;
    let totalPaid = 0;

    activeList.forEach((p) => {
      const sum = parseFloat(p.sumInsured);
      const rem = parseFloat(p.remainingCoverage);
      const paid = parseFloat(p.cumulativePaidAmount);
      if (!isNaN(sum)) totalSumInsured += sum;
      if (!isNaN(rem)) totalRemaining += rem;
      if (!isNaN(paid)) totalPaid += paid;
    });

    return {
      total,
      activeCount,
      totalSumInsured,
      totalRemaining,
      totalPaid,
    };
  }, [policies]);

  // Filtered and searched list
  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesNum = p.policyNumber.toLowerCase().includes(term);
        const matchesCrop = p.cropName.toLowerCase().includes(term);
        const matchesFarm = p.farm?.farmName.toLowerCase().includes(term);
        const matchesRef = p.farm?.farmReferenceNumber.toLowerCase().includes(term);
        return Boolean(matchesNum || matchesCrop || matchesFarm || matchesRef);
      }
      return true;
    });
  }, [policies, statusFilter, searchTerm]);

  return (
    <div data-testid="policy-portfolio-page" className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-2">
            <Shield className="w-3.5 h-3.5" />
            Module 9 &bull; Parametric Insurance Portfolio
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Parametric Policies Portfolio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Active and historical index-based crop risk protection policies covering your registered farm parcels.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isAuthenticated && (
            <button
              onClick={() => fetchPolicies(true)}
              disabled={refreshing || loading}
              data-testid="refresh-policies-btn"
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

      {/* Unauthenticated Access Banner */}
      {!isAuthenticated && (
        <div
          data-testid="policy-portfolio-auth-alert"
          className="p-8 rounded-3xl bg-amber-50/80 border border-amber-200 text-center space-y-4 max-w-2xl mx-auto shadow-xs"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100/90 text-amber-800 flex items-center justify-center shadow-xs">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-amber-950">Producer Authentication Required</h3>
            <p className="text-xs text-amber-900/90 max-w-md mx-auto leading-relaxed">
              Parametric insurance policies and coverage allocations are protected records. Please authenticate with your registered mobile number to view and manage your farm policies.
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
                Data strictly scoped to farmer ID:{' '}
                <span className="font-mono text-slate-700">{activeProducer.id.slice(0, 8)}...</span>
              </div>
            </div>
          )}

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Policies</span>
                <Shield className="w-4 h-4 text-slate-400" />
              </div>
              <div data-testid="metric-total-policies" className="text-2xl font-extrabold text-slate-900">
                {metrics.total}
              </div>
              <div className="text-[11px] text-slate-500">Across all registered holdings</div>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-emerald-800 text-xs font-medium">
                <span>Active Policies</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div data-testid="metric-active-policies" className="text-2xl font-extrabold text-emerald-950">
                {metrics.activeCount}
              </div>
              <div className="text-[11px] text-emerald-700">Currently active risk contracts</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Active Coverage</span>
                <Coins className="w-4 h-4 text-emerald-600" />
              </div>
              <div data-testid="metric-total-coverage" className="text-2xl font-extrabold text-slate-900">
                {formatCurrency(metrics.totalSumInsured)}
              </div>
              <div className="text-[11px] text-slate-500">Aggregate sum insured limit</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Remaining Protection</span>
                <Shield className="w-4 h-4 text-blue-600" />
              </div>
              <div data-testid="metric-remaining-coverage" className="text-2xl font-extrabold text-blue-900">
                {formatCurrency(metrics.totalRemaining)}
              </div>
              <div className="text-[11px] text-slate-500">Unsettled active claim capacity</div>
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
                placeholder="Search policies by number, crop, or farm..."
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
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="PENDING">Pending Only</option>
                <option value="EXHAUSTED">Exhausted Only</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div data-testid="policy-portfolio-loading" className="py-16 text-center space-y-3">
              <LoadingSpinner size="lg" className="mx-auto text-emerald-600" />
              <p className="text-xs text-slate-500 font-medium">Loading your policy portfolio across farms...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div
              data-testid="policy-portfolio-error"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-3 shadow-xs"
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span>Unable to Load Policies</span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">{error.message}</p>
              <button
                onClick={() => fetchPolicies()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-rose-300 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredPolicies.length === 0 && (
            <div
              data-testid="policy-portfolio-empty"
              className="py-16 px-6 rounded-3xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-3"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Shield className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800">
                  {policies.length === 0 ? 'No Parametric Policies Found' : 'No Matching Policies'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {policies.length === 0
                    ? 'No parametric insurance contracts have been issued for your farm parcels yet. Policies are generated upon verified underwriting against mapped parcels.'
                    : 'No policies match the active filter criteria. Try adjusting your search or status selection.'}
                </p>
              </div>
              {policies.length === 0 && (
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

          {/* Populated Policy Cards Grid */}
          {!loading && !error && filteredPolicies.length > 0 && (
            <div data-testid="policy-portfolio-grid" className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredPolicies.map((policy) => {
                const isCopied = copiedId === policy.id;
                return (
                  <div
                    key={policy.id}
                    data-testid={`policy-card-${policy.id}`}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-sm transition-shadow p-5 sm:p-6 space-y-5 flex flex-col justify-between"
                  >
                    {/* Top Row: Policy Number & Status */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900">
                              {policy.policyNumber}
                            </span>
                            <button
                              onClick={() => handleCopy(policy.policyNumber, policy.id)}
                              className="text-slate-400 hover:text-slate-600 transition p-1 rounded-md"
                              title="Copy Policy Number"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {policy.farm && (
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <Sprout className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <Link
                                to={`/farms/${policy.farmId}`}
                                className="font-medium text-slate-700 hover:text-emerald-700 transition"
                              >
                                {policy.farm.farmName} ({policy.farm.farmReferenceNumber})
                              </Link>
                            </div>
                          )}
                        </div>

                        <PolicyStatusBadge status={policy.status} />
                      </div>

                      <div className="pt-1 text-xs text-slate-600 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">Crop Protected:</span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-medium text-[11px] border border-emerald-100">
                          {policy.cropName}
                        </span>
                      </div>
                    </div>

                    {/* Financial Metrics Sub-Grid */}
                    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
                      <div>
                        <div className="text-[11px] text-slate-500">Sum Insured Limit</div>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {formatCurrency(policy.sumInsured)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-500">Remaining Coverage</div>
                        <div className="font-bold text-emerald-700 mt-0.5">
                          {formatCurrency(policy.remainingCoverage)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-500">Paid Claims</div>
                        <div className="font-medium text-slate-700 mt-0.5">
                          {formatCurrency(policy.cumulativePaidAmount)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-500">Annual Premium</div>
                        <div className="font-medium text-slate-700 mt-0.5">
                          {formatCurrency(policy.premiumAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Covered Hazards Tags */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Covered Weather Hazards ({policy.coveredHazards.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {policy.coveredHazards.map((hazard) => (
                          <span
                            key={hazard}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium"
                          >
                            {HAZARD_LABELS[hazard] || hazard}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Row: Coverage Dates & Farm Link */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {formatDate(policy.startDate)} &ndash; {formatDate(policy.endDate)}
                        </span>
                      </div>

                      <Link
                        to={`/farms/${policy.farmId}`}
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold text-xs"
                      >
                        <span>Farm Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Producer Auth Modal */}
      <ProducerAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => {
          setAuthModalOpen(false);
          fetchPolicies();
        }}
      />
    </div>
  );
};
