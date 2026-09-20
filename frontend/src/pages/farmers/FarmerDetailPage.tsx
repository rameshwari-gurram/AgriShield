import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Phone, 
  Globe, 
  Calendar, 
  Copy, 
  Check, 
  ShieldCheck, 
  Layers, 
  AlertCircle
} from 'lucide-react';
import { farmerService } from '../../services/farmerService';
import { Farmer, SUPPORTED_LANGUAGES } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatTimestamp } from '../../utils/formatters';

export const FarmerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchFarmer = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const res = await farmerService.getFarmerById(id);
        setFarmer(res.data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Farmer not found';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchFarmer();
  }, [id]);

  const copyReference = () => {
    if (farmer?.farmerReferenceNumber) {
      navigator.clipboard.writeText(farmer.farmerReferenceNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getLanguageLabel = (code: string) => {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    return lang ? `${lang.name} (${lang.nativeName})` : code;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500">Loading farmer profile...</p>
      </div>
    );
  }

  if (error || !farmer) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Farmer Not Found</h2>
          <p className="text-slate-500 text-sm mt-1">{error || 'The requested farmer record does not exist.'}</p>
        </div>
        <Link
          to="/farmers"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Farmer Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Back Button & Navigation */}
      <div className="flex items-center space-x-3">
        <Link
          to="/farmers"
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="text-xs text-slate-400">Farmers / Profile</div>
          <h1 className="text-2xl font-bold text-slate-900">{farmer.fullName}</h1>
        </div>
      </div>

      {/* Hero Profile Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-center space-x-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-md flex-shrink-0">
              {getInitials(farmer.fullName)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900">{farmer.fullName}</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Active Producer
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>System UUID:</span>
                <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                  {farmer.id}
                </code>
              </div>
            </div>
          </div>

          {/* Reference Number Pill */}
          {farmer.farmerReferenceNumber && (
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-center justify-between sm:justify-start gap-3">
              <div>
                <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                  Internal Reference ID
                </div>
                <div className="font-mono font-bold text-sm text-slate-800">
                  {farmer.farmerReferenceNumber}
                </div>
              </div>
              <button
                onClick={copyReference}
                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-700 hover:border-emerald-300 transition"
                title="Copy Reference"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Profile Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          {/* Mobile Number */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>Mobile Phone</span>
            </div>
            <div className="font-mono text-base font-semibold text-slate-900">
              +91 {farmer.mobileNumber}
            </div>
            <div className="text-[11px] text-slate-400">Verified primary number</div>
          </div>

          {/* Preferred Language */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Globe className="w-4 h-4 text-emerald-600" />
              <span>Preferred Language</span>
            </div>
            <div className="text-base font-semibold text-slate-900">
              {getLanguageLabel(farmer.preferredLanguage)}
            </div>
            <div className="text-[11px] text-slate-400">Preferred advisory dialect</div>
          </div>

          {/* Registration Date */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Registered On</span>
            </div>
            <div className="text-base font-semibold text-slate-900">
              {new Date(farmer.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {formatTimestamp(farmer.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Downstream Modules Placeholder */}
      <div className="bg-slate-100/60 rounded-3xl border border-dashed border-slate-300 p-8 text-slate-600 space-y-4">
        <div className="flex items-center space-x-3 text-slate-800 font-bold text-base">
          <Layers className="w-5 h-5 text-emerald-600" />
          <span>Downstream Domains & Assets</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
            Scheduled for Future Modules
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
          In accordance with the module isolation principles, farm registrations, geospatial boundary polygons, NDVI satellite indices, and parametric policy contracts will attach to this farmer profile in subsequent modules.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-white border border-slate-200/80 text-xs space-y-1">
            <div className="font-semibold text-slate-700">Farms & Land Parcels (Module 2 Part B / 3)</div>
            <p className="text-slate-400">Geospatial coordinates and polygon cadastral boundaries.</p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-slate-200/80 text-xs space-y-1">
            <div className="font-semibold text-slate-700">Parametric Insurance Policies (Module 5)</div>
            <p className="text-slate-400">Active drought and rainfall stress index coverage.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
