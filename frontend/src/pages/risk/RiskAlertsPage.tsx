import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Search,
  Eye,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { farmService } from '../../services/farmService';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { Farm, PortfolioRiskSummaryDTO, RiskAssessmentResponseDTO } from '../../types';
import { PortfolioRiskSummaryCard } from '../../components/risk/PortfolioRiskSummaryCard';
import { RiskRuleCatalogModal } from '../../components/risk/RiskRuleCatalogModal';
import { RiskAssessmentAuditModal } from '../../components/risk/RiskAssessmentAuditModal';
import { FarmRiskBadge, FarmRiskStatus } from '../../components/risk/FarmRiskBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export const RiskAlertsPage: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Risk data mapping
  const [farmRiskMap, setFarmRiskMap] = useState<Record<string, FarmRiskStatus>>({});
  const [farmAssessmentMap, setFarmAssessmentMap] = useState<Record<string, RiskAssessmentResponseDTO>>({});

  // Macro Portfolio summary state
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioRiskSummaryDTO | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  // Modals state
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [auditAssessment, setAuditAssessment] = useState<RiskAssessmentResponseDTO | null>(null);

  // Filter & Search
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'MODERATE' | 'LOW' | 'LOW_UNCONFIRMED' | 'UNASSESSED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch portfolio summary
  const fetchSummary = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      setPortfolioError(null);
      const res = await riskAssessmentService.getPortfolioRiskSummary();
      setPortfolioSummary(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve portfolio risk summary';
      setPortfolioError(msg);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  // Fetch farms and latest assessments
  const fetchFarmsAndRisk = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await farmService.getFarms({ limit: 100 });
      const activeFarms = res.data.farms.filter((f) => f.status === 'ACTIVE');
      setFarms(activeFarms);

      // Fetch latest risk assessments for active farms
      const results = await Promise.allSettled(
        activeFarms.map((farm) => riskAssessmentService.getLatestRiskAssessment(farm.id))
      );

      const statusMap: Record<string, FarmRiskStatus> = {};
      const assessMap: Record<string, RiskAssessmentResponseDTO> = {};

      results.forEach((r, idx) => {
        const farmId = activeFarms[idx].id;
        if (r.status === 'fulfilled') {
          const a = r.value.data;
          assessMap[farmId] = a;
          if (a.overallRisk === 'HIGH') statusMap[farmId] = 'HIGH';
          else if (a.overallRisk === 'MODERATE') statusMap[farmId] = 'MODERATE';
          else if (a.overallRisk === 'LOW') {
            statusMap[farmId] = a.hasInsufficientDataCoverage ? 'LOW_UNCONFIRMED' : 'LOW';
          } else {
            statusMap[farmId] = 'RISK_UNAVAILABLE';
          }
        } else {
          const err = r.reason as any;
          const is404 =
            err?.response?.status === 404 ||
            err?.statusCode === 404 ||
            err?.message?.includes('404') ||
            (err instanceof Error && err.message.toLowerCase().includes('not found'));
          statusMap[farmId] = is404 ? 'NO_ASSESSMENT' : 'RISK_UNAVAILABLE';
        }
      });

      setFarmRiskMap(statusMap);
      setFarmAssessmentMap(assessMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch farms and risk posture';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchFarmsAndRisk();
  }, [fetchSummary, fetchFarmsAndRisk]);

  const refreshAll = () => {
    fetchSummary();
    fetchFarmsAndRisk();
  };

  // Filtered parcels
  const filteredParcels = farms.filter((f) => {
    const risk = farmRiskMap[f.id] || 'LOADING';
    if (riskFilter === 'UNASSESSED' && risk !== 'NO_ASSESSMENT') return false;
    if (riskFilter !== 'ALL' && riskFilter !== 'UNASSESSED' && risk !== riskFilter) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      f.farmName.toLowerCase().includes(term) ||
      f.cropName.toLowerCase().includes(term) ||
      f.farmReferenceNumber.toLowerCase().includes(term) ||
      (f.farmer?.fullName && f.farmer.fullName.toLowerCase().includes(term))
    );
  });

  // Active alerts (parcels at HIGH or MODERATE risk)
  const alertedParcels = farms.filter((f) => {
    const r = farmRiskMap[f.id];
    return r === 'HIGH' || r === 'MODERATE';
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
            Climate Risk & Parameter Alerts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time parametric hazard monitoring and threshold trigger status across cultivated parcels.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setCatalogModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 text-emerald-800 text-xs font-semibold shadow-xs transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
            <span>Parametric Risk Rules</span>
          </button>
          <button
            onClick={refreshAll}
            disabled={loading || portfolioLoading}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
            title="Refresh All"
          >
            <RefreshCw className={`w-4 h-4 ${loading || portfolioLoading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Portfolio Risk Summary Card */}
      <PortfolioRiskSummaryCard
        summary={portfolioSummary}
        loading={portfolioLoading}
        error={portfolioError}
        onRetry={fetchSummary}
        onViewRules={() => setCatalogModalOpen(true)}
      />

      {/* High/Moderate Risk Alert Banner if any */}
      {alertedParcels.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm">
                Attention Required: {alertedParcels.length} parcel(s) flagged with elevated climate risk
              </h3>
              <p className="text-xs text-rose-800 mt-0.5">
                Weather observations have triggered parametric hazard thresholds. Inspect farm audit records below.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRiskFilter('HIGH')}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition self-start sm:self-auto"
          >
            View High Risk Parcels
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Risk Level Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Parcels' },
              { id: 'HIGH', label: 'High Risk' },
              { id: 'MODERATE', label: 'Moderate Risk' },
              { id: 'LOW', label: 'Confirmed Low' },
              { id: 'LOW_UNCONFIRMED', label: 'Incomplete Window' },
              { id: 'UNASSESSED', label: 'Unassessed' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setRiskFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  riskFilter === f.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by farm, crop, or farmer..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>
        </div>

        {/* Parcels List */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3 bg-white rounded-2xl border border-slate-200/80">
            <LoadingSpinner size="lg" />
            <p className="text-xs text-slate-500 font-medium">Evaluating farm risk postures...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-white rounded-2xl border border-rose-200 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-xs text-rose-700">{error}</p>
            <button
              onClick={fetchFarmsAndRisk}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
            >
              Retry Loading
            </button>
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 space-y-3">
            <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="font-semibold text-slate-700 text-sm">No parcels match the selected criteria</h4>
            <p className="text-xs text-slate-400">Try selecting a different filter or search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredParcels.map((farm) => {
              const status = farmRiskMap[farm.id] || 'LOADING';
              const assessment = farmAssessmentMap[farm.id];
              return (
                <div
                  key={farm.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{farm.farmName}</h3>
                        <p className="text-[11px] font-mono text-slate-400">{farm.farmReferenceNumber}</p>
                      </div>
                      <FarmRiskBadge status={status} />
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Crop:</span>
                        <span className="font-semibold text-slate-800">{farm.cropName} {farm.cropVariety ? `(${farm.cropVariety})` : ''}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Area:</span>
                        <span className="font-medium text-slate-700">{farm.farmArea} {farm.farmAreaUnit}</span>
                      </div>
                      {farm.farmer?.fullName && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Producer:</span>
                          <span className="font-medium text-slate-700">{farm.farmer.fullName}</span>
                        </div>
                      )}
                    </div>

                    {/* Latest Trigger Note if available */}
                    {assessment && (
                      <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Evaluated:</span>
                          <span>{new Date(assessment.assessedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Triggered Rules:</span>
                          <span className={assessment.triggeredRuleCount > 0 ? 'font-bold text-rose-600' : 'text-slate-600'}>
                            {assessment.triggeredRuleCount} of {assessment.ruleCount}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {assessment ? (
                      <button
                        onClick={() => setAuditAssessment(assessment)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Audit Details</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">No assessment</span>
                    )}

                    <Link
                      to={`/farms/${farm.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
                    >
                      <span>Farm View</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Catalog Modal */}
      <RiskRuleCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />

      {/* Provenance Audit Modal */}
      {auditAssessment && (
        <RiskAssessmentAuditModal
          isOpen={true}
          onClose={() => setAuditAssessment(null)}
          assessment={auditAssessment}
        />
      )}
    </div>
  );
};
