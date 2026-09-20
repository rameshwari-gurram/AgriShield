import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sprout,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Calendar,
  MapPin,
  Maximize2,
  Tag,
  UserCheck,
  Plus,
} from 'lucide-react';
import { farmService } from '../../services/farmService';
import { farmerService } from '../../services/farmerService';
import { Farmer, Farm, AreaUnit, FarmStatus, AREA_UNITS, FARM_STATUSES } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export const FarmRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedFarmerId = searchParams.get('farmerId') || '';

  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loadingFarmers, setLoadingFarmers] = useState(true);

  // Form state
  const [farmerId, setFarmerId] = useState(preSelectedFarmerId);
  const [farmName, setFarmName] = useState('');
  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [sowingDate, setSowingDate] = useState('');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  const [farmArea, setFarmArea] = useState<string>('');
  const [farmAreaUnit, setFarmAreaUnit] = useState<AreaUnit>('ACRE');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [status, setStatus] = useState<FarmStatus>('ACTIVE');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [createdFarm, setCreatedFarm] = useState<Farm | null>(null);

  useEffect(() => {
    const loadFarmers = async () => {
      try {
        setLoadingFarmers(true);
        const res = await farmerService.getFarmers({ limit: 100 });
        setFarmers(res.data.farmers);
        if (preSelectedFarmerId) {
          setFarmerId(preSelectedFarmerId);
        } else if (res.data.farmers.length > 0 && !farmerId) {
          setFarmerId(res.data.farmers[0].id);
        }
      } catch (err: unknown) {
        console.error('Failed to load farmers list:', err);
      } finally {
        setLoadingFarmers(false);
      }
    };

    loadFarmers();
  }, [preSelectedFarmerId]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!farmerId) {
      errors.farmerId = 'Please select a registered farmer';
    }

    if (!farmName.trim()) {
      errors.farmName = 'Farm name is required';
    } else if (farmName.trim().length < 2) {
      errors.farmName = 'Farm name must be at least 2 characters';
    } else if (farmName.trim().length > 100) {
      errors.farmName = 'Farm name cannot exceed 100 characters';
    }

    if (!cropName.trim()) {
      errors.cropName = 'Crop name is required';
    } else if (cropName.trim().length < 2) {
      errors.cropName = 'Crop name must be at least 2 characters';
    } else if (cropName.trim().length > 100) {
      errors.cropName = 'Crop name cannot exceed 100 characters';
    }

    if (cropVariety.trim().length > 100) {
      errors.cropVariety = 'Crop variety cannot exceed 100 characters';
    }

    if (!sowingDate) {
      errors.sowingDate = 'Sowing date is required';
    }

    if (expectedHarvestDate && sowingDate) {
      if (new Date(expectedHarvestDate) < new Date(sowingDate)) {
        errors.expectedHarvestDate = 'Expected harvest date must be on or after sowing date';
      }
    }

    const areaNum = parseFloat(farmArea);
    if (!farmArea || isNaN(areaNum)) {
      errors.farmArea = 'Farm area is required';
    } else if (areaNum <= 0) {
      errors.farmArea = 'Farm area must be greater than 0';
    } else if (areaNum > 10000) {
      errors.farmArea = 'Farm area cannot exceed 10,000 units';
    }

    if (!village.trim()) {
      errors.village = 'Village is required';
    } else if (village.trim().length < 2) {
      errors.village = 'Village must be at least 2 characters';
    }

    if (!district.trim()) {
      errors.district = 'District is required';
    } else if (district.trim().length < 2) {
      errors.district = 'District must be at least 2 characters';
    }

    if (!state.trim()) {
      errors.state = 'State is required';
    } else if (state.trim().length < 2) {
      errors.state = 'State must be at least 2 characters';
    }

    const pinPattern = /^[1-9][0-9]{5}$/;
    if (!pincode.trim()) {
      errors.pincode = 'Pincode is required';
    } else if (!pinPattern.test(pincode.trim())) {
      errors.pincode = 'Enter a valid 6-digit Indian PIN code';
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
      setSubmitting(true);
      const res = await farmService.registerFarm({
        farmerId,
        farmName: farmName.trim(),
        cropName: cropName.trim(),
        cropVariety: cropVariety.trim() || undefined,
        sowingDate,
        expectedHarvestDate: expectedHarvestDate || undefined,
        farmArea: parseFloat(farmArea),
        farmAreaUnit,
        village: village.trim(),
        district: district.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        status,
      });

      setCreatedFarm(res.data);
    } catch (err: unknown) {
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

      setError(apiError.response?.data?.message || apiError.message || 'Failed to register farm');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header & Back Button */}
      <div className="flex items-center space-x-3">
        <Link
          to="/farms"
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sprout className="w-6 h-6 text-emerald-600" />
            Register Farm Parcel
          </h1>
          <p className="text-xs text-slate-500">
            Module 3: Agricultural parcel and crop metadata registration
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {createdFarm && (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-4 shadow-sm animate-fadeIn">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-bold text-base">Farm Registered Successfully!</h2>
              <p className="text-sm text-emerald-800">
                <span className="font-semibold">{createdFarm.farmName}</span> has been linked to the farmer with generated internal reference ID:
              </p>
              <div className="pt-1">
                <code className="font-mono text-base px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 font-bold border border-emerald-300 inline-block">
                  {createdFarm.farmReferenceNumber}
                </code>
              </div>
              <p className="text-xs text-emerald-700 pt-1">
                * Note: This is strictly an internal AgriShield reference for parametric monitoring, not a legal land title or survey number.
              </p>
            </div>
          </div>

          <div className="pt-3 flex flex-wrap gap-3">
            <Link
              to={`/farms/${createdFarm.id}`}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm transition shadow-sm"
            >
              View Farm Details
            </Link>
            <Link
              to={`/farmers/${createdFarm.farmerId}`}
              className="px-4 py-2 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-medium text-sm transition"
            >
              View Farmer Profile
            </Link>
            <button
              onClick={() => {
                setCreatedFarm(null);
                setFarmName('');
                setCropName('');
                setCropVariety('');
                setSowingDate('');
                setExpectedHarvestDate('');
                setFarmArea('');
                setVillage('');
                setDistrict('');
                setState('');
                setPincode('');
              }}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm transition"
            >
              Register Another Farm
            </button>
          </div>
        </div>
      )}

      {/* Registration Form */}
      {!createdFarm && (
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
            {/* Section 1: Farmer Association */}
            <div className="space-y-4 pb-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Farmer Association</span>
                </div>
                <Link
                  to="/farmers/register"
                  className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Register New Farmer
                </Link>
              </div>

              {loadingFarmers ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <LoadingSpinner size="sm" />
                  <span>Loading registered farmers...</span>
                </div>
              ) : farmers.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-2">
                  <p className="font-medium">No registered farmers found.</p>
                  <p className="text-xs text-amber-700">
                    A farm parcel must belong to a registered farmer. Please onboard a farmer first.
                  </p>
                  <Link
                    to="/farmers/register"
                    className="inline-block px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition"
                  >
                    Register First Farmer
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="farmerId" className="block text-xs font-semibold text-slate-700">
                    Assign to Farmer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="farmerId"
                    value={farmerId}
                    onChange={(e) => setFarmerId(e.target.value)}
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.farmerId
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  >
                    <option value="" disabled>
                      -- Select Farmer --
                    </option>
                    {farmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.fullName} (📱 +91 {f.mobileNumber}) {f.farmerReferenceNumber ? `• [${f.farmerReferenceNumber}]` : ''}
                      </option>
                    ))}
                  </select>
                  {validationErrors.farmerId && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.farmerId}</p>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Farm & Crop Identity */}
            <div className="space-y-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Farm & Crop Identity</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="farmName" className="block text-xs font-semibold text-slate-700">
                    Farm Name / Identifier <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="farmName"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="e.g. Green Acres - North Plot"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.farmName
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.farmName && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.farmName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cropName" className="block text-xs font-semibold text-slate-700">
                    Primary Crop <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="cropName"
                    value={cropName}
                    onChange={(e) => setCropName(e.target.value)}
                    placeholder="e.g. Soybean, Cotton, Wheat, Rice"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.cropName
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.cropName && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.cropName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cropVariety" className="block text-xs font-semibold text-slate-700">
                    Crop Variety <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    id="cropVariety"
                    value={cropVariety}
                    onChange={(e) => setCropVariety(e.target.value)}
                    placeholder="e.g. JS 335, BT-2, Sharbati"
                    className="block w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    disabled={submitting}
                  />
                  {validationErrors.cropVariety && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.cropVariety}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="status" className="block text-xs font-semibold text-slate-700">
                    Cultivation Status
                  </label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FarmStatus)}
                    className="block w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    disabled={submitting}
                  >
                    {FARM_STATUSES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Cultivation Timeline */}
            <div className="space-y-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Cultivation Timeline</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="sowingDate" className="block text-xs font-semibold text-slate-700">
                    Sowing Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="sowingDate"
                    value={sowingDate}
                    onChange={(e) => setSowingDate(e.target.value)}
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.sowingDate
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.sowingDate && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.sowingDate}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="expectedHarvestDate" className="block text-xs font-semibold text-slate-700">
                    Expected Harvest Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    id="expectedHarvestDate"
                    value={expectedHarvestDate}
                    min={sowingDate || undefined}
                    onChange={(e) => setExpectedHarvestDate(e.target.value)}
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.expectedHarvestDate
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.expectedHarvestDate && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.expectedHarvestDate}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 4: Land Parcel Metrics */}
            <div className="space-y-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Maximize2 className="w-4 h-4 text-emerald-600" />
                <span>Land Parcel Metrics</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="farmArea" className="block text-xs font-semibold text-slate-700">
                    Cultivated Area <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="farmArea"
                    step="0.01"
                    min="0.01"
                    max="10000"
                    value={farmArea}
                    onChange={(e) => setFarmArea(e.target.value)}
                    placeholder="e.g. 4.5"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.farmArea
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.farmArea && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.farmArea}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="farmAreaUnit" className="block text-xs font-semibold text-slate-700">
                    Area Unit <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="farmAreaUnit"
                    value={farmAreaUnit}
                    onChange={(e) => setFarmAreaUnit(e.target.value as AreaUnit)}
                    className="block w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    disabled={submitting}
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label} ({u.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    {AREA_UNITS.find((u) => u.code === farmAreaUnit)?.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Section 5: Geographical Locality */}
            <div className="space-y-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Geographical Locality</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="village" className="block text-xs font-semibold text-slate-700">
                    Village / Town <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="village"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="e.g. Baramati"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.village
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.village && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.village}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="district" className="block text-xs font-semibold text-slate-700">
                    District <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="e.g. Pune"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.district
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.district && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.district}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="state" className="block text-xs font-semibold text-slate-700">
                    State <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Maharashtra"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.state
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.state && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.state}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pincode" className="block text-xs font-semibold text-slate-700">
                    PIN Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="pincode"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="e.g. 413102"
                    className={`block w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                      validationErrors.pincode
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    disabled={submitting}
                  />
                  {validationErrors.pincode && (
                    <p className="text-xs text-rose-600 font-medium">{validationErrors.pincode}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Note on Farm Reference */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-700">Internal Reference: </span>
              A unique identifier (e.g. <code>AGRI-FRM-YYYYMMDD-XXXX</code>) will be auto-generated by the backend service upon registration. This serves as an internal AgriShield reference and is not a government land title.
            </div>

            {/* Form Action Buttons */}
            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => navigate('/farms')}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || (farmers.length === 0 && !loadingFarmers)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-900/20 transition disabled:opacity-50"
              >
                {submitting && <LoadingSpinner size="sm" className="text-white" />}
                {submitting ? 'Registering...' : 'Register Farm Parcel'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
