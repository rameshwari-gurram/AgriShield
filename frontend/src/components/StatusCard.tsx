import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { ServiceCardProps } from '../types';

export const StatusCard: React.FC<ServiceCardProps> = ({
  name,
  role,
  status,
  latency,
  details,
  error,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Healthy
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Degraded
          </span>
        );
      case 'unhealthy':
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Offline / Unhealthy
          </span>
        );
      case 'loading':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <Clock className="w-3.5 h-3.5 animate-spin text-slate-500" />
            Probing...
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-base text-slate-900">{name}</h3>
          <p className="text-xs text-slate-500">{role}</p>
        </div>
        {getStatusBadge()}
      </div>

      <div className="space-y-2 text-xs border-t border-slate-100 pt-3 mt-2">
        {latency !== undefined && (
          <div className="flex justify-between items-center text-slate-600">
            <span className="text-slate-400">Response Latency:</span>
            <span className="font-mono font-medium text-slate-800">{latency} ms</span>
          </div>
        )}

        {details &&
          Object.entries(details).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center text-slate-600">
              <span className="capitalize text-slate-400">{key.replace(/([A-Z])/g, ' $1')}:</span>
              <span className="font-mono text-slate-700">{String(value)}</span>
            </div>
          ))}

        {error && (
          <div className="mt-2 p-2 rounded bg-rose-50 border border-rose-100 text-rose-700 text-xs break-all">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
