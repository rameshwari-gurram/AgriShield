import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Sprout,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  Calendar,
  MapPin,
  Maximize2,
  AlertCircle,
  User,
  Filter,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { farmService } from '../../services/farmService';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { FarmRiskBadge, FarmRiskStatus } from '../../components/risk/FarmRiskBadge';
import { PortfolioRiskSummaryCard } from '../../components/risk/PortfolioRiskSummaryCard';
import { RiskRuleCatalogModal } from '../../components/risk/RiskRuleCatalogModal';
import { Farm, FarmStatus, FARM_STATUSES, PortfolioRiskSummaryDTO } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export const FarmListPage: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [farmRiskMap, setFarmRiskMap] = useState<Record<string, FarmRiskStatus>>({});
  const [riskFilter, setRiskFilter] = useState<'ALL' | FarmRiskStatus>('ALL');

  // Stage 6: Portfolio macro summary state & rule catalog modal state
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioRiskSummaryDTO | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isRuleCatalogOpen, setIsRuleCatalogOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FarmStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchFarms = useCallback(
    async (searchQuery: string, status: FarmStatus | 'ALL', pageNum: number) => {
      try {
        setLoading(true);
        setError(null);
        const res = await farmService.getFarms({
          page: pageNum,
          limit: 10,
          search: searchQuery.trim() || undefined,
          status: status === 'ALL' ? undefined : status,
        });

        setFarms(res.data.farms);
        setTotalPages(res.data.pagination.totalPages);
        setTotalCount(res.data.pagination.total);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch farms';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchFarms(search, statusFilter, page);
  }, [fetchFarms, statusFilter, page]);

  // Stage 6: Fetch portfolio-level macro risk summary
  const fetchPortfolioSummary = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      setPortfolioError(null);
      const res = await riskAssessmentService.getPortfolioRiskSummary();
      setPortfolioSummary(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch portfolio risk summary';
      setPortfolioError(msg);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolioSummary();
  }, [fetchPortfolioSummary]);

  // Fetch latest climate risk assessments for currently displayed farms
  useEffect(() => {
    if (farms.length === 0) {
      setFarmRiskMap({});
      return;
    }

    let isMounted = true;

    setFarmRiskMap((prev) => {
      const initial: Record<string, FarmRiskStatus> = { ...prev };
      for (const farm of farms) {
        if (!initial[farm.id]) {
          initial[farm.id] = 'LOADING';
        }
      }
      return initial;
    });

    const fetchRiskForDisplayedFarms = async () => {
      const results = await Promise.allSettled(
        farms.map((farm) => riskAssessmentService.getLatestRiskAssessment(farm.id))
      );

      if (!isMounted) return;

      const updatedMap: Record<string, FarmRiskStatus> = {};
      results.forEach((res, index) => {
        const farmId = farms[index].id;
        if (res.status === 'fulfilled') {
          const assessment = res.value.data;
          if (assessment.overallRisk === 'HIGH') {
            updatedMap[farmId] = 'HIGH';
          } else if (assessment.overallRisk === 'MODERATE') {
            updatedMap[farmId] = 'MODERATE';
          } else if (assessment.overallRisk === 'LOW') {
            updatedMap[farmId] = assessment.hasInsufficientDataCoverage
              ? 'LOW_UNCONFIRMED'
              : 'LOW';
          } else {
            updatedMap[farmId] = 'RISK_UNAVAILABLE';
          }
        } else {
          const err = res.reason as any;
          const is404 =
            err?.response?.status === 404 ||
            err?.statusCode === 404 ||
            err?.message?.includes('404') ||
            (err instanceof Error && err.message.toLowerCase().includes('not found'));

          if (is404) {
            updatedMap[farmId] = 'NO_ASSESSMENT';
          } else {
            updatedMap[farmId] = 'RISK_UNAVAILABLE';
          }
        }
      });

      setFarmRiskMap(updatedMap);
    };

    fetchRiskForDisplayedFarms();

    return () => {
      isMounted = false;
    };
  }, [farms]);

  const displayedFarms = farms.filter((farm) => {
    if (riskFilter === 'ALL') return true;
    const status = farmRiskMap[farm.id] || 'LOADING';
    return status === riskFilter;
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchFarms(search, statusFilter, 1);
  };

  const getStatusBadge = (status: FarmStatus) => {
    const s = FARM_STATUSES.find((item) => item.code === status);
    return s ? (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.badgeColor}`}>
        {s.label}
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sprout className="w-6 h-6 text-emerald-600" />
            Farm Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Agricultural land parcels, crop seasons, and cultivation metrics ({totalCount} total)
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsRuleCatalogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm shadow-sm transition"
            data-testid="view-parametric-rules-btn"
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">View Parametric Rules</span>
            <span className="sm:hidden">Rules</span>
          </button>
          <button
            onClick={() => fetchFarms(search, statusFilter, page)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <Link
            to="/farms/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-900/20 transition hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            Register Farm
          </Link>
        </div>
      </div>

      {/* Stage 6: Portfolio Risk Macro KPI Overview */}
      <PortfolioRiskSummaryCard
        summary={portfolioSummary}
        loading={portfolioLoading}
        error={portfolioError}
        onRetry={fetchPortfolioSummary}
        onViewRules={() => setIsRuleCatalogOpen(true)}
      />

      {/* Search & Status Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-grow flex gap-3">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by farm name, crop, village, or reference number..."
              className="block w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm transition"
          >
            Search
          </button>
        </form>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl flex-shrink-0 self-start">
          <div className="px-2 text-xs text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Status:</span>
          </div>
          {(['ALL', 'ACTIVE', 'HARVESTED', 'INACTIVE'] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'All' : st}
            </button>
          ))}
        </div>

        {/* Risk Filter Tabs */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl flex-shrink-0 self-start flex-wrap">
          <div className="px-2 text-xs text-slate-400 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Risk:</span>
          </div>
          {(
            [
              { code: 'ALL', label: 'All' },
              { code: 'HIGH', label: 'High' },
              { code: 'MODERATE', label: 'Moderate' },
              { code: 'LOW', label: 'Low' },
              { code: 'LOW_UNCONFIRMED', label: 'Unconfirmed' },
              { code: 'NO_ASSESSMENT', label: 'Unassessed' },
            ] as const
          ).map((rf) => (
            <button
              key={rf.code}
              onClick={() => setRiskFilter(rf.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                riskFilter === rf.code
                  ? 'bg-white text-emerald-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {rf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading State */}
      {loading && farms.length === 0 && (
        <div className="min-h-[300px] flex flex-col items-center justify-center space-y-3">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-slate-500">Loading farm directory...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && farms.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <Sprout className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">No Farms Found</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
              {search || statusFilter !== 'ALL'
                ? 'No farm plots match the selected search or filter criteria. Try clearing filters.'
                : 'No agricultural parcels registered yet. Link your first farm to a registered farmer.'}
            </p>
          </div>
          <div className="pt-2">
            {search || statusFilter !== 'ALL' ? (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                  fetchFarms('', 'ALL', 1);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition"
              >
                Clear Filters
              </button>
            ) : (
              <Link
                to="/farms/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition"
              >
                <Plus className="w-4 h-4" />
                Register First Farm
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Risk Filter Empty State */}
      {!loading && farms.length > 0 && displayedFarms.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-sm">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="font-bold text-base text-slate-900">No Farms Match Risk Filter</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            No farms on the current page match the selected climate risk filter.
          </p>
          <button
            onClick={() => setRiskFilter('ALL')}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Clear Risk Filter
          </button>
        </div>
      )}

      {/* Farms List */}
      {displayedFarms.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {displayedFarms.map((farm) => (
            <div
              key={farm.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:border-emerald-200 hover:shadow-md transition space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-900">{farm.farmName}</h3>
                  {getStatusBadge(farm.status)}
                  <FarmRiskBadge status={farmRiskMap[farm.id] || 'LOADING'} />
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {farm.farmReferenceNumber}
                  </span>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <Link
                    to={`/farms/${farm.id}`}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition"
                  >
                    <span>View Parcel</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Farm Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                {/* Crop */}
                <div className="space-y-0.5">
                  <div className="text-slate-400 font-medium flex items-center gap-1">
                    <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Crop / Variety</span>
                  </div>
                  <div className="font-semibold text-slate-800 text-sm">
                    {farm.cropName} {farm.cropVariety ? `(${farm.cropVariety})` : ''}
                  </div>
                </div>

                {/* Cultivated Area */}
                <div className="space-y-0.5">
                  <div className="text-slate-400 font-medium flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Acreage / Area</span>
                  </div>
                  <div className="font-semibold text-slate-800 text-sm font-mono">
                    {farm.farmArea.toFixed(2)} {farm.farmAreaUnit}
                  </div>
                </div>

                {/* Locality */}
                <div className="space-y-0.5">
                  <div className="text-slate-400 font-medium flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Location</span>
                  </div>
                  <div className="font-semibold text-slate-800 text-sm truncate">
                    {farm.village}, {farm.district}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {farm.state} - {farm.pincode}
                  </div>
                </div>

                {/* Farmer Association */}
                <div className="space-y-0.5">
                  <div className="text-slate-400 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Registered Producer</span>
                  </div>
                  {farm.farmer ? (
                    <Link
                      to={`/farmers/${farm.farmer.id}`}
                      className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline text-sm block truncate"
                    >
                      {farm.farmer.fullName}
                    </Link>
                  ) : (
                    <Link
                      to={`/farmers/${farm.farmerId}`}
                      className="font-mono text-slate-600 hover:underline text-xs block truncate"
                    >
                      {farm.farmerId.slice(0, 8)}...
                    </Link>
                  )}
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Sown: {farm.sowingDate}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            Showing Page <span className="font-bold text-slate-800">{page}</span> of{' '}
            <span className="font-bold text-slate-800">{totalPages}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Stage 6: Active Parametric Risk Rules Catalog Modal */}
      <RiskRuleCatalogModal
        isOpen={isRuleCatalogOpen}
        onClose={() => setIsRuleCatalogOpen(false)}
      />
    </div>
  );
};
