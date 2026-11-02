import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Sprout,
  ShieldAlert,
  CloudRain,
  ClipboardCheck,
  Users,
  Activity,
  BookOpen,
  Menu,
  X,
  Server,
  Plus,
  Receipt,
  LogIn,
  LogOut,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ProducerAuthModal } from './auth/ProducerAuthModal';
import { AdminAuthModal } from './auth/AdminAuthModal';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [systemDropdownOpen, setSystemDropdownOpen] = useState(false);
  const [producerAuthModalOpen, setProducerAuthModalOpen] = useState(false);
  const [adminAuthModalOpen, setAdminAuthModalOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navLinks = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'My Farms', path: '/farms', icon: Sprout },
    { name: 'Policies', path: '/policies', icon: Shield },
    { name: 'Claims', path: '/claims', icon: Receipt },
    { name: 'Risk & Alerts', path: '/risk', icon: ShieldAlert },
    { name: 'Weather', path: '/weather', icon: CloudRain },
    { name: 'Assessments', path: '/assessments', icon: ClipboardCheck },
    { name: 'Farmers', path: '/farmers', icon: Users, adminOnly: true },
  ];

  // Hide admin-only routes from unauthenticated visitors and farmers
  const visibleNavLinks = navLinks.filter((item) => {
    if (item.adminOnly) {
      return isAdmin;
    }
    return true;
  });

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center space-x-3 group flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-md shadow-emerald-900/10 group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="font-extrabold text-lg text-slate-900 flex items-center gap-1.5 tracking-tight">
                AgriShield
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold tracking-wider">
                  Parametric
                </span>
              </div>
              <div className="text-[11px] text-slate-500 -mt-0.5">Crop Climate Protection</div>
            </div>
          </Link>

          {/* Desktop Primary Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-0.5 xl:space-x-1">
            {visibleNavLinks.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-center space-x-1.5 px-2 xl:px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold transition-all ${
                    active
                      ? 'bg-emerald-50 text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="hidden sm:flex items-center space-x-2">
            {/* Quick Add Farm Button */}
            <Link
              to="/farms/register"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Farm</span>
            </Link>

            {/* Authentication Controls */}
            {isAuthenticated ? (
              <div className="flex items-center space-x-2 pl-1 border-l border-slate-200">
                {/* User & Role Indicator */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800">
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                    data-testid="navbar-role-badge"
                  >
                    {isAdmin ? 'Admin' : 'Farmer'}
                  </span>
                  <span className="truncate max-w-[120px] font-medium text-slate-700" data-testid="navbar-user-name">
                    {user?.fullName || (user as any)?.username || 'User'}
                  </span>
                </div>

                {/* Sign Out Button */}
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 transition"
                  data-testid="navbar-logout-btn"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 pl-1 border-l border-slate-200">
                {/* Farmer Sign In */}
                <button
                  onClick={() => setProducerAuthModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 text-slate-700 text-xs font-semibold transition"
                  data-testid="navbar-farmer-signin-btn"
                >
                  <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Farmer Login</span>
                </button>

                {/* Admin Sign In */}
                <button
                  onClick={() => setAdminAuthModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-purple-700 hover:bg-purple-50 hover:border-purple-200 text-xs font-semibold transition"
                  data-testid="navbar-admin-signin-btn"
                  title="Administrative Sign In"
                >
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <span>Admin</span>
                </button>
              </div>
            )}

            {/* Discreet Secondary Developer / System Menu */}
            <div className="relative">
              <button
                onClick={() => setSystemDropdownOpen(!systemDropdownOpen)}
                className={`p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition ${
                  systemDropdownOpen || location.pathname === '/health' || location.pathname === '/docs'
                    ? 'bg-slate-100 text-slate-800'
                    : ''
                }`}
                title="System Diagnostic & Documentation"
                aria-label="Developer & System Tools"
              >
                <Server className="w-4 h-4" />
              </button>

              {systemDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSystemDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3.5 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Technical & System
                    </div>
                    <Link
                      to="/health"
                      onClick={() => setSystemDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition"
                    >
                      <Activity className="w-4 h-4 text-emerald-600" />
                      <div>
                        <div className="font-semibold">System Health</div>
                        <div className="text-[10px] text-slate-400">Inter-service diagnostic probes</div>
                      </div>
                    </Link>
                    <Link
                      to="/docs"
                      onClick={() => setSystemDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition"
                    >
                      <BookOpen className="w-4 h-4 text-sky-600" />
                      <div>
                        <div className="font-semibold">Architecture Docs</div>
                        <div className="text-[10px] text-slate-400">Monorepo & microservices</div>
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center lg:hidden space-x-2">
            <Link
              to="/farms/register"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold sm:hidden"
            >
              <Plus className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6 text-slate-700" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200/80 bg-white px-4 pt-3 pb-6 space-y-4">
          {/* Mobile Auth Banner */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            {isAuthenticated ? (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isAdmin ? 'Admin' : 'Farmer'}
                    </span>
                    <span className="font-bold text-xs text-slate-900">
                      {user?.fullName || (user as any)?.username}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">Active Session</div>
                </div>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setProducerAuthModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Farmer Login</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAdminAuthModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-200 text-slate-800 text-xs font-semibold"
                >
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <span>Admin Login</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            {visibleNavLinks.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Mobile Secondary System Links */}
          <div className="pt-3 border-t border-slate-100 space-y-1">
            <div className="px-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Technical & Probes
            </div>
            <Link
              to="/health"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>System Health & Diagnostics</span>
            </Link>
            <Link
              to="/docs"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              <span>Architecture Documentation</span>
            </Link>
          </div>
        </div>
      )}
    </header>

    {/* Global Modals */}
    <ProducerAuthModal
      isOpen={producerAuthModalOpen}
      onClose={() => setProducerAuthModalOpen(false)}
    />
    <AdminAuthModal
      isOpen={adminAuthModalOpen}
      onClose={() => setAdminAuthModalOpen(false)}
    />
  </>
  );
};
