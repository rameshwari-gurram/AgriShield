import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Activity, BookOpen, Layers, Users } from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg text-slate-900 flex items-center gap-1.5">
                AgriShield
                <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold tracking-wider">
                  Parametric
                </span>
              </div>
              <div className="text-xs text-slate-500">Crop-Risk & Parametric Insurance</div>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 sm:space-x-4">
            <Link
              to="/"
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/')
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Overview</span>
            </Link>

            <Link
              to="/farmers"
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname.startsWith('/farmers')
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Farmers</span>
            </Link>

            <Link
              to="/health"
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/health')
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>System Health</span>
            </Link>

            <a
              href="#docs"
              onClick={(e) => {
                e.preventDefault();
                alert('Architecture docs are available in docs/architecture.md and the root README.md');
              }}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>Docs</span>
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
};
