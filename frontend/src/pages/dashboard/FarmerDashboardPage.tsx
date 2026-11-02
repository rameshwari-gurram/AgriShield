/**
 * AgriShield Stage 3, Step 2: Farmer Dashboard
 *
 * Dedicated dashboard for authenticated Farmers:
 * - Scoped strictly to the authenticated farmer's owned farm parcels.
 * - Displays aggregate metrics: registered farms, cultivated area, active policies, open claims.
 * - Displays latest Module 6 authoritative parametric risk status per parcel.
 * - Explicitly marks Module 8 ML predictions as advisory (non-binding).
 * - Full zero-state support: seamless handling for 0 farms, 0 policies, 0 claims.
 * - Loading and actionable error states with retry.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Sprout,
  ShieldCheck,
  Receipt,
  CloudRain,
  MapPin,
  ArrowRight,
  PlusCircle,
  AlertTriangle,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { farmService } from '../../services/farmService';
import { policyClaimService } from '../../services/policyClaimService';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { Farm, PolicyWithFarm, ClaimWithFarm, RiskAssessmentResponseDTO } from '../../types';
import { FarmRiskBadge, FarmRiskStatus } from '../../components/risk/FarmRiskBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export interface FarmerDashboardPageProps {
  initialFarms?: Farm[];
  initialPolicies?: PolicyWithFarm[];
  initialClaims?: ClaimWithFarm[];
  initialLoading?: boolean;
  initialError?: string | null;
}

export const FarmerDashboardPage: React.FC<FarmerDashboardPageProps> = ({
  initialFarms,
  initialPolicies,
  initialClaims,
  initialLoading,
  initialError = null,
}) => {
  const { user, activeProducer } = useAuth();
  const farmerId = user?.id || activeProducer?.id;
  const farmerName = (user as any)?.fullName || activeProducer?.fullName || 'Valued Producer';
  const farmerContact = (user as any)?.mobileNumber || activeProducer?.mobileNumber || user?.email || '';

  const [farms, setFarms] = useState<Farm[]>(initialFarms || []);
  const [policies, setPolicies] = useState<PolicyWithFarm[]>(initialPolicies || []);
  const [claims, setClaims] = useState<ClaimWithFarm[]>(initialClaims || []);
  const [farmRiskMap, setFarmRiskMap] = useState<Record<string, FarmRiskStatus>>({});

  const [loading, setLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : initialFarms === undefined
  );
  const [error, setError] = useState<string | null>(initialError);

  const fetchFarmerData = useCallback(async () => {
    if (!farmerId || initialFarms !== undefined) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch all farms owned by this farmer
      const farmsRes = await farmService.getFarmsByFarmerId(farmerId);
      const farmerFarms = farmsRes.data || [];
      setFarms(farmerFarms);

      // If farmer has farms, query policies, claims, and latest risk in parallel
      if (farmerFarms.length > 0) {
        const [polRes, clmRes, ...riskResults] = await Promise.allSettled([
          policyClaimService.getFarmerPolicies(farmerId),
          policyClaimService.getFarmerClaims(farmerId),
          ...farmerFarms.map((f) => riskAssessmentService.getLatestRiskAssessment(f.id)),
        ]);

        if (polRes.status === 'fulfilled' && polRes.value?.data) {
          setPolicies(polRes.value.data);
        } else {
          setPolicies([]);
        }

        if (clmRes.status === 'fulfilled' && clmRes.value?.data) {
          setClaims(clmRes.value.data);
        } else {
          setClaims([]);
        }

        // Map Module 6 risk statuses
        const statusMap: Record<string, FarmRiskStatus> = {};
        riskResults.forEach((r, idx) => {
          const farm = farmerFarms[idx];
          if (!farm) return;
          if (r.status === 'fulfilled' && r.value?.data) {
            const assessment = r.value.data as RiskAssessmentResponseDTO;
            if (assessment.overallRisk === 'HIGH') statusMap[farm.id] = 'HIGH';
            else if (assessment.overallRisk === 'MODERATE') statusMap[farm.id] = 'MODERATE';
            else if (assessment.overallRisk === 'LOW') {
              statusMap[farm.id] = assessment.hasInsufficientDataCoverage ? 'LOW_UNCONFIRMED' : 'LOW';
            } else {
              statusMap[farm.id] = 'RISK_UNAVAILABLE';
            }
          } else {
            statusMap[farm.id] = 'NO_ASSESSMENT';
          }
        });
        setFarmRiskMap(statusMap);
      } else {
        setPolicies([]);
        setClaims([]);
        setFarmRiskMap({});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve your agricultural holdings.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useEffect(() => {
    fetchFarmerData();
  }, [fetchFarmerData]);

  // Aggregate farmer metrics
  const activePolicies = policies.filter((p) => p.status === 'ACTIVE');
  const totalCoverage = activePolicies.reduce((sum, p) => sum + (Number(p.sumInsured) || 0), 0);
  const totalArea = farms.reduce((sum, f) => sum + (Number(f.farmArea) || 0), 0);
  const openClaims = claims.filter((c) => c.status === 'PENDING' || c.status === 'APPROVED');
  const paidClaimsCount = claims.filter((c) => c.status === 'PAID').length;
  const highRiskFarmsCount = Object.values(farmRiskMap).filter((r) => r === 'HIGH').length;

  return (
    <div
      className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
      data-testid="farmer-dashboard-container"
    >
      {/* 1. Farmer Identity & Greeting Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Sprout className="w-4 h-4 text-emerald-400" />
              <span>Registered Producer Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {farmerName}
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/80">
              {farmerContact && <span className="font-mono">{farmerContact} • </span>}
              Parametric Insurance Coverage & Climate Risk Portfolio
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/farms/register"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs tracking-wide transition shadow-md hover:scale-[1.02]"
              data-testid="register-farm-btn"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register New Farm</span>
            </Link>
            <button
              onClick={fetchFarmerData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs backdrop-blur-sm border border-white/20 transition disabled:opacity-50"
              title="Refresh holdings"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Loading State */}
      {loading && (
        <div
          className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4"
          data-testid="farmer-dashboard-loading"
        >
          <LoadingSpinner size="lg" />
          <p className="text-sm font-medium text-slate-600">
            Loading your registered farm parcels, weather risks, and insurance policies...
          </p>
        </div>
      )}

      {/* 3. Error State */}
      {!loading && error && (
        <div
          className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-4"
          data-testid="farmer-dashboard-error"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold">Unable to Load Farm Portfolio</h4>
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          </div>
          <button
            onClick={fetchFarmerData}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4. Active Climate Hazard Banner (if any farm breached parametric thresholds) */}
      {!loading && !error && highRiskFarmsCount > 0 && (
        <div
          className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
          data-testid="farmer-hazard-alert"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Parametric Climate Hazard Triggered ({highRiskFarmsCount} Parcel{highRiskFarmsCount > 1 ? 's' : ''})
              </h3>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Module 6 authoritative rule engine detected extreme weather conditions exceeding policy trigger thresholds on your farm parcels.
              </p>
            </div>
          </div>
          <Link
            to="/policies"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-sm transition whitespace-nowrap self-start sm:self-auto"
          >
            <span>Review Coverage & Claims</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 5. Key Farmer Metric Cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="farmer-metric-cards">
          {/* Registered Parcels */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">My Farm Parcels</span>
              <Sprout className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{farms.length}</div>
            <div className="text-[11px] text-slate-500">
              {totalArea > 0 ? `${totalArea.toFixed(2)} Total Area` : '0 hectares registered'}
            </div>
          </div>

          {/* Active Policies */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Policies</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{activePolicies.length}</div>
            <div className="text-[11px] text-slate-500">
              {totalCoverage > 0 ? `₹${totalCoverage.toLocaleString('en-IN')} Total Sum Insured` : 'No active coverage'}
            </div>
          </div>

          {/* Claims Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Claims Recorded</span>
              <Receipt className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{claims.length}</div>
            <div className="text-[11px] text-slate-500">
              {openClaims.length > 0
                ? `${openClaims.length} pending review`
                : paidClaimsCount > 0
                ? `${paidClaimsCount} claims settled`
                : 'All clear / no pending claims'}
            </div>
          </div>

          {/* Climate Hazard Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hazard Alerts</span>
              <CloudRain className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">
              {highRiskFarmsCount > 0 ? (
                <span className="text-rose-600">{highRiskFarmsCount} High</span>
              ) : (
                <span className="text-emerald-600">Optimal</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">
              Module 6 deterministic trigger engine
            </div>
          </div>
        </div>
      )}

      {/* 6. Farmer Holdings Section */}
      {!loading && !error && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Registered Farm Parcels</h2>
              <p className="text-xs text-slate-500">
                Detailed telemetry, satellite NDVI analysis, and parametric policy status for each monitored parcel.
              </p>
            </div>
            {farms.length > 0 && (
              <Link
                to="/farms"
                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold inline-flex items-center gap-1"
              >
                <span>View Full Registry</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Zero Farms Empty State */}
          {farms.length === 0 ? (
            <div
              className="p-10 rounded-3xl bg-white border border-dashed border-slate-300 text-center space-y-4"
              data-testid="farmer-empty-farms"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Sprout className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">No Farm Parcels Registered Yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  You haven't linked any agricultural plots to your producer profile. Register your first farm parcel to activate automated Copernicus Sentinel-2 NDVI monitoring and parametric climate protection.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/farms/register"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs tracking-wide transition shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Register First Farm Parcel</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="farmer-farms-grid">
              {farms.map((farm) => {
                const riskStatus = farmRiskMap[farm.id] || 'NO_ASSESSMENT';
                const farmPolicies = policies.filter((p) => p.farmId === farm.id);
                const hasActivePolicy = farmPolicies.some((p) => p.status === 'ACTIVE');

                return (
                  <div
                    key={farm.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 transition-all p-5 shadow-xs space-y-4 flex flex-col justify-between"
                    data-testid={`farmer-farm-card-${farm.id}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {farm.farmReferenceNumber}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{farm.farmName}</h4>
                        </div>
                        <FarmRiskBadge status={riskStatus} />
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate">
                            {[farm.village, farm.district, farm.state].filter(Boolean).join(', ') || 'Coordinates Monitored'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                          <span>Crop: <strong className="text-slate-800">{farm.cropName}</strong></span>
                          <span>Area: <strong className="text-slate-800">{farm.farmArea} {farm.farmAreaUnit}</strong></span>
                        </div>
                      </div>

                      {/* Policy & Claim Mini Status */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Parametric Coverage:</span>
                          {hasActivePolicy ? (
                            <span className="font-bold text-emerald-700 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">Uninsured</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Links */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <Link
                        to={`/farms/${farm.id}`}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
                      >
                        <span>Parcel Details & Maps</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                      <Link
                        to={`/policies`}
                        className="text-[11px] text-slate-500 hover:text-slate-800 font-medium"
                      >
                        View Policies
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. Advisory ML Notice & Governance Disclosure */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">
            Parametric Payout Governance & Advisory Safeguards
          </p>
          <p className="leading-relaxed text-[11px] text-slate-500">
            Parametric claims and payout determinations are governed strictly and authoritatively by Module 6 deterministic weather rule evaluation. Machine learning models (Module 8) operate purely in an advisory capacity and never directly issue policies, trigger claims, or override deterministic contract terms.
          </p>
        </div>
      </div>
    </div>
  );
};
