import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../utils/constants';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Safely resolves the active authentication token from tab-scoped sessionStorage.
 * Strictly respects active role separation without mixing Farmer and Admin tokens.
 */
export function getActiveSessionToken(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const activeRole = window.sessionStorage.getItem('agrishield_active_role');

    if (activeRole === 'ADMIN') {
      const adminRaw = window.sessionStorage.getItem('agrishield_admin_session');
      if (adminRaw) {
        const parsed = JSON.parse(adminRaw);
        if (parsed?.token && typeof parsed.token === 'string') {
          return parsed.token;
        }
      }
    } else if (activeRole === 'FARMER') {
      const producerRaw = window.sessionStorage.getItem('agrishield_producer_session');
      if (producerRaw) {
        const parsed = JSON.parse(producerRaw);
        if (parsed?.token && typeof parsed.token === 'string') {
          return parsed.token;
        }
      }
    } else {
      // Fallback: Check admin session first, then producer session
      const adminRaw = window.sessionStorage.getItem('agrishield_admin_session');
      if (adminRaw) {
        const parsed = JSON.parse(adminRaw);
        if (parsed?.token && typeof parsed.token === 'string') {
          return parsed.token;
        }
      }
      const producerRaw = window.sessionStorage.getItem('agrishield_producer_session');
      if (producerRaw) {
        const parsed = JSON.parse(producerRaw);
        if (parsed?.token && typeof parsed.token === 'string') {
          return parsed.token;
        }
      }
    }
  } catch {
    // Gracefully handle storage errors or corrupted JSON without throwing
  }

  return null;
}

/**
 * Identifies public endpoints that should remain unauthenticated.
 */
function isPublicEndpoint(url: string = ''): boolean {
  const cleanUrl = url.split('?')[0];
  return (
    cleanUrl.includes('/auth/otp/send') ||
    cleanUrl.includes('/auth/otp/verify') ||
    cleanUrl.includes('/auth/admin/login') ||
    cleanUrl === '/health' ||
    cleanUrl.startsWith('/health/') ||
    cleanUrl === '/risk-rules'
  );
}

// Request Interceptor: Attach headers, correlation IDs, and active session Bearer token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.headers['X-Requested-With'] = 'XMLHttpRequest';

    // Do not attach token to public endpoints or if an Authorization header was already explicitly provided
    const hasExplicitAuth = Boolean(config.headers.Authorization || config.headers['authorization']);
    const isPublic = isPublicEndpoint(config.url);

    if (!hasExplicitAuth && !isPublic) {
      const token = getActiveSessionToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Standardize error formatting
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      console.error(`API Error [${error.response.status}]:`, error.response.data);
    } else if (error.request) {
      console.error('API Error: No response received from server', error.message);
    } else {
      console.error('API Error Setup:', error.message);
    }
    return Promise.reject(error);
  }
);
