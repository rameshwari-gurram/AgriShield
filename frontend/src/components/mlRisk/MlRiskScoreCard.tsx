/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-E: ML Risk Score & Probability Summary Card
 *
 * Visualizes the calibrated posterior probability, binary predicted risk class,
 * raw decision margin, cache status, model provenance, and mandatory legal disclaimer.
 */

import React from 'react';
import {
  BrainCircuit,
  RefreshCw,
  Clock,
  Sparkles,
  ShieldAlert,
  Info,
  Layers,
  Fingerprint,
} from 'lucide-react';
import { MlRiskPredictionDTO } from '../../types';

export interface MlRiskScoreCardProps {
  prediction: MlRiskPredictionDTO;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const MlRiskScoreCard: React.FC<MlRiskScoreCardProps> = ({
  prediction,
  onRefresh,
  refreshing = false,
}) => {
  const probabilityPercent = (prediction.calibratedProbability * 100).toFixed(1);
  const isElevated = prediction.predictedClass === 1;

  // Format decision margin with explicit sign
  const marginSign = prediction.rawDecisionMargin >= 0 ? '+' : '';
  const formattedMargin = `${marginSign}${prediction.rawDecisionMargin.toFixed(4)}`;

  return (
    <div
      data-testid="ml-risk-score-card"
      className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
    >
      {/* Card Header & Model Provenance Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 shadow-xs">
            <BrainCircuit className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-bold text-slate-900">Predictive Crop Risk Evaluation</h4>
              <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200 uppercase">
                Module 8
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Multi-factor agronomic, meteorological, and Sentinel-2 vegetation stress modeling.
            </p>
          </div>
        </div>

        {/* Action Button & Cache Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {prediction.isCached ? (
            <span
              data-testid="cache-status-pill"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200"
              title="Retrieved from persistent audit cache"
            >
              <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Cached Evaluation</span>
            </span>
          ) : (
            <span
              data-testid="cache-status-pill"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
              title="Fresh evaluation computed and audited"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>Fresh Evaluation</span>
            </span>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              data-testid="force-refresh-button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition disabled:opacity-50"
              title="Bypass cache and force re-evaluation"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`}
                aria-hidden="true"
              />
              <span>{refreshing ? 'Evaluating...' : 'Re-evaluate'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Calibrated Stress Probability */}
        <div
          data-testid="calibrated-probability-card"
          className={`p-5 rounded-2xl border transition ${
            isElevated
              ? 'bg-rose-50/70 border-rose-200/90 text-rose-950'
              : 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
              Calibrated Stress Probability
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                isElevated ? 'bg-rose-200/80 text-rose-900' : 'bg-emerald-200/80 text-emerald-900'
              }`}
            >
              Platt Scaled
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
              {probabilityPercent}%
            </span>
            <span className="text-xs font-medium opacity-80">posterior likelihood</span>
          </div>

          <div className="mt-2 text-xs opacity-85 leading-relaxed">
            {isElevated
              ? 'Significant compound multi-factor risk detected across weather and remote sensing.'
              : 'Environmental and remote sensing indicators currently remain within normal tolerance.'}
          </div>
        </div>

        {/* Metric 2: Predicted Risk Classification */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Model Classification
              </span>
              <span className="text-[10px] font-mono text-slate-400">Class Threshold: 0.50</span>
            </div>

            <div className="mt-3">
              {isElevated ? (
                <span
                  data-testid="predicted-class-badge"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600" aria-hidden="true" />
                  <span>Elevated Stress Risk (Class 1)</span>
                </span>
              ) : (
                <span
                  data-testid="predicted-class-badge"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300"
                >
                  <Sparkles className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <span>Normal Agronomic Risk (Class 0)</span>
                </span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
            Discrete classification indicates whether cumulative water deficit and thermal stress surpass 30% crop yield vulnerability.
          </p>
        </div>

        {/* Metric 3: Raw Decision Margin (Log-Odds) */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Raw Decision Margin
              </span>
              <span className="text-[10px] font-mono text-slate-400">Log-Odds</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span
                data-testid="raw-decision-margin-value"
                className="text-2xl font-black font-mono text-slate-900"
              >
                {formattedMargin}
              </span>
              <span className="text-xs text-slate-500">margin</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
            Uncalibrated log-odds output of HistGradientBoosting. Exactly decomposed by SHAP TreeExplainer attributions below.
          </p>
        </div>
      </div>

      {/* Model Provenance & Fingerprint Bar */}
      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 text-xs text-slate-600 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Layers className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
            <span>Model:</span>
            <span className="font-mono font-semibold text-slate-900">{prediction.model.modelName}</span>
            <span className="text-slate-400">|</span>
            <span>v{prediction.model.modelVersion}</span>
            <span className="text-slate-400">|</span>
            <span>Contract {prediction.model.featureContractVersion}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Assessed Anchor:</span>
            <span className="font-mono text-slate-700">
              {new Date(prediction.assessedAt).toISOString()}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-[11px] text-slate-500">
          <Fingerprint className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-600">Deterministic SHA-256 Input Fingerprint:</span>
          <code
            data-testid="input-fingerprint"
            className="font-mono text-[10px] text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200 truncate"
            title={prediction.inputFingerprint}
          >
            {prediction.inputFingerprint}
          </code>
        </div>
      </div>

      {/* Mandatory Statutory Advisory Legal Disclaimer */}
      <div
        data-testid="ml-risk-disclaimer-box"
        className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950 space-y-2 shadow-2xs"
      >
        <div className="flex items-center gap-2 font-bold text-amber-900">
          <Info className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
          <span>Mandatory Platform Advisory Disclaimer</span>
        </div>

        <p data-testid="backend-disclaimer-text" className="leading-relaxed text-amber-900/90">
          {prediction.disclaimer}
        </p>

        <div className="pt-2 border-t border-amber-200/60 text-[11px] text-amber-800 leading-relaxed">
          <span className="font-semibold">Statutory Insurance Separation Notice: </span>
          Official parametric insurance coverage, claim trigger evaluations, and indemnity payouts in AgriShield are governed exclusively by statutory weather threshold rules (Module 6). Machine learning predictions do not authorize claims, calculate payouts, or alter parametric thresholds.
        </div>
      </div>
    </div>
  );
};
