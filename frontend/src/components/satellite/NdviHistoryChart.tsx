/**
 * Module 7: Stage 7.2-F — F-5
 * Historical NDVI Time-Series Chart Component
 *
 * Renders time-series trend chart of satellite NDVI observations using Recharts.
 * - Primary plotted series: Mean NDVI (never calculated client-side)
 * - X-Axis: Observation date (human-readable, derived from observedAt)
 * - Y-Axis: NDVI numerical value (never converted to percentage)
 * - Custom Tooltip: Mean NDVI, Min NDVI, Max NDVI, Valid Pixel %, Health classification
 * - Handled states: Loading, Error, Empty, Single observation, Multi-point series
 *
 * NOTE: The frontend NEVER calculates NDVI or fetches data inside this presentation component.
 */

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Satellite, AlertCircle, Calendar } from 'lucide-react';
import { NdviObservationDTO } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { classifyVegetationHealth } from './NdviSummaryCard';

export interface NdviChartPoint {
  id: string;
  observedAt: string;
  displayDate: string;
  fullDate: string;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  validPixelPercentage: number;
  satellite: string;
  productType: string;
}

/**
 * Transforms historical observation DTOs into chart data points without mutating the source array.
 */
export function formatNdviChartData(observations: NdviObservationDTO[]): NdviChartPoint[] {
  return observations.map((obs) => {
    const d = new Date(obs.observedAt);
    const validDate = !isNaN(d.getTime());

    const displayDate = validDate
      ? d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
      : obs.observedAt;

    const fullDate = validDate
      ? d.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : obs.observedAt;

    return {
      id: obs.id,
      observedAt: obs.observedAt,
      displayDate,
      fullDate,
      meanNdvi: obs.meanNdvi,
      minNdvi: obs.minNdvi,
      maxNdvi: obs.maxNdvi,
      validPixelPercentage: obs.validPixelPercentage,
      satellite: obs.satelliteObservation?.satellite || 'Sentinel-2',
      productType: obs.satelliteObservation?.productType || 'S2MSI2A',
    };
  });
}

export interface CustomNdviTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: NdviChartPoint;
  }>;
}

/**
 * Detailed hover tooltip displaying observation timestamp, mean NDVI, min/max range,
 * valid pixel coverage percentage, and vegetation health classification.
 */
export const CustomNdviTooltip: React.FC<CustomNdviTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  const health = classifyVegetationHealth(data.meanNdvi);

  return (
    <div
      className="bg-white/95 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200 shadow-lg text-xs space-y-2 min-w-[220px]"
      data-testid="ndvi-chart-tooltip"
    >
      <div className="font-semibold text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between gap-2">
        <span className="truncate" data-testid="tooltip-date">{data.fullDate}</span>
        <span
          className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded flex-shrink-0"
          data-testid="tooltip-satellite"
        >
          {data.satellite}
        </span>
      </div>

      <div className="space-y-1.5 text-slate-600">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Vegetation:</span>
          <span
            className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${health.badgeBgClass} ${health.badgeTextClass}`}
            data-testid="tooltip-vegetation-badge"
          >
            {health.label}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-medium">Mean NDVI:</span>
          <span
            className="font-bold text-emerald-700 font-mono text-sm"
            data-testid="tooltip-mean-ndvi"
          >
            {typeof data.meanNdvi === 'number' && !isNaN(data.meanNdvi)
              ? data.meanNdvi.toFixed(4)
              : 'N/A'}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-400">Pixel Range:</span>
          <span className="font-mono text-slate-700" data-testid="tooltip-pixel-range">
            {typeof data.minNdvi === 'number' && !isNaN(data.minNdvi)
              ? data.minNdvi.toFixed(4)
              : 'N/A'}{' '}
            –{' '}
            {typeof data.maxNdvi === 'number' && !isNaN(data.maxNdvi)
              ? data.maxNdvi.toFixed(4)
              : 'N/A'}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-400">Valid Pixels:</span>
          <span
            className="font-mono font-medium text-slate-700"
            data-testid="tooltip-valid-pixels"
          >
            {typeof data.validPixelPercentage === 'number' && !isNaN(data.validPixelPercentage)
              ? `${data.validPixelPercentage.toFixed(1)}%`
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
};

export interface NdviHistoryChartProps {
  observations: NdviObservationDTO[];
  loading?: boolean;
  error?: string | null;
}

export const NdviHistoryChart: React.FC<NdviHistoryChartProps> = ({
  observations,
  loading = false,
  error = null,
}) => {
  if (loading) {
    return (
      <div
        className="h-72 w-full flex flex-col items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3"
        data-testid="ndvi-chart-loading"
      >
        <LoadingSpinner size="md" />
        <p className="text-xs font-medium text-slate-500">Loading historical NDVI observations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="h-72 w-full flex flex-col items-center justify-center p-6 bg-rose-50/50 rounded-2xl border border-rose-200/80 text-center space-y-2"
        data-testid="ndvi-chart-error"
      >
        <AlertCircle className="w-6 h-6 text-rose-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-rose-900">Unable to load NDVI trends</p>
        <p className="text-xs text-rose-700 max-w-md" data-testid="ndvi-chart-error-message">
          {error}
        </p>
      </div>
    );
  }

  if (observations.length === 0) {
    return (
      <div
        className="h-72 w-full flex flex-col items-center justify-center p-6 bg-slate-50/70 rounded-2xl border border-dashed border-slate-300 text-center space-y-2"
        data-testid="ndvi-chart-empty"
      >
        <Satellite className="w-8 h-8 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700">No historical NDVI observations available</p>
        <p className="text-xs text-slate-500 max-w-md">
          No satellite observations are stored in PostgreSQL for this farm parcel yet. Use the synchronization controls above to fetch Sentinel-2 imagery.
        </p>
      </div>
    );
  }

  const chartData = formatNdviChartData(observations);

  return (
    <div className="space-y-3" data-testid="ndvi-history-chart">
      {/* Single Observation Advisory Banner */}
      {observations.length === 1 && (
        <div
          className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2 shadow-xs"
          data-testid="single-obs-advisory"
        >
          <Calendar className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
          <span>
            Displaying 1 observation. Perform repeated or regular syncs to build a multi-point NDVI vegetation trend curve.
          </span>
        </div>
      )}

      {/* Recharts Responsive Container */}
      <div className="h-72 w-full pt-2" data-testid="ndvi-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              angle={-25}
              textAnchor="end"
              height={50}
            />
            <YAxis
              unit=""
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
            />
            <Tooltip content={<CustomNdviTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
            />
            {/* Subtle Reference Thresholds */}
            <ReferenceLine
              y={0.6}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: 'High (>0.6)',
                position: 'right',
                fill: '#059669',
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={0.3}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: 'Moderate (0.3)',
                position: 'right',
                fill: '#d97706',
                fontSize: 10,
              }}
            />
            <Line
              type="monotone"
              dataKey="meanNdvi"
              name="Mean NDVI"
              stroke="#059669"
              strokeWidth={2.5}
              dot={{ r: observations.length === 1 ? 5 : 3, fill: '#059669' }}
              activeDot={{ r: 6, fill: '#047857' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Attribution Footnote */}
      <div className="text-[11px] text-slate-400 text-right pr-2">
        Copernicus Sentinel-2 MSI Level-2A (ESA / CDSE) • Zonal Mean NDVI
      </div>
    </div>
  );
};
