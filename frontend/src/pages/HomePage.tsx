import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Users,
  MapPin,
  CloudSun,
  FileCheck2,
  ArrowRight,
  PlusCircle,
  AlertTriangle,
  BookOpen,
  Layers,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { farmService } from '../services/farmService';
import { farmerService } from '../services/farmerService';
import { riskAssessmentService } from '../services/riskAssessmentService';
import { Farm, Farmer, PortfolioRiskSummaryDTO, RiskAssessmentResponseDTO } from '../types';
import { PortfolioRiskSummaryCard } from '../components/risk/PortfolioRiskSummaryCard';
import { FarmRiskBadge, FarmRiskStatus } from '../components/risk/FarmRiskBadge';
import { RiskRuleCatalogModal } from '../components/risk/RiskRuleCatalogModal';
import { RiskAssessmentAuditModal } from '../components/risk/RiskAssessmentAuditModal';
import { LoadingSpinner } from '../components/LoadingSpinner';

export const HomePage: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stage 5B-3 / Stage 6 Risk state
  const [farmRiskMap, setFarmRiskMap] = useState<Record<string, FarmRiskStatus>>({});
  const [farmAssessmentMap, setFarmAssessmentMap] = useState<Record<string, RiskAssessmentResponseDTO>>({});
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioRiskSummaryDTO | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  // Modals state
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [auditAssessment, setAuditAssessment] = useState<RiskAssessmentResponseDTO | null>(null);

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

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [farmRes, farmerRes] = await Promise.allSettled([
        farmService.getFarms({ limit: 100 }),
        farmerService.getFarmers({ limit: 100 }),
      ]);

      let loadedFarms: Farm[] = [];
      if (farmRes.status === 'fulfilled') {
        loadedFarms = farmRes.value.data.farms;
        setFarms(loadedFarms);
      }

      if (farmerRes.status === 'fulfilled') {
        setFarmers(farmerRes.value.data.farmers);
      }

      // Fetch latest risk status for top farms (up to 10 for dashboard preview)
      const activeFarms = loadedFarms.filter((f) => f.status === 'ACTIVE');
      const previewFarms = activeFarms.slice(0, 10);

      const riskResults = await Promise.allSettled(
        previewFarms.map((f) => riskAssessmentService.getLatestRiskAssessment(f.id))
      );

      const statusMap: Record<string, FarmRiskStatus> = {};
      const assessMap: Record<string, RiskAssessmentResponseDTO> = {};

      riskResults.forEach((r, idx) => {
        const farmId = previewFarms[idx].id;
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
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchSummary();
  }, [fetchDashboardData, fetchSummary]);

  // Aggregate stats
  const activeFarms = farms.filter((f) => f.status === 'ACTIVE');
  const totalArea = farms.reduce((acc, f) => acc + (Number(f.farmArea) || 0), 0);
  const uniqueCrops = Array.from(new Set(farms.map((f) => f.cropName).filter(Boolean)));
  const highRiskCount = Object.values(farmRiskMap).filter((r) => r === 'HIGH').length;
  const moderateRiskCount = Object.values(farmRiskMap).filter((r) => r === 'MODERATE').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 rounded-3xl p-6 sm:p-10 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>AgriShield Agricultural Protection Platform</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
            Protecting Crops with <br />
            <span className="text-emerald-400">Automated Parametric Climate Shield</span>
          </h1>

          <p className="text-emerald-100/90 text-sm sm:text-base leading-relaxed">
            Real-time hyper-local weather telemetry, deterministic rule evaluation against extreme rainfall and heat, and rapid parametric insurance verification for registered producers.
          </p>

          {/* Quick Actions Row */}
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/farms/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all hover:scale-[1.02]"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register Farm Parcel</span>
            </Link>
            <Link
              to="/farmers/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm backdrop-blur-sm border border-white/20 transition-all"
            >
              <Users className="w-4 h-4" />
              <span>Add Farmer</span>
            </Link>
            <Link
              to="/risk"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm backdrop-blur-sm border border-white/20 transition-all"
            >
              <ShieldAlert className="w-4 h-4 text-emerald-300" />
              <span>Risk & Alerts</span>
            </Link>
            <button
              onClick={() => setCatalogModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm backdrop-blur-sm border border-white/20 transition-all"
            >
              <BookOpen className="w-4 h-4 text-emerald-300" />
              <span>Parametric Rules</span>
            </button>
          </div>
        </div>
      </section>

      {/* Elevated Risk Alert Notification (if high/moderate risk parcels exist) */}
      {(highRiskCount > 0 || moderateRiskCount > 0) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Climate Hazard Alerts Active ({highRiskCount} High, {moderateRiskCount} Moderate)
              </h3>
              <p className="text-xs text-amber-800/90 mt-0.5">
                One or more monitored farm plots have breached parametric climate thresholds during the latest observation window.
              </p>
            </div>
          </div>
          <Link
            to="/risk"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <span>Review Elevated Risks</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchDashboardData}
            className="text-xs font-semibold uppercase tracking-wider text-rose-700 hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Macro Portfolio Risk Summary Card */}
      <PortfolioRiskSummaryCard
        summary={portfolioSummary}
        loading={portfolioLoading}
        error={portfolioError}
        onRetry={fetchSummary}
        onViewRules={() => setCatalogModalOpen(true)}
      />

      {/* Operational Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Farms */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Parcels</span>
            <Sprout className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">{activeFarms.length}</div>
          <div className="text-xs text-slate-400">Of {farms.length} registered plots</div>
        </div>

        {/* Cultivated Area */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monitored Area</span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono">
            {totalArea.toFixed(1)}
          </div>
          <div className="text-xs text-slate-400">Total registered units</div>
        </div>

        {/* Protected Crops */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Crop Varieties</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">{uniqueCrops.length}</div>
          <div className="text-xs text-slate-400">Distinct agricultural crops</div>
        </div>

        {/* Registered Farmers */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Producers</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">{farmers.length}</div>
          <div className="text-xs text-slate-400">Verified farmer accounts</div>
        </div>
      </div>

      {/* Main Content Area: Recent Farms or Onboarding Empty State */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center space-y-3 bg-white rounded-3xl border border-slate-200">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-slate-500 font-medium">Loading your farm operations...</p>
        </div>
      ) : farms.length === 0 ? (
        /* Empty State / Onboarding Guide */
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Sprout className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Welcome to AgriShield Parametric</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Start protecting your agricultural crops with objective climate risk tracking and automated parametric insurance triggers in 3 easy steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-sm flex items-center justify-center">
                1
              </div>
              <h3 className="font-bold text-slate-900">Register Producer</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Create a farmer profile with official mobile contact and state registration credentials.
              </p>
              <Link
                to="/farmers/register"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <span>Add Farmer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-sm flex items-center justify-center">
                2
              </div>
              <h3 className="font-bold text-slate-900">Digitize Farm Parcel</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Draw polygon boundaries directly on satellite maps to accurately calibrate geometric centroids and acreage.
              </p>
              <Link
                to="/farms/register"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <span>Add Farm</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-sm flex items-center justify-center">
                3
              </div>
              <h3 className="font-bold text-slate-900">Automated Protection</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                AgriShield continuously observes centroid weather and evaluates parametric triggers against extreme climate events.
              </p>
              <Link
                to="/risk"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <span>View Rules</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* Populated Dashboard: Recent Farm Parcels */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">My Farm Parcels & Current Risk</h2>
              <p className="text-xs text-slate-500">
                Latest monitored plots with automated parametric climate risk badges.
              </p>
            </div>
            <Link
              to="/farms"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 self-start sm:self-auto"
            >
              <span>View All {farms.length} Parcels</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 sm:px-6">Farm Parcel</th>
                  <th className="py-3 px-4">Crop</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Area</th>
                  <th className="py-3 px-4">Climate Risk Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {farms.slice(0, 6).map((farm) => {
                  const riskStatus = farmRiskMap[farm.id] || 'RISK_UNAVAILABLE';
                  const assessment = farmAssessmentMap[farm.id];

                  return (
                    <tr key={farm.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6">
                        <Link
                          to={`/farms/${farm.id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-700 transition-colors"
                        >
                          {farm.farmName}
                        </Link>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          {farm.farmReferenceNumber}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                          <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{farm.cropName}</span>
                        </div>
                        {farm.cropVariety && (
                          <div className="text-xs text-slate-400">{farm.cropVariety}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{farm.village}, {farm.district}</span>
                        </div>
                        <div className="text-slate-400 text-[11px] ml-4">{farm.state}</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-slate-700">
                        {Number(farm.farmArea).toFixed(1)} {farm.farmAreaUnit}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <FarmRiskBadge status={riskStatus} />
                      </td>

                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {assessment && (
                            <button
                              onClick={() => setAuditAssessment(assessment)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                              Audit
                            </button>
                          )}
                          <Link
                            to={`/farms/${farm.id}`}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Open Farm Details"
                          >
                            <ArrowRight className="w-4 h-4" />
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

      {/* Platform Capabilities & Educational Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <CloudSun className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900">Hyper-Local Weather Monitoring</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Centroid-mapped numerical weather observations via Open-Meteo. Track 24-hour rainfall accumulation, temperature extremes, and wind gusts directly for each farm parcel.
          </p>
          <Link
            to="/weather"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
          >
            <span>Explore Weather Telemetry</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900">Deterministic Parametric Rules</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Transparent and objective risk triggers evaluated entirely backend-side. No subjective damage adjusters, no claim delays, and complete evaluation provenance.
          </p>
          <Link
            to="/assessments"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
          >
            <span>View Risk Evaluations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900">Geospatial Boundary Intelligence</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Interactive polygon mapping powered by PostGIS. Binds your parcel perimeter to standard coordinate reference frames (WGS84 EPSG:4326) for precise indexing.
          </p>
          <Link
            to="/farms"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
          >
            <span>Manage Farm Parcels</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
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
