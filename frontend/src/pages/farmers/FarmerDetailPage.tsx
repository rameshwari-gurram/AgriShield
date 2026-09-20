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
  AlertCircle,
  Sprout,
  Plus,
  Maximize2,
  MapPin,
  ChevronRight
} from 'lucide-react';
import { farmerService } from '../../services/farmerService';
import { farmService } from '../../services/farmService';
import { Farmer, Farm, SUPPORTED_LANGUAGES, FARM_STATUSES, FarmStatus } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatTimestamp } from '../../utils/formatters';

export const FarmerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchFarmerAndFarms = async () => {
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

      try {
        setLoadingFarms(true);
        const farmsRes = await farmService.getFarmsByFarmerId(id);
        setFarms(farmsRes.data);
      } catch (err: unknown) {
        console.error('Failed to load farmer farms:', err);
      } finally {
        setLoadingFarms(false);
      }
    };

    fetchFarmerAndFarms();
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

  const getStatusBadge = (status: FarmStatus) => {
    const s = FARM_STATUSES.find((item) => item.code === status);
    return s ? (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.badgeColor}`}>
        {s.label}
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
        {status}
      </span>
    );
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

      {/* Module 3: Registered Farm Parcels Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Registered Farm Parcels</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {farms.length} {farms.length === 1 ? 'Plot' : 'Plots'}
            </span>
          </div>

          <Link
            to={`/farms/register?farmerId=${farmer.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Farm Parcel</span>
          </Link>
        </div>

        {loadingFarms ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center space-x-2 text-xs text-slate-500">
            <LoadingSpinner size="sm" />
            <span>Loading registered farm plots...</span>
          </div>
        ) : farms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <Sprout className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No Farm Parcels Registered Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
                Register agricultural parcels owned or operated by {farmer.fullName} to enable crop tracking.
              </p>
            </div>
            <div className="pt-1">
              <Link
                to={`/farms/register?farmerId=${farmer.id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                <Plus className="w-4 h-4" />
                <span>Register First Farm Parcel</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {farms.map((f) => (
              <div
                key={f.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 hover:shadow-md transition space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-base text-slate-900">{f.farmName}</h4>
                    <div className="font-mono text-[11px] text-slate-500">{f.farmReferenceNumber}</div>
                  </div>
                  {getStatusBadge(f.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                  <div className="space-y-0.5">
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <Sprout className="w-3 h-3 text-emerald-600" />
                      <span>Crop</span>
                    </div>
                    <div className="font-semibold text-slate-800">
                      {f.cropName} {f.cropVariety ? `(${f.cropVariety})` : ''}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <Maximize2 className="w-3 h-3 text-emerald-600" />
                      <span>Area</span>
                    </div>
                    <div className="font-semibold text-slate-800 font-mono">
                      {f.farmArea.toFixed(2)} {f.farmAreaUnit}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      <span>Locality</span>
                    </div>
                    <div className="text-slate-800 truncate">
                      {f.village}, {f.district}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      <span>Sowing Date</span>
                    </div>
                    <div className="text-slate-800 font-mono">{f.sowingDate}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <Link
                    to={`/farms/${f.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    <span>View Parcel Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
