/**
 * Module 8/9: Producer Authentication Client Service
 * Dispatches mobile OTP requests and verification to backend API gateway.
 */

import { apiClient } from './api';
import { ApiResponse, SendOtpResponseData, VerifyOtpResponseData } from '../types';

export const authService = {
  /**
   * Request a 6-digit verification OTP sent to the farmer's registered phone number.
   * Calls POST /api/v1/auth/otp/send
   */
  async sendOtp(mobileNumber: string): Promise<ApiResponse<SendOtpResponseData>> {
    const response = await apiClient.post<ApiResponse<SendOtpResponseData>>(
      '/auth/otp/send',
      { mobileNumber: mobileNumber.trim() }
    );
    return response.data;
  },

  /**
   * Verify the 6-digit OTP and obtain a signed JWT Bearer token.
   * Calls POST /api/v1/auth/otp/verify
   */
  async verifyOtp(
    mobileNumber: string,
    otp: string
  ): Promise<ApiResponse<VerifyOtpResponseData>> {
    const response = await apiClient.post<ApiResponse<VerifyOtpResponseData>>(
      '/auth/otp/verify',
      {
        mobileNumber: mobileNumber.trim(),
        otp: otp.trim(),
      }
    );
    return response.data;
  },
};
