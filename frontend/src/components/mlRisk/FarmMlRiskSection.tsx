/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-E: Farm Profile ML Risk Orchestrator Component
 *
 * Container component integrated into FarmDetailPage:
 * - Manages prediction lifecycle (fetch, cache, forceRefresh)
 * - Presents MlRiskScoreCard & ShapExplanationChart
 * - Handles 400 Insufficient Data, 401/403 Auth, 404, 502, 503 states cleanly
 * - Maintains strict architectural and visual separation from Module 6
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  RefreshCw,
  AlertTriangle,
  Play,
  Lock,
  CloudSun,
  ServerCrash,
  TableProperties,
  BarChart3,
} from 'lucide-react';
import { mlRiskService, parseMlRiskErrorMessage, ParsedMlRiskError } from '../../services/mlRiskService';
import {
  MlRiskPredictionDTO,
  CANONICAL_FEATURE_NAMES,
  FEATURE_METADATA_MAP,
  CanonicalFeatureName,
} from '../../types';
import { MlRiskScoreCard } from './MlRiskScoreCard';
import { ShapExplanationChart } from './ShapExplanationChart';
import { LoadingSpinner } from '../LoadingSpinner';

export interface FarmMlRiskSectionProps {
  farmId: string;
  initialPrediction?: MlRiskPredictionDTO | null;
  initialLoading?: boolean;
  initialError?: string | null;
}

export const FarmMlRiskSection: React.FC<FarmMlRiskSectionProps> = ({
  farmId,
  initialPrediction,
  initialLoading,
  initialError,
}) => {
  const [prediction, setPrediction] = useState<MlRiskPredictionDTO | null>(
    initialPrediction !== undefined ? initialPrediction : null
  );
  const [loading, setLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : initialPrediction === undefined
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<ParsedMlRiskError | null>(
    initialError ? parseMlRiskErrorMessage(initialError) : null
  );
  const [activeTab, setActiveTab] = useState<'explanation' | 'features'>('explanation');

  const fetchRisk = useCallback(
    async (forceRefresh: boolean = false) => {
      try {
        if (forceRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const res = await mlRiskService.getFarmRisk(farmId, { forceRefresh });
        setPrediction(res.data);
      } catch (err: unknown) {
        const parsed = parseMlRiskErrorMessage(err);
        setError(parsed);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [farmId]
  );

  useEffect(() => {
    // Auto-fetch if no initial prediction was supplied
    if (initialPrediction === undefined && !initialError) {
      fetchRisk(false);
    }
  }, [fetchRisk, initialPrediction, initialError]);

  return (
    <div
      data-testid="farm-ml-risk-section"
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900">
              Advisory Machine Learning Risk Prediction
            </h3>
            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200 uppercase">
              Module 8 — Advisory ML
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Statistical multi-factor crop stress probability and local Shapley (SHAP) attributions. Non-parametric advisory score.
          </p>
        </div>

        {/* Section Top Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {prediction && (
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold mr-1">
              <button
                onClick={() => setActiveTab('explanation')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'explanation'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                  <span>SHAP Attributions</span>
                </span>
              </button>
              <button
                onClick={() => setActiveTab('features')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'features'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <TableProperties className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Feature Snapshot (17)</span>
                </span>
              </button>
            </div>
          )}

          <button
            onClick={() => fetchRisk(true)}
            disabled={loading || refreshing}
            data-testid="ml-refresh-button"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition"
          >
            {refreshing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Evaluating...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{prediction ? 'Re-evaluate ML Risk' : 'Evaluate ML Risk'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div
          data-testid="ml-risk-loading"
          className="py-16 flex flex-col items-center justify-center space-y-3"
        >
          <LoadingSpinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">
            Evaluating multi-factor machine learning risk model...
          </p>
        </div>
      ) : error ? (
        /* Error States */
        <div data-testid="ml-risk-error-container" className="space-y-4">
          {error.isInsufficientData ? (
            /* 400 Insufficient Weather Telemetry */
            <div
              data-testid="ml-risk-insufficient-data-alert"
              className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-3"
            >
              <div className="flex items-start gap-3">
                <CloudSun className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-amber-900">
                    Insufficient Weather Telemetry for Machine Learning
                  </h4>
                  <p className="text-xs text-amber-800 leading-relaxed">{error.message}</p>
                </div>
              </div>
              <div className="text-[11px] text-amber-800/90 pl-9">
                Feature Contract v1.1 mandates exactly 720 consecutive hourly weather observations (30 days) to calculate rolling aggregations, dry spell indices, and thermal amplitude.
              </div>
            </div>
          ) : error.isAuthError ? (
            /* 401 / 403 Authentication & Ownership Gap */
            <div
              data-testid="ml-risk-auth-alert"
              className="p-6 rounded-2xl bg-slate-50 border border-slate-300 text-slate-800 space-y-3"
            >
              <div className="flex items-start gap-3">
                <Lock className="w-6 h-6 text-slate-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900">
                    Producer Authentication Required
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{error.message}</p>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 pl-9">
                In adherence to platform data privacy policy, machine learning crop risk evaluations are restricted to the verified farm producer (<code className="font-mono text-slate-700">farm.farmerId === req.user.id</code>).
              </div>
            </div>
          ) : error.isServiceUnavailable ? (
            /* 503 ML Service Unavailable */
            <div
              data-testid="ml-risk-service-unavailable-alert"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 space-y-3"
            >
              <div className="flex items-start gap-3">
                <ServerCrash className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-rose-900">
                    ML Inference Service Unavailable
                  </h4>
                  <p className="text-xs text-rose-800 leading-relaxed">{error.message}</p>
                </div>
              </div>
              <div className="pl-9">
                <button
                  onClick={() => fetchRisk(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white border border-rose-300 text-xs font-bold text-rose-800 hover:bg-rose-50 transition shadow-2xs"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : (
            /* Generic Error Alert */
            <div
              data-testid="ml-risk-generic-error-alert"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3"
            >
              <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" aria-hidden="true" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-900">
                  Failed to Load Machine Learning Risk
                </h4>
                <p className="text-xs text-rose-700 max-w-md mx-auto">{error.message}</p>
              </div>
              <button
                onClick={() => fetchRisk(false)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white border border-rose-300 text-xs font-bold text-rose-800 hover:bg-rose-50 transition shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          )}
        </div>
      ) : !prediction ? (
        /* Empty State */
        <div
          data-testid="ml-risk-empty-state"
          className="p-8 text-center space-y-4 rounded-2xl bg-slate-50 border border-slate-200/80"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
            <BrainCircuit className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-sm font-bold text-slate-800">
              No Machine Learning Prediction Yet
            </h4>
            <p className="text-xs text-slate-500">
              Evaluate multi-factor crop stress probability and compute local SHAP feature attributions for this farm parcel.
            </p>
          </div>
          <button
            onClick={() => fetchRisk(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>Run Initial ML Risk Evaluation</span>
          </button>
        </div>
      ) : (
        /* Populated Risk Evaluation Presentation */
        <div className="space-y-6" data-testid="ml-risk-populated-dashboard">
          {/* Summary Score Card */}
          <MlRiskScoreCard
            prediction={prediction}
            onRefresh={() => fetchRisk(true)}
            refreshing={refreshing}
          />

          {/* Conditional Tab Views */}
          {activeTab === 'explanation' ? (
            /* View 1: SHAP Local Explainability Chart */
            <ShapExplanationChart
              explanation={prediction.shapExplanation}
              featureSnapshot={prediction.featureSnapshot}
            />
          ) : (
            /* View 2: Raw 17-Feature Contract Snapshot Table */
            <div
              data-testid="features-snapshot-table"
              className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="space-y-0.5">
                  <h4 className="text-base font-bold text-slate-900">
                    Input Feature Snapshot (Contract v1.1)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Complete 17-factor feature vector passed into the Python ML inference service.
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl">
                  17 Canonical Features
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Feature Name</th>
                      <th className="py-2.5 px-3">Agronomic Description</th>
                      <th className="py-2.5 px-3">Observed Value</th>
                      <th className="py-2.5 px-3">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {CANONICAL_FEATURE_NAMES.map((name, idx) => {
                      const meta = FEATURE_METADATA_MAP[name as CanonicalFeatureName];
                      const val = prediction.featureSnapshot[name as CanonicalFeatureName];
                      const valStr =
                        val === null ? 'null (Native NaN)' : typeof val === 'number' ? val.toLocaleString() : String(val);

                      return (
                        <tr key={name} className="hover:bg-slate-50/60 transition">
                          <td className="py-2 px-3 text-slate-400 font-sans">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{name}</td>
                          <td className="py-2 px-3 text-slate-600 font-sans">{meta?.label || name}</td>
                          <td className="py-2 px-3 font-bold text-indigo-700">{valStr}</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">{meta?.unit || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
