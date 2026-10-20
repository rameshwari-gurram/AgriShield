/**
 * Module 8/9: Producer Authentication Modal Dialog
 *
 * Interactive 2-step modal for Mobile OTP verification:
 * Step 1: Mobile number entry & OTP dispatch
 * Step 2: 6-digit code verification and producer session initialization
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  ArrowRight,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { ProducerProfile } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';

export interface ProducerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated?: (token: string, farmer: ProducerProfile) => void;
  defaultMobileNumber?: string;
  suggestedProducerName?: string;
}

export const ProducerAuthModal: React.FC<ProducerAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
  defaultMobileNumber = '',
  suggestedProducerName,
}) => {
  const { login } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [mobileNumber, setMobileNumber] = useState<string>(defaultMobileNumber);
  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedMobile, setMaskedMobile] = useState<string>('');
  const [cooldown, setCooldown] = useState<number>(0);

  // Synchronize default mobile number when opened
  useEffect(() => {
    if (isOpen) {
      if (defaultMobileNumber) {
        setMobileNumber(defaultMobileNumber.replace(/\D/g, '').slice(-10));
      }
      setOtp('');
      setError(null);
      setStep('phone');
    }
  }, [isOpen, defaultMobileNumber]);

  // Cooldown timer ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  if (!isOpen) return null;

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const clean = mobileNumber.replace(/\D/g, '');
    if (clean.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setLoading(true);
      const res = await authService.sendOtp(clean);
      setMaskedMobile(res.data.maskedMobile);
      setCooldown(res.data.cooldownSeconds || 60);
      setStep('otp');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to send verification code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      const cleanMobile = mobileNumber.replace(/\D/g, '');
      const res = await authService.verifyOtp(cleanMobile, cleanOtp);

      // Initialize session in AuthContext
      login(res.data.token, res.data.farmer);

      if (onAuthenticated) {
        onAuthenticated(res.data.token, res.data.farmer);
      }

      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Verification failed. Please check the code and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="producer-auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="auth-modal-title" className="text-lg font-black text-slate-900">
                Producer Authentication
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Verify mobile number to access confidential policies & predictions
              </p>
            </div>
          </div>
        </div>

        {/* Suggested Producer Callout (if viewing a specific farm) */}
        {suggestedProducerName && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5">
            <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              Target Parcel Owner: <strong className="font-semibold text-slate-900">{suggestedProducerName}</strong>
            </span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            data-testid="auth-modal-error"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Phone Number Entry */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="mobile-input" className="block text-xs font-bold text-slate-700">
                Registered Mobile Number
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  +91
                </span>
                <input
                  id="mobile-input"
                  data-testid="auth-mobile-input"
                  type="tel"
                  maxLength={10}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm font-semibold tracking-wide text-slate-900 placeholder:text-slate-400"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Enter the 10-digit mobile number linked to the producer account.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <span>Security Notice</span>
              </div>
              <p className="leading-relaxed">
                One-time passwords are valid for 5 minutes with a maximum of 3 verification attempts per challenge.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || mobileNumber.replace(/\D/g, '').length !== 10}
              data-testid="auth-send-otp-btn"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-wide uppercase transition shadow-md shadow-emerald-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="text-white" />
                  <span>Dispatching Code...</span>
                </>
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: 6-Digit OTP Entry */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="otp-input" className="block text-xs font-bold text-slate-700">
                  6-Digit Verification Code
                </label>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-[11px] text-emerald-700 hover:underline font-semibold"
                >
                  Change Number
                </button>
              </div>

              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="otp-input"
                  data-testid="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center tracking-[0.5em] text-lg font-mono font-bold text-slate-900 placeholder:text-slate-300"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Code sent to {maskedMobile}</span>
                {cooldown > 0 ? (
                  <span className="text-slate-400 font-mono">Resend in {cooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={loading}
                    className="text-emerald-700 hover:underline font-bold"
                  >
                    Resend Code
                  </button>
                )}
              </div>
            </div>

            {/* Development Notice */}
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-700" />
                <span>Development Verification Notice</span>
              </div>
              <p className="leading-relaxed">
                In this local demonstration environment, the 6-digit OTP is output to the backend server terminal log upon dispatch.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otp.trim().length !== 6}
              data-testid="auth-verify-otp-btn"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-wide uppercase transition shadow-md shadow-emerald-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="text-white" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify & Authenticate</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
