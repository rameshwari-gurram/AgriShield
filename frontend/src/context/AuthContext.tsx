/**
 * Module 8/9 & Stage 3: Unified Producer & Administrator Authentication Context
 *
 * Manages active farmer and admin authentication state:
 * - Persists session tokens in sessionStorage (tab-scoped).
 * - Avoids logging or leaking tokens.
 * - Provides login, adminLogin, logout, and ownership verification helpers.
 * - Guarantees strict two-role separation ('FARMER' | 'ADMIN') without credential mixing.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  ProducerProfile,
  AdminProfile,
  AuthUser,
  UserRole,
  AuthContextType,
} from '../types';

export const SESSION_STORAGE_KEY = 'agrishield_producer_session';
export const ADMIN_STORAGE_KEY = 'agrishield_admin_session';
export const ACTIVE_ROLE_KEY = 'agrishield_active_role';

const defaultAuthContext: AuthContextType = {
  token: null,
  user: null,
  role: null,
  isAuthenticated: false,
  isAdmin: false,
  isFarmer: false,

  producerToken: null,
  activeProducer: null,
  login: () => {},
  isOwnerOfFarm: () => false,

  adminToken: null,
  activeAdmin: null,
  adminLogin: () => {},

  logout: () => {},
};

export const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [producerToken, setProducerToken] = useState<string | null>(null);
  const [activeProducer, setActiveProducer] = useState<ProducerProfile | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [activeAdmin, setActiveAdmin] = useState<AdminProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);

  // Rehydrate sessions from sessionStorage on mount (browser only)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        // 1. Rehydrate Producer session
        const rawProducer = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (rawProducer) {
          const parsed = JSON.parse(rawProducer);
          if (parsed?.token && parsed?.farmer) {
            setProducerToken(parsed.token);
            setActiveProducer(parsed.farmer);
          }
        }

        // 2. Rehydrate Admin session
        const rawAdmin = window.sessionStorage.getItem(ADMIN_STORAGE_KEY);
        if (rawAdmin) {
          const parsed = JSON.parse(rawAdmin);
          if (parsed?.token && parsed?.user) {
            setAdminToken(parsed.token);
            setActiveAdmin(parsed.user);
          }
        }

        // 3. Rehydrate Active Role
        const rawRole = window.sessionStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
        if (rawRole === 'ADMIN' || rawRole === 'FARMER') {
          setActiveRole(rawRole);
        }
      }
    } catch {
      // Ignore corrupted session storage and reset safely
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
        window.sessionStorage.removeItem(ACTIVE_ROLE_KEY);
      }
    }
  }, []);

  const login = (token: string, farmer: ProducerProfile) => {
    setProducerToken(token);
    setActiveProducer(farmer);
    setActiveRole('FARMER');
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ token, farmer })
        );
        window.sessionStorage.setItem(ACTIVE_ROLE_KEY, 'FARMER');
      }
    } catch {
      // Storage unavailable or disabled
    }
  };

  const adminLogin = (token: string, admin: AdminProfile) => {
    setAdminToken(token);
    setActiveAdmin(admin);
    setActiveRole('ADMIN');
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(
          ADMIN_STORAGE_KEY,
          JSON.stringify({ token, user: admin })
        );
        window.sessionStorage.setItem(ACTIVE_ROLE_KEY, 'ADMIN');
      }
    } catch {
      // Storage unavailable or disabled
    }
  };

  const logout = () => {
    setProducerToken(null);
    setActiveProducer(null);
    setAdminToken(null);
    setActiveAdmin(null);
    setActiveRole(null);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
        window.sessionStorage.removeItem(ACTIVE_ROLE_KEY);
      }
    } catch {
      // Storage unavailable
    }
  };

  // Derive active role and token
  const effectiveRole: UserRole | null =
    activeRole || (adminToken && activeAdmin ? 'ADMIN' : producerToken && activeProducer ? 'FARMER' : null);

  const effectiveToken: string | null =
    effectiveRole === 'ADMIN' ? adminToken : effectiveRole === 'FARMER' ? producerToken : null;

  const effectiveUser: AuthUser | null =
    effectiveRole === 'ADMIN'
      ? activeAdmin
      : effectiveRole === 'FARMER' && activeProducer
      ? { ...activeProducer, role: 'FARMER' }
      : null;

  const isOwnerOfFarm = (farmerId?: string | null): boolean => {
    if (!farmerId) return false;
    // Admin role has global administrative access across all farm parcels
    if (effectiveRole === 'ADMIN' && adminToken) return true;
    if (!activeProducer) return false;
    return activeProducer.id === farmerId;
  };

  const value: AuthContextType = {
    // Unified session state
    token: effectiveToken,
    user: effectiveUser,
    role: effectiveRole,
    isAuthenticated: Boolean(effectiveToken && effectiveUser),
    isAdmin: effectiveRole === 'ADMIN',
    isFarmer: effectiveRole === 'FARMER',

    // Producer session state (100% backward compatible)
    producerToken,
    activeProducer,
    login,
    isOwnerOfFarm,

    // Admin session state
    adminToken,
    activeAdmin,
    adminLogin,

    // Unified logout
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  return useContext(AuthContext) || defaultAuthContext;
};
