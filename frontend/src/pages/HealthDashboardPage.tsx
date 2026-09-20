import React from 'react';
import { RefreshCw, Activity, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { StatusCard } from '../components/StatusCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { formatUptime, formatTimestamp } from '../utils/formatters';

export const HealthDashboardPage: React.FC = () => {
  const { data, loading, error, lastUpdated, refetch } = useHealthCheck(true);

  const getSystemStatusSummary = () => {
    if (loading && !data) {
      return {
        label: 'Probing Services...',
        color: 'bg-slate-100 text-slate-700 border-slate-200',
        icon: LoadingSpinner,
      };
    }
    if (error || !data) {
      return {
        label: 'Backend Disconnected',
        color: 'bg-rose-100 text-rose-800 border-rose-200',
        icon: XCircle,
      };
    }
    if (data.status === 'healthy') {
      return {
        label: 'All Systems Operational',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: CheckCircle2,
      };
    }
    return {
      label: 'System Degraded',
      color: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: AlertTriangle,
    };
  };

  const summary = getSystemStatusSummary();
  const SummaryIcon = summary.icon;

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            System Health & Architecture Probes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time diagnostic telemetry verifying inter-service connectivity across the monorepo.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-xs text-slate-400 text-right hidden sm:block">
            Auto-refreshing every 10s<br />
            Last checked: <span className="font-mono text-slate-600">{formatTimestamp(lastUpdated?.toISOString())}</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Health Banner */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between ${summary.color}`}>
        <div className="flex items-center space-x-3">
          <SummaryIcon className="w-6 h-6 flex-shrink-0" />
          <div>
            <div className="font-bold text-sm sm:text-base">{summary.label}</div>
            <div className="text-xs opacity-90">
              {data ? `Node API Uptime: ${formatUptime(data.uptime)} | Version ${data.version}` : 'Waiting for backend response'}
            </div>
          </div>
        </div>

        <div className="text-xs font-mono px-3 py-1 bg-white/60 rounded-full">
          Module 1 Foundation
        </div>
      </div>

      {/* Service Diagnostics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. Frontend */}
        <StatusCard
          name="Frontend SPA"
          role="React &bull; Vite &bull; Tailwind"
          status="healthy"
          details={{
            Environment: import.meta.env.MODE,
            Framework: 'React 18',
            Port: '5173',
          }}
        />

        {/* 2. Backend REST API */}
        <StatusCard
          name="Backend Gateway"
          role="Node.js &bull; Express &bull; TypeScript"
          status={error ? 'offline' : data ? data.status : 'loading'}
          details={{
            Uptime: data ? formatUptime(data.uptime) : undefined,
            Version: data?.version || '1.0.0',
            Port: '5000',
          }}
          error={error || undefined}
        />

        {/* 3. PostgreSQL Database */}
        <StatusCard
          name="PostgreSQL Database"
          role="Prisma ORM &bull; PostgreSQL 16"
          status={
            error
              ? 'offline'
              : data?.database.connected
              ? 'healthy'
              : 'unhealthy'
          }
          latency={data?.database.latencyMs}
          details={{
            Engine: 'PostgreSQL 16',
            Heartbeat: data?.database.connected ? 'Active (SELECT 1)' : 'Disconnected',
          }}
          error={data?.database.error}
        />

        {/* 4. Python ML Service */}
        <StatusCard
          name="ML Analytics Service"
          role="Python &bull; FastAPI &bull; Pydantic"
          status={
            error
              ? 'offline'
              : data?.mlService.reachable
              ? 'healthy'
              : 'degraded'
          }
          latency={data?.mlService.latencyMs}
          details={{
            Service: 'FastAPI',
            Port: '8000',
            Status: data?.mlService.status || (data?.mlService.reachable ? 'Online' : 'Pending start'),
          }}
          error={data?.mlService.error}
        />
      </div>

      {/* Informational Architecture Callout */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 text-sky-900 flex items-start space-x-4">
        <Info className="w-6 h-6 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <div className="font-semibold text-sky-950">How Diagnostics Flow</div>
          <p className="text-sky-800 text-xs leading-relaxed">
            The frontend makes a single unified request to Node.js (<code className="bg-sky-100 px-1 py-0.5 rounded text-sky-900">GET /api/v1/health</code>). The Node.js service performs a lightweight raw database heartbeat (<code className="bg-sky-100 px-1 py-0.5 rounded text-sky-900">SELECT 1</code>) via the repository layer and pings the Python ML service (<code className="bg-sky-100 px-1 py-0.5 rounded text-sky-900">GET /api/v1/health</code>). If the Python service or database is not started, the backend reports a graceful <code className="bg-sky-100 px-1 py-0.5 rounded text-sky-900">degraded</code> status without crashing.
          </p>
        </div>
      </div>
    </div>
  );
};
