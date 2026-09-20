import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Activity, 
  Layers, 
  Cpu, 
  ArrowRight, 
  CheckCircle2,
  Server
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const workflowSteps = [
    { title: 'Farmer Registration', phase: 'Module 2' },
    { title: 'Farm & Boundary Polygons', phase: 'Module 2' },
    { title: 'Weather & Satellite Monitoring', phase: 'Module 3' },
    { title: 'AI Crop-Risk & SHAP Explainability', phase: 'Module 4' },
    { title: 'Parametric Rules & Automated Claims', phase: 'Module 5' },
    { title: 'Simulated Payout & Notifications', phase: 'Module 5' },
  ];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4" />
            Module 1: Production Monorepo Foundation
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            AI-Assisted Crop-Risk & <br />
            <span className="text-emerald-400">Parametric Insurance Platform</span>
          </h1>

          <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
            AgriShield Parametric automates insurance triggers using objective satellite NDVI indices, weather telemetry, and transparent ML risk models. Module 1 establishes the production monorepo architecture, microservice separation, security middleware, and diagnostic health probes.
          </p>

          <div className="pt-2 flex flex-wrap gap-4">
            <Link
              to="/health"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02]"
            >
              <Activity className="w-5 h-5" />
              View System Health
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Clean Architecture Stack Overview */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Monorepo Architecture</h2>
          <p className="text-slate-500 text-sm">Decoupled microservices built with clean architecture and strict separation of concerns.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Frontend Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">Frontend Client</h3>
              <p className="text-xs font-mono text-sky-600">React &bull; TypeScript &bull; Vite &bull; Tailwind</p>
            </div>
            <p className="text-sm text-slate-600">
              Single-page application featuring modular components, custom hooks, typed API services, and React-Leaflet/Recharts readiness.
            </p>
            <div className="pt-2 flex items-center gap-1 text-xs text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Axios Interceptors & Health Polling
            </div>
          </div>

          {/* Backend Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">Backend API Gateway</h3>
              <p className="text-xs font-mono text-emerald-600">Node.js &bull; Express &bull; TypeScript &bull; Prisma</p>
            </div>
            <p className="text-sm text-slate-600">
              Clean 3-tier architecture with thin controllers, business services, isolated repositories, Zod validation, Helmet security, and Winston logging.
            </p>
            <div className="pt-2 flex items-center gap-1 text-xs text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Clean PostgreSQL Prisma Foundation
            </div>
          </div>

          {/* ML Service Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">ML & Analytics Service</h3>
              <p className="text-xs font-mono text-purple-600">Python 3.11 &bull; FastAPI &bull; Pydantic</p>
            </div>
            <p className="text-sm text-slate-600">
              High-performance analytical microservice prepared for GeoPandas, Rasterio, Scikit-learn, and SHAP explainability pipelines.
            </p>
            <div className="pt-2 flex items-center gap-1 text-xs text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Dynamic Dependency Inspection Probe
            </div>
          </div>
        </div>
      </section>

      {/* Planned Roadmap */}
      <section className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Future Development Roadmap</h2>
          <p className="text-slate-500 text-sm">Target workflow milestones scheduled across subsequent modules.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowSteps.map((step, index) => (
            <div key={index} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                  {index + 1}
                </div>
                <span className="font-medium text-sm text-slate-800">{step.title}</span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                {step.phase}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
