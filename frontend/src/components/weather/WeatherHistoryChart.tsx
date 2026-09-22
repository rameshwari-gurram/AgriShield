/**
 * Module 5: Weather History Chart
 * Renders time-series chart of weather observations using Recharts.
 *
 * Visualizes:
 * - Temperature (°C) on Y-axis
 * - Observation timestamps on X-axis
 * - Comprehensive Tooltip with Temperature, Rainfall, Humidity, and Wind Speed
 *
 * Robust states handled:
 * - Loading
 * - Error
 * - Empty data
 * - Single observation point
 * - Multi-point time series
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
} from 'recharts';
import { AlertCircle, CloudSun, Calendar } from 'lucide-react';
import { WeatherRecord } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { getWeatherCondition } from '../../utils/weatherCodes';

interface WeatherHistoryChartProps {
  records: WeatherRecord[];
  loading?: boolean;
  error?: string | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: WeatherRecord & { displayTime: string; fullTime: string };
  }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white/95 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200 shadow-lg text-xs space-y-2 min-w-[200px]">
      <div className="font-semibold text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between">
        <span>{data.fullTime}</span>
        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
          {data.source}
        </span>
      </div>
      <div className="space-y-1 text-slate-600">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Condition:</span>
          <span className="font-semibold text-slate-800">
            {data.weatherDescription || getWeatherCondition(data.weatherCode)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Temperature:</span>
          <span className="font-bold text-emerald-700 font-mono">{data.temperatureC}°C</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Rainfall:</span>
          <span className="font-semibold text-blue-600 font-mono">{data.rainfallMm} mm</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Humidity:</span>
          <span className="font-semibold text-slate-700 font-mono">{data.humidityPercent}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Wind Speed:</span>
          <span className="font-semibold text-slate-700 font-mono">{data.windSpeedKmh} km/h</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Wind Gust:</span>
          <span className="font-semibold text-slate-700 font-mono">{data.windGustKmh} km/h</span>
        </div>
      </div>
    </div>
  );
};

export const WeatherHistoryChart: React.FC<WeatherHistoryChartProps> = ({
  records,
  loading = false,
  error = null,
}) => {
  // Format data for chart
  const chartData = records.map((r) => {
    const d = new Date(r.observedAt);
    return {
      ...r,
      displayTime: d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      fullTime: d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    };
  });

  if (loading) {
    return (
      <div className="h-72 w-full flex flex-col items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3">
        <LoadingSpinner size="md" />
        <p className="text-xs font-medium text-slate-500">Loading historical weather observations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-72 w-full flex flex-col items-center justify-center p-6 bg-rose-50/50 rounded-2xl border border-rose-200/80 text-center space-y-2">
        <AlertCircle className="w-6 h-6 text-rose-600" />
        <p className="text-sm font-semibold text-rose-900">Unable to load weather trends</p>
        <p className="text-xs text-rose-700 max-w-md">{error}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="h-72 w-full flex flex-col items-center justify-center p-6 bg-slate-50/70 rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
        <CloudSun className="w-8 h-8 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">No historical weather observations found</p>
        <p className="text-xs text-slate-500 max-w-md">
          No records are stored in PostgreSQL for the selected date window. Click "Sync Weather" or broaden the date range above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.length === 1 && (
        <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span>
            Displaying 1 observation. Perform repeated or regular syncs to build a multi-point temperature and rainfall curve.
          </span>
        </div>
      )}

      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              angle={-25}
              textAnchor="end"
              height={50}
            />
            <YAxis
              unit="°C"
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
            />
            <Line
              type="monotone"
              dataKey="temperatureC"
              name="Temperature (°C)"
              stroke="#059669"
              strokeWidth={2.5}
              dot={{ r: records.length === 1 ? 5 : 3, fill: '#059669' }}
              activeDot={{ r: 6, fill: '#047857' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
