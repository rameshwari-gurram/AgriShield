/**
 * Module 8/9: Producer Authentication Client Service
 * Dispatches mobile & email OTP requests and verification to backend API gateway.
 */

import { apiClient } from './api';
import {
  ApiResponse,
  SendOtpResponseData,
  VerifyOtpResponseData,
  AdminLoginCredentials,
  AdminLoginResponseData,
} from '../types';

export const authService = {
  /**
   * Request a 6-digit verification OTP sent to the farmer's registered phone number or email address.
   * Calls POST /api/v1/auth/otp/send
   */
  async sendOtp(identifier: string): Promise<ApiResponse<SendOtpResponseData>> {
    const trimmed = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const payload = isEmail
      ? { email: trimmed.toLowerCase(), identifier: trimmed.toLowerCase() }
      : { mobileNumber: trimmed.replace(/\D/g, ''), identifier: trimmed.replace(/\D/g, '') };

    const response = await apiClient.post<ApiResponse<SendOtpResponseData>>(
      '/auth/otp/send',
      payload
    );
    return response.data;
  },

  /**
   * Verify the 6-digit OTP and obtain a signed JWT Bearer token.
   * Calls POST /api/v1/auth/otp/verify
   */
  async verifyOtp(
    identifier: string,
    otp: string
  ): Promise<ApiResponse<VerifyOtpResponseData>> {
    const trimmed = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const payload = isEmail
      ? { email: trimmed.toLowerCase(), identifier: trimmed.toLowerCase(), otp: otp.trim() }
      : { mobileNumber: trimmed.replace(/\D/g, ''), identifier: trimmed.replace(/\D/g, ''), otp: otp.trim() };

    const response = await apiClient.post<ApiResponse<VerifyOtpResponseData>>(
      '/auth/otp/verify',
      payload
    );
    return response.data;
  },

  /**
   * Request email link OTP to associate an email address with the active farmer session.
   * Calls POST /api/v1/auth/email/request-link
   */
  async requestEmailLink(email: string, token?: string): Promise<ApiResponse<any>> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    const response = await apiClient.post<ApiResponse<any>>(
      '/auth/email/request-link',
      { email: email.trim().toLowerCase() },
      config
    );
    return response.data;
  },

  /**
   * Confirm email link OTP to finalize associating email in PostgreSQL.
   * Calls POST /api/v1/auth/email/confirm-link
   */
  async confirmEmailLink(email: string, otp: string, token?: string): Promise<ApiResponse<any>> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    const response = await apiClient.post<ApiResponse<any>>(
      '/auth/email/confirm-link',
      { email: email.trim().toLowerCase(), otp: otp.trim() },
      config
    );
    return response.data;
  },

  /**
   * Authenticate administrator using username or email and password.
   * Calls POST /api/v1/auth/admin/login
   */
  async adminLogin(
    credentials: AdminLoginCredentials
  ): Promise<ApiResponse<AdminLoginResponseData>> {
    const payload = {
      username: credentials.username.trim(),
      password: credentials.password,
    };
    const response = await apiClient.post<ApiResponse<AdminLoginResponseData>>(
      '/auth/admin/login',
      payload
    );
    return response.data;
  },
};
