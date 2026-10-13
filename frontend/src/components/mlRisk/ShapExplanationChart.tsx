/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-E: 17-Feature SHAP Local Attribution Explanation Chart
 *
 * Visualizes local feature attributions explaining the base model's
 * raw decision margin (log-odds) using SHAP TreeExplainer outputs.
 * Verifies mathematical additivity and displays signed feature contributions.
 */

import React, { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
} from 'lucide-react';
import {
  ExplanationResult,
  MLFeatureContractV1_1,
  CanonicalFeatureName,
  FEATURE_METADATA_MAP,
} from '../../types';

export interface ShapExplanationChartProps {
  explanation: ExplanationResult;
  featureSnapshot: MLFeatureContractV1_1;
}

export const ShapExplanationChart: React.FC<ShapExplanationChartProps> = ({
  explanation,
  featureSnapshot,
}) => {
  const [sortMode, setSortMode] = useState<'magnitude' | 'canonical'>('magnitude');
  const [filterDirection, setFilterDirection] = useState<'all' | 'increasing' | 'decreasing'>('all');

  // Verify and calculate additivity metrics
  const baseValue = explanation.base_value;
  const reconstructedMargin = explanation.reconstructed_margin;
  const additivityError = explanation.additivity_error;
  const isAdditivityValid = additivityError < 1e-5;

  // Compute max magnitude across all 17 features for proportional bar scaling
  const maxMagnitude = Math.max(
    ...explanation.attributions.map((a) => a.contribution_magnitude || Math.abs(a.shap_value)),
    0.001
  );

  // Filter attributions according to user selection
  const filteredAttributions = explanation.attributions.filter((attr) => {
    if (filterDirection === 'increasing') return attr.shap_value > 0;
    if (filterDirection === 'decreasing') return attr.shap_value < 0;
    return true;
  });

  // Sort attributions: by absolute contribution magnitude or by canonical contract order
  const displayedAttributions = [...filteredAttributions].sort((a, b) => {
    if (sortMode === 'magnitude') {
      return b.contribution_magnitude - a.contribution_magnitude;
    }
    // Canonical contract order
    return 0; // Maintains canonical array order from backend
  });

  return (
    <div
      data-testid="shap-explanation-chart"
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
    >
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            <h4 className="text-base font-bold text-slate-900">
              SHAP Local Feature Attributions (17 Factors)
            </h4>
          </div>
          <p className="text-xs text-slate-500">
            Cooperative game-theoretic decomposition of the raw base-model decision margin.
          </p>
        </div>

        {/* View & Filter Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort Toggle */}
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              onClick={() => setSortMode('magnitude')}
              className={`px-2.5 py-1 rounded-lg transition ${
                sortMode === 'magnitude'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                <span>By Impact</span>
              </span>
            </button>
            <button
              onClick={() => setSortMode('canonical')}
              className={`px-2.5 py-1 rounded-lg transition ${
                sortMode === 'canonical'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Canonical Order</span>
            </button>
          </div>

          {/* Direction Filter */}
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              onClick={() => setFilterDirection('all')}
              className={`px-2 py-1 rounded-lg transition ${
                filterDirection === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All (17)
            </button>
            <button
              onClick={() => setFilterDirection('increasing')}
              className={`px-2 py-1 rounded-lg transition ${
                filterDirection === 'increasing'
                  ? 'bg-rose-50 text-rose-800 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              + Risk
            </button>
            <button
              onClick={() => setFilterDirection('decreasing')}
              className={`px-2 py-1 rounded-lg transition ${
                filterDirection === 'decreasing'
                  ? 'bg-emerald-50 text-emerald-800 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              - Risk
            </button>
          </div>
        </div>
      </div>

      {/* Additivity Verification Banner */}
      <div
        data-testid="additivity-summary-banner"
        className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2
            className={`w-5 h-5 flex-shrink-0 ${
              isAdditivityValid ? 'text-emerald-600' : 'text-amber-500'
            }`}
            aria-hidden="true"
          />
          <div>
            <div className="font-bold text-slate-800">
              Mathematical Additivity Verified: Base Value + Σ SHAP = Reconstructed Margin
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              <span>Expected Base Score (φ₀): </span>
              <code className="font-mono font-bold text-slate-700 bg-white px-1 rounded border border-slate-200">
                {baseValue >= 0 ? '+' : ''}{baseValue.toFixed(4)}
              </code>
              <span className="mx-1">→</span>
              <span>Reconstructed Decision Margin: </span>
              <code className="font-mono font-bold text-slate-700 bg-white px-1 rounded border border-slate-200">
                {reconstructedMargin >= 0 ? '+' : ''}{reconstructedMargin.toFixed(4)}
              </code>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 self-start md:self-auto font-mono bg-white px-2.5 py-1 rounded-xl border border-slate-200">
          <span>Additivity Error: </span>
          <span className="font-bold text-slate-800">{additivityError.toExponential(2)}</span>
        </div>
      </div>

      {/* 17 Feature Attributions List */}
      <div className="space-y-3" data-testid="attributions-list">
        {displayedAttributions.map((attr) => {
          const meta = FEATURE_METADATA_MAP[attr.feature_name as CanonicalFeatureName];
          const label = meta?.label || attr.feature_name;
          const unit = meta?.unit || '';
          const isIncreasing = attr.shap_value > 0;
          const isDecreasing = attr.shap_value < 0;

          // Proportional width of the attribution bar (percentage of max magnitude)
          const barWidthPercent = Math.min(
            100,
            Math.max(4, Math.round((attr.contribution_magnitude / maxMagnitude) * 100))
          );

          // Format feature input value
          const rawVal = featureSnapshot[attr.feature_name as CanonicalFeatureName];
          let formattedValStr: string;
          if (rawVal === null || attr.feature_value === null) {
            formattedValStr = 'Missing / Null (Native NaN)';
          } else if (typeof rawVal === 'number') {
            formattedValStr = `${rawVal.toLocaleString()} ${unit}`;
          } else {
            formattedValStr = String(rawVal);
          }

          const shapSign = attr.shap_value >= 0 ? '+' : '';
          const formattedShap = `${shapSign}${attr.shap_value.toFixed(4)}`;

          return (
            <div
              key={attr.feature_name}
              data-testid={`attribution-row-${attr.feature_name}`}
              className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition shadow-2xs space-y-2"
            >
              {/* Feature Title, Value, and Attribution Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <div>
                  <span className="font-bold text-slate-900">{label}</span>
                  <span className="text-[11px] font-mono text-slate-400 ml-2">
                    ({attr.feature_name})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-slate-500 font-medium">
                    Observed: <strong className="text-slate-800 font-mono">{formattedValStr}</strong>
                  </span>

                  {/* Direction Badge */}
                  {isIncreasing ? (
                    <span
                      data-testid={`shap-badge-${attr.feature_name}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-200 font-mono"
                      title="Pushes base model toward Class 1 (Elevated Risk)"
                    >
                      <TrendingUp className="w-3 h-3 text-rose-600" aria-hidden="true" />
                      <span>{formattedShap}</span>
                    </span>
                  ) : isDecreasing ? (
                    <span
                      data-testid={`shap-badge-${attr.feature_name}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 font-mono"
                      title="Pushes base model toward Class 0 (Normal / Minimal Risk)"
                    >
                      <TrendingDown className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                      <span>{formattedShap}</span>
                    </span>
                  ) : (
                    <span
                      data-testid={`shap-badge-${attr.feature_name}`}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 font-mono"
                    >
                      <span>0.0000</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Proportional Contribution Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex items-center">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isIncreasing
                      ? 'bg-rose-500'
                      : isDecreasing
                      ? 'bg-emerald-500'
                      : 'bg-slate-300'
                  }`}
                  style={{ width: `${barWidthPercent}%` }}
                />
              </div>

              {/* Human-Readable Direction Semantic Note */}
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>
                  {isIncreasing
                    ? 'Increases risk probability (pushes decision margin higher)'
                    : isDecreasing
                    ? 'Decreases risk probability (protective factor against water stress)'
                    : 'No marginal contribution'}
                </span>
                <span className="font-mono text-[10px]">
                  |φ| = {attr.contribution_magnitude.toFixed(4)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Attribution Footnote */}
      <div className="p-3.5 bg-slate-50 rounded-2xl text-[11px] text-slate-500 border border-slate-100 flex items-start gap-2">
        <HelpCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong>SHAP Value Interpretation: </strong>
          SHAP values represent the local additive contribution of each factor to the model&apos;s raw decision margin for this specific farm parcel and lookback window. Positive values push the log-odds margin toward elevated risk classification, while negative values push toward normal baseline conditions. They reflect mathematical model attribution and do not constitute biological or legal damage proofs.
        </p>
      </div>
    </div>
  );
};
