import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../utils/constants';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach headers or correlation IDs
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
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
