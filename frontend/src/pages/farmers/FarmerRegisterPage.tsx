import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  UserPlus, 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  Phone,
  User,
  Globe,
  Hash
} from 'lucide-react';
import { farmerService } from '../../services/farmerService';
import { LanguageCode, SUPPORTED_LANGUAGES, Farmer } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export const FarmerRegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('en');
  const [farmerReferenceNumber, setFarmerReferenceNumber] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [createdFarmer, setCreatedFarmer] = useState<Farmer | null>(null);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = 'Full name is required';
    } else if (fullName.trim().length < 2) {
      errors.fullName = 'Full name must be at least 2 characters';
    } else if (fullName.trim().length > 100) {
      errors.fullName = 'Full name cannot exceed 100 characters';
    }

    const cleanPhone = mobileNumber.replace(/\D/g, '');
    if (!cleanPhone) {
      errors.mobileNumber = 'Mobile number is required';
    } else if (cleanPhone.length !== 10 || !['6', '7', '8', '9'].includes(cleanPhone[0])) {
      errors.mobileNumber = 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9';
    }

    if (farmerReferenceNumber.trim()) {
      const refPattern = /^[A-Za-z0-9\-_]+$/;
      if (!refPattern.test(farmerReferenceNumber.trim())) {
        errors.farmerReferenceNumber = 'Reference number must only contain letters, numbers, hyphens, and underscores';
      } else if (farmerReferenceNumber.trim().length < 3) {
        errors.farmerReferenceNumber = 'Reference number must be at least 3 characters';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const res = await farmerService.registerFarmer({
        fullName: fullName.trim(),
        mobileNumber: mobileNumber.replace(/\D/g, ''),
        preferredLanguage,
        farmerReferenceNumber: farmerReferenceNumber.trim() || undefined,
      });

      setCreatedFarmer(res.data);
    } catch (err: unknown) {
      // Extract error message from API response
      const apiError = err as {
        response?: { data?: { message?: string; data?: { errors?: Array<{ field: string; message: string }> } } };
        message?: string;
      };

      if (apiError.response?.data?.data?.errors) {
        const fieldErrors: Record<string, string> = {};
        apiError.response.data.data.errors.forEach((e) => {
          fieldErrors[e.field] = e.message;
        });
        setValidationErrors(fieldErrors);
      }

      setError(apiError.response?.data?.message || apiError.message || 'Failed to register farmer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Back Button & Header */}
      <div className="flex items-center space-x-3">
        <Link
          to="/farmers"
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-emerald-600" />
            Register Farmer
          </h1>
          <p className="text-xs text-slate-500">
            Module 2: Farmer onboarding and identity creation
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {createdFarmer && (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-4 shadow-sm animate-fadeIn">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-bold text-base">Farmer Registered Successfully!</h2>
              <p className="text-sm text-emerald-800">
                <span className="font-semibold">{createdFarmer.fullName}</span> has been added to the system with internal reference{' '}
                <code className="font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-950 font-bold">
                  {createdFarmer.farmerReferenceNumber}
                </code>.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to={`/farmers/${createdFarmer.id}`}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm transition shadow-sm"
            >
              View Farmer Profile
            </Link>
            <button
              onClick={() => {
                setCreatedFarmer(null);
                setFullName('');
                setMobileNumber('');
                setFarmerReferenceNumber('');
                setPreferredLanguage('en');
              }}
              className="px-4 py-2 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-medium text-sm transition"
            >
              Register Another Farmer
            </button>
          </div>
        </div>
      )}

      {/* Registration Form Card */}
      {!createdFarmer && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Registration Error: </span>
                {error}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="block text-sm font-semibold text-slate-800">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ramesh Patil"
                  className={`block w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                    validationErrors.fullName
                      ? 'border-rose-300 bg-rose-50/30'
                      : 'border-slate-300 focus:border-emerald-500'
                  }`}
                  disabled={loading}
                />
              </div>
              {validationErrors.fullName && (
                <p className="text-xs text-rose-600 font-medium">{validationErrors.fullName}</p>
              )}
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5">
              <label htmlFor="mobileNumber" className="block text-sm font-semibold text-slate-800">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative rounded-lg shadow-sm flex">
                <span className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-600 text-sm font-semibold">
                  +91
                </span>
                <div className="relative flex-grow">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    id="mobileNumber"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    maxLength={10}
                    placeholder="9876543210"
                    className={`block w-full pl-9 pr-3 py-2.5 rounded-r-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.mobileNumber
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={loading}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">10-digit Indian standard mobile number</p>
              {validationErrors.mobileNumber && (
                <p className="text-xs text-rose-600 font-medium">{validationErrors.mobileNumber}</p>
              )}
            </div>

            {/* Preferred Language */}
            <div className="space-y-1.5">
              <label htmlFor="preferredLanguage" className="block text-sm font-semibold text-slate-800">
                Preferred Language <span className="text-rose-500">*</span>
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Globe className="w-5 h-5" />
                </div>
                <select
                  id="preferredLanguage"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as LanguageCode)}
                  className="block w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  disabled={loading}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400">
                Used for SMS notifications and localized alerts in future modules
              </p>
            </div>

            {/* Farmer Internal Reference Number (Optional) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="farmerReferenceNumber" className="block text-sm font-semibold text-slate-800">
                  Farmer Reference Number{' '}
                  <span className="text-xs font-normal text-slate-400">(Optional)</span>
                </label>
                <div className="flex items-center gap-1 text-xs text-slate-400" title="Internal AgriShield system reference">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Internal Reference</span>
                </div>
              </div>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  id="farmerReferenceNumber"
                  value={farmerReferenceNumber}
                  onChange={(e) => setFarmerReferenceNumber(e.target.value)}
                  placeholder="e.g. AGRI-FMR-MH-001 (Leave empty to auto-generate)"
                  className={`block w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                    validationErrors.farmerReferenceNumber
                      ? 'border-rose-300 bg-rose-50/30'
                      : 'border-slate-300 focus:border-emerald-500'
                  }`}
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-slate-400">
                Internal platform reference. If left blank, AgriShield will auto-generate one. Not a legal/government ID.
              </p>
              {validationErrors.farmerReferenceNumber && (
                <p className="text-xs text-rose-600 font-medium">{validationErrors.farmerReferenceNumber}</p>
              )}
            </div>

            {/* Submit & Cancel Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => navigate('/farmers')}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-900/20 transition disabled:opacity-50"
              >
                {loading && <LoadingSpinner size="sm" className="text-white" />}
                {loading ? 'Registering...' : 'Register Farmer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
