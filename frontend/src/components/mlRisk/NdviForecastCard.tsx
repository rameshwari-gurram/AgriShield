/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * 7-Day Ahead Sentinel-2 NDVI Vegetation Condition Forecast Component
 *
 * Visualizes:
 * - Next-week forecasted NDVI value on [-0.2, 1.0] scale
 * - Predicted delta (ΔNDVI) from current Sentinel-2 observation
 * - Comparison against persistence baseline (NDVI_current)
 * - Local SHAP TreeExplainer attributions for environmental and lag features
 * - Provenance metadata (IEEE AgriVision Maharashtra dataset, 2017-2025)
 * - Platform advisory disclaimer
 */

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  RefreshCw,
  Layers,
  Info,
  CheckCircle2,
  Calendar,
  Compass,
} from 'lucide-react';
import { NdviForecastResponse } from '../../types';

export interface NdviForecastCardProps {
  forecast: NdviForecastResponse;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const NdviForecastCard: React.FC<NdviForecastCardProps> = ({
  forecast,
  onRefresh,
  refreshing = false,
}) => {
  const { predicted_ndvi, current_ndvi, predicted_delta, explanation, model, disclaimer } =
    forecast;

  const isPositiveDelta = predicted_delta > 0.005;
  const isNegativeDelta = predicted_delta < -0.005;

  // Format delta with explicit sign
  const deltaSign = predicted_delta > 0 ? '+' : '';
  const formattedDelta = `${deltaSign}${predicted_delta.toFixed(4)}`;

  // Health tier classification
  const getHealthTier = (val: number) => {
    if (val >= 0.5) return { label: 'Dense / Healthy Canopy', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (val >= 0.3) return { label: 'Moderate Canopy Density', color: 'text-teal-700 bg-teal-50 border-teal-200' };
    if (val >= 0.15) return { label: 'Sparse / Emerging Vegetation', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'Bare Soil / Water Stress', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  };

  const healthTier = getHealthTier(predicted_ndvi);

  // Top SHAP attributions (sorted by contribution magnitude)
  const sortedAttributions = [...explanation.attributions].sort(
    (a, b) => b.contribution_magnitude - a.contribution_magnitude
  );
  const topAttributions = sortedAttributions.slice(0, 8);

  // Dynamic SHAP additivity verification (|additivity_error| < 1e-4)
  const isAdditivityVerified =
    typeof explanation?.additivity_error === 'number' &&
    Number.isFinite(explanation.additivity_error) &&
    Math.abs(explanation.additivity_error) < 1e-4;

  return (
    <div
      data-testid="ndvi-forecast-card"
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 shadow-xs">
            <Sparkles className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-bold text-slate-900">
                7-Day Vegetation Condition Forecast (NDVI)
              </h4>
              <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase">
                Experimental Advisory
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervised regression trained on 33,549 multi-spectral records from the IEEE AgriVision Maharashtra dataset (2017–2025).
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="refresh-ndvi-forecast-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`}
              aria-hidden="true"
            />
            <span>{refreshing ? 'Forecasting...' : 'Update Forecast'}</span>
          </button>
        )}
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Forecasted NDVI */}
        <div
          data-testid="predicted-ndvi-metric"
          className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 text-emerald-950 space-y-2 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
                Forecasted NDVI (T + 7d)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase bg-emerald-200/80 text-emerald-900">
                Next Week
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-emerald-950">
                {predicted_ndvi.toFixed(3)}
              </span>
              <span className="text-xs text-emerald-800/80 font-medium">NDVI ratio</span>
            </div>
          </div>

          <div className="mt-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${healthTier.color}`}>
              {healthTier.label}
            </span>
          </div>
        </div>

        {/* Metric 2: Predicted Delta vs Current */}
        <div
          data-testid="predicted-delta-metric"
          className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Predicted 7-Day Change (ΔNDVI)
              </span>
              <span className="text-[10px] font-mono text-slate-400">vs Current Pass</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-3xl font-black font-mono tracking-tight ${
                  isPositiveDelta
                    ? 'text-emerald-700'
                    : isNegativeDelta
                    ? 'text-rose-700'
                    : 'text-slate-700'
                }`}
              >
                {formattedDelta}
              </span>
              <span className="text-xs text-slate-500">Δ/week</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            {isPositiveDelta ? (
              <>
                <TrendingUp className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-800 font-semibold">Vegetation Vigour Increasing</span>
              </>
            ) : isNegativeDelta ? (
              <>
                <TrendingDown className="w-4 h-4 text-rose-600" aria-hidden="true" />
                <span className="text-rose-800 font-semibold">Vegetation Decline Expected</span>
              </>
            ) : (
              <>
                <Minus className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <span>Vegetation Condition Stable</span>
              </>
            )}
          </div>
        </div>

        {/* Metric 3: Persistence Baseline */}
        <div
          data-testid="persistence-baseline-metric"
          className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Persistence Baseline
              </span>
              <span className="text-[10px] font-mono text-slate-400">NDVI_current</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-900">
                {current_ndvi.toFixed(3)}
              </span>
              <span className="text-xs text-slate-500">observed</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
            Model outperforms persistence by 6.2% lower MAE and 8.7% lower RMSE on held-out 2024–2025 observations (R²: 0.903).
          </p>
        </div>
      </div>

      {/* SHAP Feature Attributions Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h5 className="text-sm font-bold text-slate-900">
              Key Factors Influencing Next-Week Vegetation Forecast (SHAP)
            </h5>
            <p className="text-xs text-slate-500">
              Local Shapley attributions explaining deviation from historical baseline (φ₀ = {explanation.base_value.toFixed(3)}).
            </p>
          </div>
          {isAdditivityVerified && (
            <span
              data-testid="shap-additivity-badge"
              className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Additivity Verified</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {topAttributions.map((attr) => {
            const isPos = attr.shap_value > 0;
            const sign = isPos ? '+' : '';
            return (
              <div
                key={attr.feature_name}
                className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between gap-3 text-xs"
              >
                <div className="truncate">
                  <div className="font-semibold text-slate-800 truncate font-mono text-[11px]">
                    {attr.feature_name}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {attr.direction}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <span
                    className={`font-mono font-bold text-xs ${
                      isPos ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {sign}{attr.shap_value.toFixed(4)}
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono">
                    val: {attr.feature_value !== null && attr.feature_value !== undefined ? Number(attr.feature_value).toFixed(2) : 'NaN'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Model Metadata & Provenance Footer */}
      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 text-xs text-slate-600 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Layers className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Model:</span>
            <span className="font-mono font-semibold text-slate-900">{model.model_name}</span>
            <span className="text-slate-400">|</span>
            <span>v{model.model_version}</span>
            <span className="text-slate-400">|</span>
            <span>Contract {model.feature_contract_version} ({model.feature_count} features)</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Horizon:</span>
            <span className="font-semibold text-slate-800">7 Days (Next Week)</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>Regional Focus: Maharashtra (167 IEEE monitoring points, 31 agricultural districts). Target: Sentinel-2 NDVI.</span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-950 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-emerald-900">
          <Info className="w-4 h-4 text-emerald-700 flex-shrink-0" />
          <span>Vegetation Condition Advisory Notice</span>
        </div>
        <p className="text-[11px] text-emerald-900/90 leading-relaxed">
          {disclaimer}
        </p>
      </div>
    </div>
  );
};
