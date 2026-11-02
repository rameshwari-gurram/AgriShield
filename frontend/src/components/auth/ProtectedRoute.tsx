/**
 * AgriShield Stage 3: Protected Route Guard
 *
 * Enforces role-based route access on the frontend:
 * - Unauthenticated visitors are prompted to sign in with an OTP / Admin modal trigger.
 * - Authenticated users with the wrong role (e.g. FARMER accessing /farmers) are denied access with HTTP 403-equivalent UI.
 * - Zero protected API requests are dispatched by child components when unauthorized.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Lock, ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProducerAuthModal } from './ProducerAuthModal';
import { AdminAuthModal } from './AdminAuthModal';
import { UserRole } from '../../types';

export interface ProtectedRouteProps {
  requiredRole?: UserRole;
  children: React.ReactElement;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredRole,
  children,
}) => {
  const { isAuthenticated, role, user } = useAuth();

  const [producerModalOpen, setProducerModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  // 1. Unauthenticated state: display prompt instead of running protected code
  if (!isAuthenticated) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center p-4"
        data-testid="protected-auth-prompt"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">
              Authentication Required
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {requiredRole === 'ADMIN'
                ? 'Access to administrative resources requires an active administrator session.'
                : 'Access to your agricultural holdings, risk assessments, and policies requires an active farmer session.'}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {requiredRole === 'ADMIN' ? (
              <button
                onClick={() => setAdminModalOpen(true)}
                data-testid="open-admin-auth-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs uppercase tracking-wider transition shadow-md shadow-purple-900/10"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In as Administrator</span>
              </button>
            ) : (
              <button
                onClick={() => setProducerModalOpen(true)}
                data-testid="open-farmer-auth-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition shadow-md shadow-emerald-900/10"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In with OTP</span>
              </button>
            )}

            <Link
              to="/"
              className="inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Public Portal</span>
            </Link>
          </div>

          <ProducerAuthModal
            isOpen={producerModalOpen}
            onClose={() => setProducerModalOpen(false)}
          />
          <AdminAuthModal
            isOpen={adminModalOpen}
            onClose={() => setAdminModalOpen(false)}
          />
        </div>
      </div>
    );
  }

  // 2. Role mismatch (e.g. FARMER accessing ADMIN-only route like /farmers)
  if (requiredRole && role !== requiredRole) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center p-4"
        data-testid="protected-role-forbidden"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 shadow-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 uppercase tracking-wider">
              HTTP 403 Forbidden
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Access Denied
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {requiredRole === 'ADMIN'
                ? `Administrative privileges are required to view this page. Your current session has the ${role} role.`
                : `Farmer privileges are required to view this page. Your current session has the ${role} role.`}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-700">Authenticated Session:</div>
            <div>Identity: <span className="font-mono text-slate-900">{(user as any)?.username || (user as any)?.fullName || user?.id}</span></div>
            <div>Active Role: <span className="font-bold text-slate-900">[{role}]</span></div>
          </div>

          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs tracking-wide transition shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authorized
  return children;
};
