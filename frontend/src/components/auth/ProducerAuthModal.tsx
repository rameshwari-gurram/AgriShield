/**
 * Module 8/9: Producer Authentication Modal Dialog
 *
 * Interactive 2-step modal for Dual-Identifier (Mobile & Email) OTP verification:
 * Step 1: Mobile number or registered Email entry & OTP dispatch
 * Step 2: 6-digit code verification and producer session initialization
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  KeyRound,
  ArrowRight,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  Mail,
  Phone,
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
  defaultEmail?: string;
  suggestedProducerName?: string;
}

export const ProducerAuthModal: React.FC<ProducerAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
  defaultMobileNumber = '',
  defaultEmail = '',
  suggestedProducerName,
}) => {
  const { login } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [authMethod, setAuthMethod] = useState<'mobile' | 'email'>('mobile');
  const [mobileNumber, setMobileNumber] = useState<string>(defaultMobileNumber);
  const [email, setEmail] = useState<string>(defaultEmail);
  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedIdentifier, setMaskedIdentifier] = useState<string>('');
  const [cooldown, setCooldown] = useState<number>(0);

  // Synchronize defaults when opened
  useEffect(() => {
    if (isOpen) {
      if (defaultEmail && !defaultMobileNumber) {
        setAuthMethod('email');
        setEmail(defaultEmail.trim());
      } else {
        setAuthMethod('mobile');
        if (defaultMobileNumber) {
          setMobileNumber(defaultMobileNumber.replace(/\D/g, '').slice(-10));
        }
      }
      setOtp('');
      setError(null);
      setStep('phone');
    }
  }, [isOpen, defaultMobileNumber, defaultEmail]);

  // Cooldown timer ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

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

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    let targetIdentifier = '';
    if (authMethod === 'email') {
      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        setError('Please enter a valid registered email address.');
        return;
      }
      targetIdentifier = cleanEmail;
    } else {
      const cleanMobile = mobileNumber.replace(/\D/g, '');
      if (cleanMobile.length !== 10) {
        setError('Please enter a valid 10-digit mobile number.');
        return;
      }
      targetIdentifier = cleanMobile;
    }

    try {
      setLoading(true);
      const res = await authService.sendOtp(targetIdentifier);
      const masked =
        res.data.maskedEmail ||
        res.data.maskedIdentifier ||
        res.data.maskedMobile ||
        targetIdentifier;
      setMaskedIdentifier(masked);
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

    const targetIdentifier =
      authMethod === 'email'
        ? email.trim().toLowerCase()
        : mobileNumber.replace(/\D/g, '');

    try {
      setLoading(true);
      const res = await authService.verifyOtp(targetIdentifier, cleanOtp);

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

  const modalContent = (
    <div
      data-testid="producer-auth-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="min-h-full flex justify-center items-start py-6 sm:py-10">
        <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-5rem)] overflow-hidden">
          {/* Pinned Accessible Header */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2.5 pr-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 id="auth-modal-title" className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Producer Authentication
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Verify mobile number or registered email to access confidential policies & predictions
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-7 space-y-6">
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

        {/* STEP 1: Identifier Entry (Mobile or Email) */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            {/* Delivery Method Selector */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('mobile');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition ${
                  authMethod === 'mobile'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Mobile SMS</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('email');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition ${
                  authMethod === 'email'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Gmail / Email</span>
              </button>
            </div>

            {authMethod === 'mobile' ? (
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
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="email-input" className="block text-xs font-bold text-slate-700">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="email-input"
                    data-testid="auth-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="producer@gmail.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm font-semibold text-slate-900 placeholder:text-slate-400"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Enter the registered email address linked to your AgriShield profile.
                </p>
              </div>
            )}

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
              disabled={
                loading ||
                (authMethod === 'mobile' && mobileNumber.replace(/\D/g, '').length !== 10) ||
                (authMethod === 'email' && (!email.trim() || !email.includes('@')))
              }
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
                  Change {authMethod === 'email' ? 'Email' : 'Number'}
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
                <span>Code sent to {maskedIdentifier}</span>
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

            {/* Verification Notice */}
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-700" />
                <span>Verification Delivery Notice</span>
              </div>
              <p className="leading-relaxed">
                {authMethod === 'email'
                  ? 'Your single-use 6-digit code has been sent to your Gmail inbox via AgriShield secure email dispatch.'
                  : 'In local development mode, verification codes are logged to the backend console.'}
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
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};
