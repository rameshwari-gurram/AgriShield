/**
 * Stage 3 Step 1: Administrator Authentication Modal Dialog
 *
 * Provides a dedicated credential-entry modal for system administrators:
 * - Submits to POST /api/v1/auth/admin/login
 * - Captures username/email and password
 * - Initializes tab-scoped admin session via AuthContext
 * - Enforces zero credential or token leakage to logs
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, Lock, User, X, AlertCircle, ArrowRight } from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { AdminProfile } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';

export interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated?: (token: string, admin: AdminProfile) => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const { adminLogin } = useAuth();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent background page scrolling while modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Username or email is required.');
      return;
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setLoading(true);
      const res = await authService.adminLogin({
        username: trimmedUsername,
        password,
      });

      const { token, user } = res.data;
      adminLogin(token, user);

      if (onAuthenticated) {
        onAuthenticated(token, user);
      }

      // Reset fields and close
      setUsername('');
      setPassword('');
      setError(null);
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Administrative login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setError(null);
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200"
      data-testid="admin-auth-modal"
    >
      <div className="min-h-full flex justify-center items-start py-6 sm:py-10">
        <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-5rem)] overflow-hidden">
          {/* Pinned Accessible Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Administrator Sign In</h3>
                <p className="text-xs text-slate-500">AgriShield Underwriting & Governance Portal</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleLogin} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {error && (
            <div
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5"
              data-testid="admin-auth-error"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Username / Email Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Administrative Username or Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="agri_admin or admin@agrishield.com"
                disabled={loading}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                data-testid="admin-username-input"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={loading}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                data-testid="admin-password-input"
                required
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
            Administrative logins are secured with sliding-window rate limiting (max 5 attempts per 15 minutes) and timing-attack defenses.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md shadow-purple-900/10 transition disabled:opacity-50"
              data-testid="admin-login-submit-btn"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In as Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};
