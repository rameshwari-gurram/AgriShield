/**
 * Module 8/9: Producer Authentication & Session Context
 *
 * Manages active producer authentication state:
 * - Persists session token in sessionStorage (tab-scoped).
 * - Avoids logging or leaking tokens.
 * - Provides login, logout, and ownership verification helpers.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ProducerProfile, AuthContextType } from '../types';

const SESSION_STORAGE_KEY = 'agrishield_producer_session';

const defaultAuthContext: AuthContextType = {
  producerToken: null,
  activeProducer: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  isOwnerOfFarm: () => false,
};

export const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [producerToken, setProducerToken] = useState<string | null>(null);
  const [activeProducer, setActiveProducer] = useState<ProducerProfile | null>(null);

  // Rehydrate session from sessionStorage on mount (browser only)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.token && parsed?.farmer) {
            setProducerToken(parsed.token);
            setActiveProducer(parsed.farmer);
          }
        }
      }
    } catch {
      // Ignore corrupted session storage and reset
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, []);

  const login = (token: string, farmer: ProducerProfile) => {
    setProducerToken(token);
    setActiveProducer(farmer);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ token, farmer })
        );
      }
    } catch {
      // Storage unavailable or disabled
    }
  };

  const logout = () => {
    setProducerToken(null);
    setActiveProducer(null);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable
    }
  };

  const isOwnerOfFarm = (farmerId?: string | null): boolean => {
    if (!farmerId || !activeProducer) return false;
    return activeProducer.id === farmerId;
  };

  const value: AuthContextType = {
    producerToken,
    activeProducer,
    isAuthenticated: Boolean(producerToken && activeProducer),
    login,
    logout,
    isOwnerOfFarm,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  return useContext(AuthContext) || defaultAuthContext;
};
