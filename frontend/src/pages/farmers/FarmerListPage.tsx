import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  Search, 
  RefreshCw, 
  Phone, 
  ChevronRight, 
  Calendar, 
  Globe, 
  AlertCircle
} from 'lucide-react';
import { farmerService } from '../../services/farmerService';
import { Farmer, SUPPORTED_LANGUAGES } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatTimestamp } from '../../utils/formatters';

export const FarmerListPage: React.FC = () => {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchFarmers = useCallback(async (searchQuery: string, pageNum: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await farmerService.getFarmers({
        page: pageNum,
        limit: 10,
        search: searchQuery.trim() || undefined,
      });

      setFarmers(res.data.farmers);
      setTotalPages(res.data.pagination.totalPages);
      setTotalCount(res.data.pagination.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch farmers';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFarmers(search, page);
  }, [fetchFarmers, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchFarmers(search, 1);
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

  return (
    <div className="space-y-8">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Farmer Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registered agricultural producers and identity profiles ({totalCount} total)
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchFarmers(search, page)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <Link
            to="/farmers/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-900/20 transition hover:scale-[1.02]"
          >
            <UserPlus className="w-4 h-4" />
            Register Farmer
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-3">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, mobile, or reference number..."
            className="block w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm transition"
        >
          Search
        </button>
      </form>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading State */}
      {loading && farmers.length === 0 && (
        <div className="min-h-[300px] flex flex-col items-center justify-center space-y-3">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-slate-500">Loading farmer directory...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && farmers.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">No Farmers Found</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
              {search
                ? `No farmers match the search query "${search}". Try checking for typos or clear search.`
                : 'There are no registered farmers in the database yet. Onboard your first farmer to begin.'}
            </p>
          </div>
          <div className="pt-2">
            {search ? (
              <button
                onClick={() => {
                  setSearch('');
                  fetchFarmers('', 1);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition"
              >
                Clear Search
              </button>
            ) : (
              <Link
                to="/farmers/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition"
              >
                <UserPlus className="w-4 h-4" />
                Register First Farmer
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Farmers Grid / List */}
      {farmers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {farmers.map((farmer) => (
            <div
              key={farmer.id}
              className="p-5 sm:p-6 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              {/* Farmer Info */}
              <div className="flex items-start sm:items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-base flex items-center justify-center shadow-sm flex-shrink-0">
                  {getInitials(farmer.fullName)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-slate-900">{farmer.fullName}</h3>
                    {farmer.farmerReferenceNumber && (
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {farmer.farmerReferenceNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">+91 {farmer.mobileNumber}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>{getLanguageLabel(farmer.preferredLanguage)}</span>
                    </div>
                    <div className="flex items-center gap-1 hidden md:flex">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Registered: {formatTimestamp(farmer.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center sm:self-center self-end">
                <Link
                  to={`/farmers/${farmer.id}`}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 text-xs font-semibold transition"
                >
                  <span>View Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            Showing Page <span className="font-bold text-slate-800">{page}</span> of{' '}
            <span className="font-bold text-slate-800">{totalPages}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
