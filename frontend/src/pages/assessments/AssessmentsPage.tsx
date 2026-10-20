import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Eye,
  BookOpen,
  ArrowRight,
  Sprout,
  Play,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { farmService } from '../../services/farmService';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { Farm, RiskAssessmentResponseDTO } from '../../types';
import { FarmRiskBadge, FarmRiskStatus } from '../../components/risk/FarmRiskBadge';
import { RiskAssessmentAuditModal } from '../../components/risk/RiskAssessmentAuditModal';
import { RiskRuleCatalogModal } from '../../components/risk/RiskRuleCatalogModal';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export const AssessmentsPage: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Risk evaluations state
  const [farmRiskMap, setFarmRiskMap] = useState<Record<string, FarmRiskStatus>>({});
  const [farmAssessmentMap, setFarmAssessmentMap] = useState<Record<string, RiskAssessmentResponseDTO>>({});
  const [assessingFarmId, setAssessingFarmId] = useState<string | null>(null);
  const [assessmentNotice, setAssessmentNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modals state
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [auditAssessment, setAuditAssessment] = useState<RiskAssessmentResponseDTO | null>(null);

  // Filter & Search
  const [filterRisk, setFilterRisk] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch farms and latest assessments
  const fetchAssessments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await farmService.getFarms({ limit: 100 });
      const activeFarms = res.data.farms.filter((f) => f.status === 'ACTIVE');
      setFarms(activeFarms);

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
      const msg = err instanceof Error ? err.message : 'Failed to retrieve risk assessments';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  // Run on-demand assessment for a farm
  const handleRunAssessment = async (farmId: string, farmName: string) => {
    try {
      setAssessingFarmId(farmId);
      setAssessmentNotice(null);
      const res = await riskAssessmentService.createRiskAssessment(farmId);
      const newAssessment = res.data;

      // Update maps
      setFarmAssessmentMap((prev) => ({ ...prev, [farmId]: newAssessment }));
      setFarmRiskMap((prev) => {
        let status: FarmRiskStatus = 'RISK_UNAVAILABLE';
        if (newAssessment.overallRisk === 'HIGH') status = 'HIGH';
        else if (newAssessment.overallRisk === 'MODERATE') status = 'MODERATE';
        else if (newAssessment.overallRisk === 'LOW') {
          status = newAssessment.hasInsufficientDataCoverage ? 'LOW_UNCONFIRMED' : 'LOW';
        }
        return { ...prev, [farmId]: status };
      });

      setAssessmentNotice({
        type: 'success',
        message: `Evaluation completed for ${farmName}: Overall risk is ${newAssessment.overallRisk} (${newAssessment.triggeredRuleCount} rules triggered).`,
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      const msg = anyErr?.response?.data?.message || anyErr?.message || 'Failed to execute risk assessment';
      setAssessmentNotice({
        type: 'error',
        message: `Evaluation failed for ${farmName}: ${msg}`,
      });
    } finally {
      setAssessingFarmId(null);
    }
  };

  // Filtered farms
  const filteredFarms = farms.filter((f) => {
    const risk = farmRiskMap[f.id] || 'RISK_UNAVAILABLE';
    const matchesFilter =
      filterRisk === 'ALL' ||
      (filterRisk === 'HIGH' && risk === 'HIGH') ||
      (filterRisk === 'MODERATE' && risk === 'MODERATE') ||
      (filterRisk === 'LOW' && (risk === 'LOW' || risk === 'LOW_UNCONFIRMED')) ||
      (filterRisk === 'UNASSESSED' && (risk === 'NO_ASSESSMENT' || risk === 'RISK_UNAVAILABLE'));

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      f.farmName.toLowerCase().includes(searchLower) ||
      f.cropName.toLowerCase().includes(searchLower) ||
      f.village.toLowerCase().includes(searchLower) ||
      f.district.toLowerCase().includes(searchLower) ||
      f.farmReferenceNumber.toLowerCase().includes(searchLower);

    return matchesFilter && matchesSearch;
  });

  // KPI Calculations
  const totalCount = farms.length;
  const highCount = Object.values(farmRiskMap).filter((r) => r === 'HIGH').length;
  const moderateCount = Object.values(farmRiskMap).filter((r) => r === 'MODERATE').length;
  const lowConfirmedCount = Object.values(farmRiskMap).filter((r) => r === 'LOW').length;
  const unassessedCount = Object.values(farmRiskMap).filter((r) => r === 'NO_ASSESSMENT' || r === 'RISK_UNAVAILABLE').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Parametric Risk Evaluations
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Deterministic rule assessments, weather window audit trails, and automated trigger verification.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setCatalogModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 shadow-sm transition-colors"
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>Parametric Rules Catalog</span>
          </button>
          <button
            onClick={fetchAssessments}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh All</span>
          </button>
        </div>
      </div>

      {/* Assessment notice banner */}
      {assessmentNotice && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between ${
            assessmentNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {assessmentNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{assessmentNotice.message}</p>
          </div>
          <button
            onClick={() => setAssessmentNotice(null)}
            className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Parcels</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Active farm plots</div>
        </div>

        <div className="bg-white rounded-2xl border border-rose-100 bg-rose-50/20 p-4 shadow-sm">
          <div className="text-xs font-semibold text-rose-600 uppercase tracking-wider">High Risk Alert</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{highCount}</div>
          <div className="text-xs text-rose-600/80 mt-0.5">Thresholds breached</div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-100 bg-amber-50/20 p-4 shadow-sm">
          <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Moderate Risk</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{moderateCount}</div>
          <div className="text-xs text-amber-600/80 mt-0.5">Advisory alerts</div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 shadow-sm">
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Low / Stable</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{lowConfirmedCount}</div>
          <div className="text-xs text-emerald-600/80 mt-0.5">Full coverage confirmed</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unassessed</div>
          <div className="text-2xl font-bold text-slate-700 mt-1">{unassessedCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Awaiting evaluation</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search farm, crop, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-slate-400 mr-1 flex-shrink-0" />
          {(['ALL', 'HIGH', 'MODERATE', 'LOW', 'UNASSESSED'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterRisk(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                filterRisk === lvl
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {lvl === 'ALL'
                ? 'All Parcels'
                : lvl === 'LOW'
                ? 'Low Risk'
                : lvl === 'UNASSESSED'
                ? 'Unassessed'
                : `${lvl.charAt(0) + lvl.slice(1).toLowerCase()} Risk`}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center space-y-3 bg-white rounded-3xl border border-slate-200">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-slate-500 font-medium">Evaluating farm risk states...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-rose-900">Failed to load risk evaluations</h3>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
            <button
              onClick={fetchAssessments}
              className="mt-3 px-3 py-1.5 text-xs font-semibold text-rose-800 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Assessment Table / List */}
      {!loading && !error && filteredFarms.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Farm Parcel & Crop</th>
                  <th className="py-3.5 px-4">Risk Status</th>
                  <th className="py-3.5 px-4">Rule Triggers</th>
                  <th className="py-3.5 px-4">Coverage Window</th>
                  <th className="py-3.5 px-4">Last Evaluated</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredFarms.map((farm) => {
                  const riskStatus = farmRiskMap[farm.id] || 'RISK_UNAVAILABLE';
                  const assessment = farmAssessmentMap[farm.id];
                  const isAssessing = assessingFarmId === farm.id;

                  return (
                    <tr key={farm.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Farm & Crop */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="font-semibold text-slate-900">{farm.farmName}</div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{farm.cropName}</span>
                          <span className="text-slate-300">•</span>
                          <span>{farm.village}, {farm.district}</span>
                        </div>
                      </td>

                      {/* Risk Badge */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <FarmRiskBadge status={riskStatus} />
                      </td>

                      {/* Rule Triggers */}
                      <td className="py-4 px-4 whitespace-nowrap text-xs text-slate-600">
                        {assessment ? (
                          <div className="space-y-0.5">
                            <span className="font-medium text-slate-900 font-mono">
                              {assessment.triggeredRuleCount} / {assessment.ruleCount}
                            </span>
                            <span className="text-slate-400 text-[11px] ml-1">rules triggered</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No evaluation yet</span>
                        )}
                      </td>

                      {/* Coverage Window */}
                      <td className="py-4 px-4 whitespace-nowrap text-xs">
                        {assessment ? (
                          assessment.hasInsufficientDataCoverage ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Incomplete Window</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>24h Complete</span>
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Last Evaluated */}
                      <td className="py-4 px-4 whitespace-nowrap text-xs text-slate-500">
                        {assessment ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(assessment.assessedAt).toLocaleString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {/* Run Assessment Button */}
                          <button
                            onClick={() => handleRunAssessment(farm.id, farm.farmName)}
                            disabled={isAssessing}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50"
                            title="Execute fresh deterministic evaluation against latest weather"
                          >
                            <Play className={`w-3.5 h-3.5 ${isAssessing ? 'animate-spin' : ''}`} />
                            <span>{isAssessing ? 'Assessing...' : 'Run'}</span>
                          </button>

                          {/* Audit Details */}
                          {assessment && (
                            <button
                              onClick={() => setAuditAssessment(assessment)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                              title="Inspect rule triggers and provenance"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>Audit</span>
                            </button>
                          )}

                          {/* View Farm Page */}
                          <Link
                            to={`/farms/${farm.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Go to Farm Dashboard"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredFarms.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <FileCheck2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">No Assessment Records Match Filter</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {farms.length === 0
              ? 'Register farm parcels to begin evaluating parametric climate risk.'
              : 'Try clearing your search query or choosing "All Parcels" to view assessments.'}
          </p>
          {farms.length === 0 && (
            <div className="pt-2">
              <Link
                to="/farms/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow transition-colors"
              >
                <span>Register Farm Parcel</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Explanatory Banner on Parametric Assessments */}
      <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-950 space-y-1.5 shadow-sm">
        <div className="font-bold flex items-center gap-2 text-emerald-900 text-sm">
          <HelpCircle className="w-4 h-4 text-emerald-700 flex-shrink-0" />
          <span>Transparent & Deterministic Parametric Assessment</span>
        </div>
        <p className="leading-relaxed text-emerald-900/90">
          AgriShield evaluates climate risk deterministically against active parametric rules (rainfall, temperature, wind gusts). Rule evaluations are executed entirely backend-side with full audit provenance, preserving observed weather values, observation windows, and rule thresholds.
        </p>
      </div>

      {/* Catalog Modal */}
      <RiskRuleCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />

      {/* Audit Modal */}
      {auditAssessment && (
        <RiskAssessmentAuditModal
          isOpen={Boolean(auditAssessment)}
          onClose={() => setAuditAssessment(null)}
          assessment={auditAssessment}
        />
      )}
    </div>
  );
};
