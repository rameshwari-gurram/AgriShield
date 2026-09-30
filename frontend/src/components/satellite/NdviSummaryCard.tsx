/**
 * Module 7: Stage 7.2-F — F-3
 * Latest NDVI Summary Card Component
 *
 * Presentation-only component displaying:
 * - Latest farm-level mean NDVI and vegetation health classification
 * - Supporting NDVI range (min / max) and valid pixel coverage percentage
 * - Sentinel-2 overpass timestamp and optional satellite scene metadata
 *
 * NOTE: The frontend NEVER calculates or recalculates NDVI, risk, or thresholds.
 * The backend is the single authoritative source of truth.
 */

import React from 'react';
import {
  Sprout,
  Activity,
  Layers,
  Clock,
  Satellite,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { NdviObservationDTO } from '../../types';

export type VegetationHealthCategory =
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'NON_VEGETATIVE';

export interface VegetationHealthInfo {
  category: VegetationHealthCategory;
  label: string;
  rangeLabel: string;
  description: string;
  cardBgClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  textColorClass: string;
  captionColorClass: string;
}

/**
 * Classifies vegetation health according to AgriShield parametric thresholds:
 * - High vegetation: NDVI > 0.6
 * - Moderate vegetation: NDVI 0.3 – 0.6
 * - Low vegetation: NDVI < 0.3 (and > 0.0)
 * - Non-vegetative / water / cloud: NDVI <= 0.0
 *
 * Invariant: Never silently clamps NDVI values.
 */
export function classifyVegetationHealth(meanNdvi: number): VegetationHealthInfo {
  if (meanNdvi > 0.6) {
    return {
      category: 'HIGH',
      label: 'High Vegetation',
      rangeLabel: 'NDVI > 0.6',
      description: 'Dense, healthy photosynthetic crop canopy',
      cardBgClass: 'bg-emerald-50/70 border-emerald-200 text-emerald-950',
      badgeBgClass: 'bg-emerald-100 border border-emerald-200',
      badgeTextClass: 'text-emerald-800',
      textColorClass: 'text-emerald-800',
      captionColorClass: 'text-emerald-700',
    };
  }

  if (meanNdvi >= 0.3) {
    return {
      category: 'MODERATE',
      label: 'Moderate Vegetation',
      rangeLabel: '0.3 ≤ NDVI ≤ 0.6',
      description: 'Moderate crop canopy or emerging vegetative growth',
      cardBgClass: 'bg-amber-50/70 border-amber-200 text-amber-950',
      badgeBgClass: 'bg-amber-100 border border-amber-200',
      badgeTextClass: 'text-amber-800',
      textColorClass: 'text-amber-800',
      captionColorClass: 'text-amber-700',
    };
  }

  if (meanNdvi > 0) {
    return {
      category: 'LOW',
      label: 'Low Vegetation',
      rangeLabel: '0.0 < NDVI < 0.3',
      description: 'Sparse canopy, stressed vegetation, or bare soil',
      cardBgClass: 'bg-orange-50/70 border-orange-200 text-orange-950',
      badgeBgClass: 'bg-orange-100 border border-orange-200',
      badgeTextClass: 'text-orange-800',
      textColorClass: 'text-orange-800',
      captionColorClass: 'text-orange-700',
    };
  }

  return {
    category: 'NON_VEGETATIVE',
    label: 'Non-Vegetative / Water / Cloud',
    rangeLabel: 'NDVI ≤ 0.0',
    description: 'Water body, heavy cloud cover, or non-vegetated surface',
    cardBgClass: 'bg-slate-100/80 border-slate-200 text-slate-900',
    badgeBgClass: 'bg-slate-200 border border-slate-300',
    badgeTextClass: 'text-slate-800',
    textColorClass: 'text-slate-700',
    captionColorClass: 'text-slate-600',
  };
}

export interface NdviSummaryCardProps {
  observation: NdviObservationDTO;
}

export const NdviSummaryCard: React.FC<NdviSummaryCardProps> = ({ observation }) => {
  if (!observation) {
    return null;
  }

  const formatDateTime = (isoString?: string): string => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return isoString;
    }
  };

  const health = classifyVegetationHealth(observation.meanNdvi);
  const sat = observation.satelliteObservation;

  return (
    <div className="space-y-4" data-testid="ndvi-summary-card">
      {/* 4 Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Primary Mean NDVI & Classification */}
        <div
          className={`p-5 rounded-2xl border space-y-2 shadow-sm ${health.cardBgClass}`}
          data-testid="ndvi-primary-card"
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${health.textColorClass}`}
            >
              Latest Mean NDVI
            </span>
            {health.category === 'HIGH' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            ) : health.category === 'MODERATE' ? (
              <Sprout className="w-5 h-5 text-amber-600" aria-hidden="true" />
            ) : health.category === 'LOW' ? (
              <AlertTriangle className="w-5 h-5 text-orange-600" aria-hidden="true" />
            ) : (
              <Info className="w-5 h-5 text-slate-600" aria-hidden="true" />
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono tracking-tight" data-testid="mean-ndvi-value">
              {typeof observation.meanNdvi === 'number' && !isNaN(observation.meanNdvi)
                ? observation.meanNdvi.toFixed(4)
                : 'N/A'}
            </span>
          </div>

          <div className="pt-1 border-t border-slate-200/50">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-md ${health.badgeBgClass} ${health.badgeTextClass}`}
                data-testid="ndvi-classification-badge"
              >
                {health.label}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">({health.rangeLabel})</span>
            </div>
            <p className={`text-xs font-medium mt-1 leading-snug ${health.captionColorClass}`}>
              {health.description}
            </p>
          </div>
        </div>

        {/* Card 2: NDVI Range (Min / Max) */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <Activity className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            <span>NDVI Pixel Range</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Min:</span>
              <span className="font-mono font-bold text-slate-800" data-testid="min-ndvi-value">
                {typeof observation.minNdvi === 'number' && !isNaN(observation.minNdvi)
                  ? observation.minNdvi.toFixed(4)
                  : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Max:</span>
              <span className="font-mono font-bold text-slate-800" data-testid="max-ndvi-value">
                {typeof observation.maxNdvi === 'number' && !isNaN(observation.maxNdvi)
                  ? observation.maxNdvi.toFixed(4)
                  : 'N/A'}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/50">
            Spatial variation across parcel polygon
          </div>
        </div>

        {/* Card 3: Valid Pixel Coverage */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <Layers className="w-4 h-4 text-sky-600" aria-hidden="true" />
            <span>Valid Pixel Coverage</span>
          </div>

          <div className="text-3xl font-black font-mono text-slate-900 tracking-tight" data-testid="valid-pixel-percentage">
            {typeof observation.validPixelPercentage === 'number' && !isNaN(observation.validPixelPercentage)
              ? `${observation.validPixelPercentage.toFixed(1)}%`
              : 'N/A'}
          </div>

          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/50">
            Unmasked cloud-free polygon pixels
          </div>
        </div>

        {/* Card 4: Observation Timestamp */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <Clock className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span>Observation Date</span>
          </div>

          <div className="text-sm font-bold text-slate-900 leading-snug" data-testid="observation-date">
            {formatDateTime(observation.observedAt)}
          </div>

          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/50">
            Sentinel-2 satellite overpass
          </div>
        </div>
      </div>

      {/* Optional Satellite Granule Metadata Bar */}
      {sat && (
        <div
          className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600"
          data-testid="satellite-metadata-bar"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Satellite className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              <span data-testid="sat-satellite">{sat.satellite || 'Sentinel-2'}</span>
            </div>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-slate-700" data-testid="sat-product-type">
              {sat.productType || 'S2MSI2A'}
            </span>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Cloud:</span>
              <span className="font-mono font-medium text-slate-800" data-testid="sat-cloud-coverage">
                {sat.cloudCoverage !== null && sat.cloudCoverage !== undefined && !isNaN(sat.cloudCoverage)
                  ? `${sat.cloudCoverage.toFixed(2)}%`
                  : 'Not Reported'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Granule:</span>
            <span className="font-mono text-slate-700 truncate max-w-xs" title={sat.productId || undefined} data-testid="sat-product-id">
              {sat.productId || 'N/A'}
            </span>
            {sat.provider && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500" data-testid="sat-provider">{sat.provider}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Provenance & Parametric Notice */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-700">Copernicus Sentinel-2 Surface Reflectance: </span>
        Optical multispectral observations (B04 Red 665nm, B08 NIR 842nm) processed via the Copernicus Statistical API at 10m spatial resolution. Surface vegetation index is an objective remote sensing indicator and does not represent an on-site physical crop agronomy inspection.
      </div>
    </div>
  );
};
