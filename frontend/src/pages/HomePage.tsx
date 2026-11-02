/**
 * AgriShield Stage 3: Dynamic Role-Aware Home & Dashboard Routing
 *
 * Route behavior:
 * 1. Authenticated Farmer: Renders dedicated FarmerDashboardPage (scoped to farmer's holdings).
 * 2. Authenticated Admin: Displays Administrator overview with quick links to governance tools.
 * 3. Unauthenticated Visitor: Displays Public Welcome Portal with clear OTP and Admin login triggers,
 *    without dispatching any protected API requests.
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  CloudSun,
  FileCheck2,
  BookOpen,
  LogIn,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FarmerDashboardPage } from './dashboard/FarmerDashboardPage';
import { AdminDashboardPage } from './dashboard/AdminDashboardPage';
import { ProducerAuthModal } from '../components/auth/ProducerAuthModal';
import { AdminAuthModal } from '../components/auth/AdminAuthModal';
import { RiskRuleCatalogModal } from '../components/risk/RiskRuleCatalogModal';
import { Farm, PolicyWithFarm, ClaimWithFarm, Farmer, PortfolioRiskSummaryDTO } from '../types';

export interface HomePageProps {
  initialFarmerFarms?: Farm[];
  initialFarmerPolicies?: PolicyWithFarm[];
  initialFarmerClaims?: ClaimWithFarm[];
  initialFarmerLoading?: boolean;
  initialAdminFarmers?: Farmer[];
  initialAdminFarms?: Farm[];
  initialAdminPolicies?: PolicyWithFarm[];
  initialAdminClaims?: ClaimWithFarm[];
  initialAdminSummary?: PortfolioRiskSummaryDTO | null;
  initialAdminLoading?: boolean;
  initialAdminError?: string | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  initialFarmerFarms,
  initialFarmerPolicies,
  initialFarmerClaims,
  initialFarmerLoading,
  initialAdminFarmers,
  initialAdminFarms,
  initialAdminPolicies,
  initialAdminClaims,
  initialAdminSummary,
  initialAdminLoading,
  initialAdminError,
}) => {
  const { isAuthenticated, isFarmer, isAdmin } = useAuth();
  const [producerModalOpen, setProducerModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);

  // 1. Authenticated Farmer: render dedicated Farmer Dashboard
  if (isAuthenticated && isFarmer) {
    return (
      <FarmerDashboardPage
        initialFarms={initialFarmerFarms}
        initialPolicies={initialFarmerPolicies}
        initialClaims={initialFarmerClaims}
        initialLoading={initialFarmerLoading}
      />
    );
  }

  // 2. Authenticated Admin: render Administrator Session View / Dashboard
  if (isAuthenticated && isAdmin) {
    return (
      <AdminDashboardPage
        initialFarmers={initialAdminFarmers}
        initialFarms={initialAdminFarms}
        initialPolicies={initialAdminPolicies}
        initialClaims={initialAdminClaims}
        initialSummary={initialAdminSummary}
        initialLoading={initialAdminLoading}
        initialError={initialAdminError}
      />
    );
  }

  // 3. Unauthenticated Public Visitor: prompt to authenticate without making protected API calls
  return (
    <div className="space-y-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" data-testid="unauth-home-view">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 rounded-3xl p-6 sm:p-12 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>AgriShield Parametric Insurance Platform</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Protecting Crops with <br />
            <span className="text-emerald-400">Automated Parametric Climate Shield</span>
          </h1>

          <p className="text-emerald-100/90 text-sm sm:text-base leading-relaxed">
            Real-time hyper-local weather telemetry, Copernicus Sentinel-2 satellite crop health tracking, deterministic rule triggers, and automated payouts for verified producers.
          </p>

          {/* Action Row */}
          <div className="pt-2 flex flex-wrap gap-4">
            <button
              onClick={() => setProducerModalOpen(true)}
              data-testid="farmer-signin-cta"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg transition-all hover:scale-[1.02]"
            >
              <LogIn className="w-4 h-4" />
              <span>Farmer Sign In with OTP</span>
            </button>
            <button
              onClick={() => setAdminModalOpen(true)}
              data-testid="admin-signin-cta"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs uppercase tracking-wider backdrop-blur-sm border border-white/20 transition-all"
            >
              <span>Administrator Portal</span>
            </button>
            <button
              onClick={() => setCatalogModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs uppercase tracking-wider backdrop-blur-sm border border-white/20 transition-all"
            >
              <BookOpen className="w-4 h-4 text-emerald-300" />
              <span>Parametric Rules</span>
            </button>
          </div>
        </div>
      </section>

      {/* Value Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CloudSun className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Hyper-Local Weather Telemetry</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Continuous environmental monitoring at hourly granularity, measuring precipitation, temperature, wind gusts, and humidity directly over farm parcel coordinates.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Sentinel-2 Satellite & NDVI</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Copernicus European Space Agency multispectral satellite imagery provides objective vegetation health indices (NDVI) to detect crop stress and flood extent.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Deterministic Parametric Payouts</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Transparent, tamper-proof Module 6 parametric rules automatically verify breaches without manual loss adjustment or prolonged claims processing.
          </p>
        </div>
      </div>

      {/* Modals */}
      <ProducerAuthModal
        isOpen={producerModalOpen}
        onClose={() => setProducerModalOpen(false)}
      />
      <AdminAuthModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />
      <RiskRuleCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />
    </div>
  );
};
