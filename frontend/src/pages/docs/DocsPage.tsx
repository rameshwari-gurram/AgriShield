import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Layers,
  Server,
  Cpu,
  Activity,
  CheckCircle2,
  ArrowRight,
  Terminal,
} from 'lucide-react';

export const DocsPage: React.FC = () => {
  const workflowSteps = [
    { title: 'Monorepo & Diagnostic Foundation', phase: 'Module 1', status: 'Completed' },
    { title: 'Farmer Registration & Identification', phase: 'Module 2', status: 'Completed' },
    { title: 'Farm Management & Spatial Boundaries', phase: 'Module 3 & 4', status: 'Completed' },
    { title: 'Weather Telemetry & Aggregation', phase: 'Module 5', status: 'Completed' },
    { title: 'Climate Risk Rule Engine & Provenance', phase: 'Module 6 (Stage 1-5)', status: 'Completed' },
    { title: 'Portfolio Risk Summary & Rule Transparency', phase: 'Module 6 (Stage 6)', status: 'Completed' },
    { title: 'Copernicus Sentinel-2 Satellite & NDVI Tracking', phase: 'Module 7', status: 'Completed' },
    { title: 'Advisory ML Risk Prediction & SHAP Explainability', phase: 'Module 8', status: 'Completed' },
    { title: 'Parametric Policy Underwriting & Claims Settlement', phase: 'Module 9', status: 'Completed' },
    { title: 'End-to-End System Integration & Audit', phase: 'Module 10', status: 'In Progress' },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 mb-2">
            <BookOpen className="w-3.5 h-3.5" />
            Developer & Engineering Reference
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            System Architecture & Documentation
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Technical foundation, microservice topology, inter-service contracts, and diagnostic probes.
          </p>
        </div>

        <Link
          to="/health"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition self-start sm:self-auto"
        >
          <Activity className="w-4 h-4" />
          <span>Launch Health Probes</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Monorepo Architecture Stack */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Monorepo Architecture</h2>
          <p className="text-slate-500 text-xs">
            Decoupled services built with clean architecture and strict separation of concerns.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Frontend Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Frontend Client</h3>
              <p className="text-xs font-mono text-sky-600 mt-0.5">React 18 &bull; TypeScript &bull; Vite &bull; Tailwind</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Single-page application featuring modular components, custom hooks, typed API services, React-Leaflet spatial mapping, and Recharts telemetry graphs.
            </p>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Axios Interceptors & Diagnostic Polling</span>
            </div>
          </div>

          {/* Backend Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Backend API Gateway</h3>
              <p className="text-xs font-mono text-emerald-600 mt-0.5">Node.js &bull; Express &bull; TypeScript &bull; Prisma</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Clean 3-tier architecture with thin controllers, business services, isolated repositories, Zod parameter validation, Helmet security, and Winston logging.
            </p>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>PostgreSQL &bull; Port 5000</span>
            </div>
          </div>

          {/* ML Service Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">ML & Analytics Service</h3>
              <p className="text-xs font-mono text-purple-600 mt-0.5">Python 3.11 &bull; FastAPI &bull; Pydantic</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Analytical microservice prepared for GeoPandas, Rasterio, Scikit-learn, and SHAP explainability pipelines for satellite NDVI index tracking.
            </p>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>FastAPI &bull; Port 8000</span>
            </div>
          </div>
        </div>
      </section>

      {/* Engineering Roadmap */}
      <section className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Development Roadmap & Implementation Modules</h2>
          <p className="text-slate-500 text-xs">Milestone progress across the AgriShield Parametric platform.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {workflowSteps.map((step, index) => (
            <div key={index} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                  {step.phase}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    step.status === 'Completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {step.status}
                </span>
              </div>
              <span className="font-semibold text-xs text-slate-800 leading-snug">{step.title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Documentation Files Reference */}
      <section className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-sm tracking-tight">Technical Reference Files in Repository</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 font-mono">
            <span className="text-emerald-400 font-bold">docs/architecture.md</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">Core monorepo architecture and data flows</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 font-mono">
            <span className="text-emerald-400 font-bold">docs/api_weather.md</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">Open-Meteo telemetry & farm centroid tracking</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 font-mono">
            <span className="text-emerald-400 font-bold">docs/module6_risk_rules.md</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">IMD active parametric rainfall hazard rules</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 font-mono">
            <span className="text-emerald-400 font-bold">docs/module6_portfolio_alerts.md</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">Portfolio risk metrics & invariant aggregation</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 font-mono">
            <span className="text-emerald-400 font-bold">docs/module9_parametric_policy_claims.md</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">Policy underwriting & automated claim lifecycle</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 font-mono">
            <span className="text-emerald-400 font-bold">docs/module9_demo_runbook.md</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">Parametric lifecycle runbook & validation</p>
          </div>
        </div>
      </section>
    </div>
  );
};
