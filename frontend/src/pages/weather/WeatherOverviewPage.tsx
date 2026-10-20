import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CloudSun,
  MapPin,
  Sprout,
  ArrowRight,
  PlusCircle,
  HelpCircle,
  Compass,
  AlertCircle,
} from 'lucide-react';
import { farmService } from '../../services/farmService';
import { farmBoundaryService } from '../../services/farmBoundaryService';
import { Farm, FarmBoundary } from '../../types';
import { FarmWeatherSection } from '../../components/weather/FarmWeatherSection';
import { LoadingSpinner } from '../../components/LoadingSpinner';

export const WeatherOverviewPage: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [selectedFarmBoundary, setSelectedFarmBoundary] = useState<FarmBoundary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBoundary, setLoadingBoundary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch active farms list
  const fetchFarms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await farmService.getFarms({ limit: 100 });
      const activeFarms = res.data.farms.filter((f) => f.status === 'ACTIVE');
      setFarms(activeFarms);
      if (activeFarms.length > 0 && !selectedFarmId) {
        setSelectedFarmId(activeFarms[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load farm parcels';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId]);

  useEffect(() => {
    fetchFarms();
  }, [fetchFarms]);

  // When selected farm changes, fetch its boundary for centroid coordinates
  useEffect(() => {
    if (!selectedFarmId) {
      setSelectedFarmBoundary(null);
      return;
    }

    let isMounted = true;
    const fetchBoundary = async () => {
      try {
        setLoadingBoundary(true);
        const res = await farmBoundaryService.getBoundary(selectedFarmId);
        if (isMounted) {
          setSelectedFarmBoundary(res.data);
        }
      } catch {
        if (isMounted) {
          setSelectedFarmBoundary(null);
        }
      } finally {
        if (isMounted) {
          setLoadingBoundary(false);
        }
      }
    };

    fetchBoundary();

    return () => {
      isMounted = false;
    };
  }, [selectedFarmId]);

  const selectedFarm = farms.find((f) => f.id === selectedFarmId);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-700">
              <CloudSun className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Farm Weather Monitoring
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Hyper-local centroid weather observations, precipitation tracking, and historical charts.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/farms/register"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Farm Parcel</span>
          </Link>
          <Link
            to="/risk"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition-colors"
          >
            <span>View Climate Risks</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center space-y-3 bg-white rounded-3xl border border-slate-200">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-slate-500 font-medium">Loading your farm weather monitors...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-rose-900">Failed to load farms</h3>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
            <button
              onClick={fetchFarms}
              className="mt-3 px-3 py-1.5 text-xs font-semibold text-rose-800 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Empty state: No active farms */}
      {!loading && !error && farms.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
            <CloudSun className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">No Farm Parcels Registered Yet</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            AgriShield binds hyper-local Open-Meteo weather telemetry to your digitized farm boundaries.
            Register your first farm parcel to start monitoring weather conditions and risk triggers.
          </p>
          <div className="pt-2">
            <Link
              to="/farms/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register Your First Farm</span>
            </Link>
          </div>
        </div>
      )}

      {/* Active Farm Weather Selector & Display */}
      {!loading && !error && farms.length > 0 && (
        <div className="space-y-6">
          {/* Farm Selector Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <label htmlFor="farm-select" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Monitored Farm Parcel
                </label>
                <select
                  id="farm-select"
                  value={selectedFarmId}
                  onChange={(e) => setSelectedFarmId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                >
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.farmName} — {f.cropName} ({f.village}, {f.district})
                    </option>
                  ))}
                </select>
              </div>

              {selectedFarm && (
                <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-800">
                    <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{selectedFarm.cropName}</span>
                    {selectedFarm.cropVariety && (
                      <span className="text-emerald-600">({selectedFarm.cropVariety})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedFarm.village}, {selectedFarm.district}</span>
                  </div>
                  <Link
                    to={`/farms/${selectedFarm.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 transition-colors"
                  >
                    <span>Full Parcel Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* Centroid info snippet */}
            {selectedFarmBoundary && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1 font-mono">
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                  Centroid: {selectedFarmBoundary.centroidLatitude.toFixed(5)}°N, {selectedFarmBoundary.centroidLongitude.toFixed(5)}°E
                </span>
                <span className="text-slate-400">
                  Area: {selectedFarmBoundary.calculatedAreaAcres.toFixed(2)} Acres (EPSG:4326)
                </span>
              </div>
            )}
          </div>

          {/* Embedded FarmWeatherSection */}
          {selectedFarmId && (
            <div className="relative">
              {loadingBoundary && (
                <div className="absolute top-2 right-4 z-10 text-xs text-slate-400 flex items-center gap-1.5">
                  <LoadingSpinner size="sm" />
                  <span>Loading boundary coordinates...</span>
                </div>
              )}
              <FarmWeatherSection
                key={selectedFarmId}
                farmId={selectedFarmId}
                hasBoundary={Boolean(selectedFarmBoundary)}
                centroidCoordinates={
                  selectedFarmBoundary
                    ? {
                        latitude: selectedFarmBoundary.centroidLatitude,
                        longitude: selectedFarmBoundary.centroidLongitude,
                      }
                    : undefined
                }
              />
            </div>
          )}

          {/* Informational Card on Weather Synchronization */}
          <div className="p-5 rounded-2xl bg-sky-50/70 border border-sky-200 text-xs text-sky-900 space-y-1.5 shadow-sm">
            <div className="font-bold flex items-center gap-2 text-sky-950 text-sm">
              <HelpCircle className="w-4 h-4 text-sky-700 flex-shrink-0" />
              <span>How AgriShield Weather Synchronization Works</span>
            </div>
            <p className="leading-relaxed text-sky-900/90">
              Weather measurements are fetched via Open-Meteo&apos;s authoritative numerical weather prediction models directly mapped to your farm&apos;s geometric centroid coordinates. Observations update automatically during scheduled windows and can be manually synchronized on demand.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
