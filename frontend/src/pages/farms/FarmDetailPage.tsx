import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sprout,
  Calendar,
  MapPin,
  Maximize2,
  Copy,
  Check,
  User,
  Edit2,
  Trash2,
  AlertCircle,
  Clock,
  Tag,
  ShieldAlert,
} from 'lucide-react';
import { farmService } from '../../services/farmService';
import { farmBoundaryService } from '../../services/farmBoundaryService';
import { Farm, FarmStatus, AreaUnit, AREA_UNITS, FARM_STATUSES, UpdateFarmInput, FarmBoundary } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { FarmBoundaryMap } from '../../components/maps/FarmBoundaryMap';
import { FarmWeatherSection } from '../../components/weather/FarmWeatherSection';
import { FarmRiskSection } from '../../components/risk/FarmRiskSection';

export const FarmDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [farm, setFarm] = useState<Farm | null>(null);
  const [boundary, setBoundary] = useState<FarmBoundary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit modal state
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateFarmInput>({});

  // Delete modal state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingConfirm, setDeletingConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFarm = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const [farmRes, boundaryRes] = await Promise.allSettled([
          farmService.getFarmById(id),
          farmBoundaryService.getBoundary(id),
        ]);

        if (farmRes.status === 'fulfilled') {
          setFarm(farmRes.value.data);
        } else {
          const err = farmRes.reason as any;
          throw new Error(err?.response?.data?.message || err?.message || 'Farm parcel not found');
        }

        if (boundaryRes.status === 'fulfilled') {
          setBoundary(boundaryRes.value.data);
        } else {
          setBoundary(null);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Farm parcel not found';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchFarm();
  }, [id]);

  const copyReference = () => {
    if (farm?.farmReferenceNumber) {
      navigator.clipboard.writeText(farm.farmReferenceNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openEditModal = () => {
    if (!farm) return;
    setEditForm({
      farmName: farm.farmName,
      cropName: farm.cropName,
      cropVariety: farm.cropVariety || '',
      sowingDate: farm.sowingDate,
      expectedHarvestDate: farm.expectedHarvestDate || '',
      farmArea: farm.farmArea,
      farmAreaUnit: farm.farmAreaUnit,
      village: farm.village,
      district: farm.district,
      state: farm.state,
      pincode: farm.pincode,
      status: farm.status,
    });
    setEditError(null);
    setIsEditing(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    if (editForm.expectedHarvestDate && editForm.sowingDate) {
      if (new Date(editForm.expectedHarvestDate) < new Date(editForm.sowingDate)) {
        setEditError('Expected harvest date must be on or after sowing date');
        return;
      }
    }

    try {
      setSavingEdit(true);
      setEditError(null);
      const res = await farmService.updateFarm(id, {
        farmName: editForm.farmName,
        cropName: editForm.cropName,
        cropVariety: editForm.cropVariety || null,
        sowingDate: editForm.sowingDate,
        expectedHarvestDate: editForm.expectedHarvestDate || null,
        farmArea: editForm.farmArea ? Number(editForm.farmArea) : undefined,
        farmAreaUnit: editForm.farmAreaUnit,
        village: editForm.village,
        district: editForm.district,
        state: editForm.state,
        pincode: editForm.pincode,
        status: editForm.status,
      });

      setFarm(res.data);
      setIsEditing(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } }; message?: string };
      setEditError(apiError.response?.data?.message || apiError.message || 'Failed to update farm');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await farmService.deleteFarm(id);
      navigate('/farms');
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } }; message?: string };
      setDeleteError(apiError.response?.data?.message || apiError.message || 'Failed to delete farm');
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: FarmStatus) => {
    const s = FARM_STATUSES.find((item) => item.code === status);
    return s ? (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.badgeColor}`}>
        {s.label}
      </span>
    ) : (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500">Loading farm details...</p>
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Farm Not Found</h2>
          <p className="text-slate-500 text-sm mt-1">{error || 'The requested farm parcel does not exist.'}</p>
        </div>
        <Link
          to="/farms"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Farm Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link
            to="/farms"
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="text-xs text-slate-400">Farms / Parcel Profile</div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span>{farm.farmName}</span>
              {getStatusBadge(farm.status)}
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-sm"
          >
            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Edit Parcel</span>
          </button>
          <button
            onClick={() => setDeletingConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-center space-x-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Sprout className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">{farm.farmName}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>System UUID:</span>
                <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                  {farm.id}
                </code>
              </div>
            </div>
          </div>

          {/* Reference Number Pill */}
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-center justify-between sm:justify-start gap-3">
            <div>
              <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                Internal Farm Reference
              </div>
              <div className="font-mono font-bold text-sm text-slate-800">
                {farm.farmReferenceNumber}
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
        </div>

        {/* Primary Parcel Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Crop */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span>Crop & Variety</span>
            </div>
            <div className="text-base font-bold text-slate-900">{farm.cropName}</div>
            <div className="text-xs text-slate-500">{farm.cropVariety || 'Standard Variety'}</div>
          </div>

          {/* Area */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Maximize2 className="w-4 h-4 text-emerald-600" />
              <span>Cultivated Area</span>
            </div>
            <div className="text-base font-bold text-slate-900 font-mono">
              {farm.farmArea.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 font-medium uppercase">{farm.farmAreaUnit}</div>
          </div>

          {/* Sowing Date */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Sowing Date</span>
            </div>
            <div className="text-base font-bold text-slate-900">{farm.sowingDate}</div>
            <div className="text-xs text-slate-500">Planted Date</div>
          </div>

          {/* Expected Harvest */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Expected Harvest</span>
            </div>
            <div className="text-base font-bold text-slate-900">
              {farm.expectedHarvestDate || 'Not Scheduled'}
            </div>
            <div className="text-xs text-slate-500">Target Harvest Window</div>
          </div>
        </div>

        {/* Association & Location Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          {/* Farmer Card */}
          <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Registered Producer</span>
              </div>
              {farm.farmer && (
                <Link
                  to={`/farmers/${farm.farmer.id}`}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                >
                  View Full Profile →
                </Link>
              )}
            </div>
            {farm.farmer ? (
              <div>
                <div className="font-bold text-slate-900 text-base">{farm.farmer.fullName}</div>
                <div className="text-xs text-slate-600 font-mono mt-0.5">
                  📱 +91 {farm.farmer.mobileNumber}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono">Farmer UUID: {farm.farmerId}</div>
            )}
          </div>

          {/* Location Card */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Cadastral Locality</span>
            </div>
            <div className="text-sm font-semibold text-slate-800">
              {farm.village}, {farm.district}
            </div>
            <div className="text-xs text-slate-500">
              {farm.state} — PIN {farm.pincode}
            </div>
          </div>
        </div>

        {/* Platform Legal Disclaimer Note */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-700">Platform Identifier Notice: </span>
          The reference number <code>{farm.farmReferenceNumber}</code> is strictly an internal AgriShield platform identifier for parametric indexing and crop risk assessment. It is not a 7/12 extract, survey number, Khasra/Khatauni, or government land title.
        </div>
      </div>

      {/* Farm Boundary & Geospatial Monitoring Section */}
      <div className="space-y-6">
        <FarmBoundaryMap
          farmId={farm.id}
          farmName={farm.farmName}
          initialBoundary={boundary}
          onBoundaryUpdated={(updated) => setBoundary(updated)}
        />

        {/* Spatial Analytics & Area Comparison */}
        {boundary && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Area Comparison & Spatial Alignment</h3>
                <p className="text-xs text-slate-500">
                  Neutral alignment between farmer-declared registry area and digitized PostGIS polygon.
                </p>
              </div>
              <span className="self-start sm:self-auto text-xs font-mono font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
                WGS84 EPSG:4326
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Declared Area */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="text-xs text-slate-400 font-medium">Declared Farm Area</div>
                <div className="text-xl font-bold text-slate-900 font-mono">
                  {farm.farmArea.toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-slate-500 uppercase">{farm.farmAreaUnit}</span>
                </div>
                <div className="text-[11px] text-slate-400">Registry declaration</div>
              </div>

              {/* Mapped Boundary Area */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                <div className="text-xs text-emerald-800 font-medium">Mapped PostGIS Area</div>
                <div className="text-xl font-bold text-emerald-950 font-mono">
                  {boundary.calculatedAreaAcres.toFixed(4)}{' '}
                  <span className="text-xs font-semibold text-emerald-700">Acres</span>
                </div>
                <div className="text-[11px] text-emerald-700 font-mono">
                  {boundary.calculatedAreaHectares.toFixed(4)} ha ({boundary.calculatedAreaSqM.toLocaleString()} m²)
                </div>
              </div>

              {/* Spatial Centroid */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="text-xs text-slate-400 font-medium">Geometric Centroid</div>
                <div className="text-sm font-bold text-slate-800 font-mono">
                  {boundary.centroidLatitude}° N, {boundary.centroidLongitude}° E
                </div>
                <div className="text-[11px] text-slate-400">Weather & satellite indexing coordinate</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl text-xs text-slate-500 border border-slate-100 leading-relaxed">
              <span className="font-semibold text-slate-700">Alignment Context: </span>
              Minor variances between declared acreage and spatial polygon perimeter are typical due to uncultivated access paths, natural topography, tree canopies, and bunds.
            </div>
          </div>
        )}

        {/* Non-Legal Platform Disclaimer Banner */}
        <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 space-y-1.5 shadow-sm">
          <div className="font-bold flex items-center gap-2 text-amber-950 text-sm">
            <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span>Platform Notice: Geospatial & Boundary Disclaimer</span>
          </div>
          <p className="leading-relaxed text-amber-900/90">
            Mapped farm boundaries and geospatial calculations are utilized strictly for parametric weather indexing, satellite remote sensing, and risk modeling within AgriShield. This boundary does not represent a legal cadastral land survey, 7/12 extract, Khasra, or government record of rights, and does not establish land ownership, title, or insurance claim eligibility.
          </p>
        </div>
      </div>

      {/* Hyper-Local Weather Section */}
      <FarmWeatherSection
        farmId={farm.id}
        hasBoundary={Boolean(boundary)}
        centroidCoordinates={
          boundary
            ? {
                latitude: boundary.centroidLatitude,
                longitude: boundary.centroidLongitude,
              }
            : undefined
        }
      />

      {/* Climate Risk Assessment Section */}
      <FarmRiskSection farmId={farm.id} />

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-600" />
                Edit Farm Parcel
              </h3>
              <button
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Farm Name</label>
                  <input
                    type="text"
                    value={editForm.farmName || ''}
                    onChange={(e) => setEditForm({ ...editForm, farmName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editForm.status || 'ACTIVE'}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as FarmStatus })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {FARM_STATUSES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Crop Name</label>
                  <input
                    type="text"
                    value={editForm.cropName || ''}
                    onChange={(e) => setEditForm({ ...editForm, cropName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Crop Variety</label>
                  <input
                    type="text"
                    value={editForm.cropVariety || ''}
                    onChange={(e) => setEditForm({ ...editForm, cropVariety: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sowing Date</label>
                  <input
                    type="date"
                    value={editForm.sowingDate || ''}
                    onChange={(e) => setEditForm({ ...editForm, sowingDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Harvest Date</label>
                  <input
                    type="date"
                    value={editForm.expectedHarvestDate || ''}
                    min={editForm.sowingDate || undefined}
                    onChange={(e) => setEditForm({ ...editForm, expectedHarvestDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cultivated Area</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10000"
                    value={editForm.farmArea || ''}
                    onChange={(e) => setEditForm({ ...editForm, farmArea: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Area Unit</label>
                  <select
                    value={editForm.farmAreaUnit || 'ACRE'}
                    onChange={(e) => setEditForm({ ...editForm, farmAreaUnit: e.target.value as AreaUnit })}
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm"
                >
                  {savingEdit && <LoadingSpinner size="sm" className="text-white" />}
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <ShieldAlert className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">Delete Farm Parcel?</h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold">{farm.farmName}</span> ({farm.farmReferenceNumber})? This action cannot be undone.
            </p>

            {deleteError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm"
              >
                {isDeleting && <LoadingSpinner size="sm" className="text-white" />}
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
