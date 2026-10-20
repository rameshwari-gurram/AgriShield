import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Activity, BookOpen, HeartHandshake } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto pt-10 pb-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Purpose */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center space-x-2 text-slate-900">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                <Shield className="w-4 h-4" />
              </div>
              <span className="font-bold text-base text-slate-900 tracking-tight">AgriShield Parametric</span>
            </div>
            <p className="text-slate-600 leading-relaxed max-w-md">
              Automated, hyper-local parametric crop protection. Protecting agricultural producers from extreme rainfall and climate events through transparent meteorological threshold monitoring.
            </p>
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium pt-1">
              <HeartHandshake className="w-4 h-4 text-emerald-600" />
              <span>Supporting farmer resilience across agricultural regions.</span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">Farm Management</h4>
            <ul className="space-y-1.5 text-slate-600">
              <li>
                <Link to="/" className="hover:text-emerald-700 transition">Dashboard Overview</Link>
              </li>
              <li>
                <Link to="/farms" className="hover:text-emerald-700 transition">My Farms Directory</Link>
              </li>
              <li>
                <Link to="/farms/register" className="hover:text-emerald-700 transition">Register New Farm</Link>
              </li>
              <li>
                <Link to="/farmers" className="hover:text-emerald-700 transition">Farmer Profiles</Link>
              </li>
            </ul>
          </div>

          {/* Risk & Intelligence */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">Risk & Monitoring</h4>
            <ul className="space-y-1.5 text-slate-600">
              <li>
                <Link to="/risk" className="hover:text-emerald-700 transition">Climate Risk & Alerts</Link>
              </li>
              <li>
                <Link to="/weather" className="hover:text-emerald-700 transition">Weather Observations</Link>
              </li>
              <li>
                <Link to="/assessments" className="hover:text-emerald-700 transition">Parametric Assessments</Link>
              </li>
              <li className="pt-2 border-t border-slate-100 flex items-center gap-3">
                <Link to="/health" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700 transition" title="System Health & Probes">
                  <Activity className="w-3.5 h-3.5" />
                  <span>System Health</span>
                </Link>
                <Link to="/docs" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700 transition" title="Technical Architecture Documentation">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Architecture Docs</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Regulatory Disclaimer & Copyright */}
        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <p className="text-slate-400 text-[11px] max-w-3xl leading-normal">
            Parametric weather indicators based on IMD meteorological standards. Rules define climate risk evaluation criteria and do not constitute formal insurance policy certificates or claim entitlements.
          </p>
          <div className="text-slate-400 whitespace-nowrap">
            &copy; {new Date().getFullYear()} AgriShield Platform. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};
