/**
 * Module 6 Stage 6: Risk Rule Catalog Modal
 * Accessible, read-only modal displaying active parametric risk rules from the backend API.
 *
 * Requirements:
 * - Read-only inspection of active rules
 * - Group rules meaningfully by observation window
 * - Display rule name, code, observation window, threshold, threshold unit, severity, and source reference
 * - Accessible keyboard (Escape) and backdrop click handling
 * - Prominent display of IMD reference citations and official parametric disclaimer
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  BookOpen,
  Info,
  Clock,
  Layers,
  Search,
  ExternalLink,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { RiskRuleDTO } from '../../types';
import { riskAssessmentService } from '../../services/riskAssessmentService';

export interface RiskRuleCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RiskRuleCatalogModal: React.FC<RiskRuleCatalogModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [rules, setRules] = useState<RiskRuleDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch active rules from backend when opened
  const fetchRules = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await riskAssessmentService.getActiveRules();
      setRules(res.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve active parametric rules';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRules();
    }
  }, [isOpen]);

  // Filter rules by search term
  const filteredRules = useMemo(() => {
    if (!searchTerm.trim()) return rules;
    const term = searchTerm.toLowerCase();
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.code.toLowerCase().includes(term) ||
        (r.description && r.description.toLowerCase().includes(term)) ||
        r.sourceReference.toLowerCase().includes(term)
    );
  }, [rules, searchTerm]);

  // Group rules meaningfully by observationWindow
  const groupedRules = useMemo(() => {
    const groups: Record<string, RiskRuleDTO[]> = {};
    for (const rule of filteredRules) {
      const windowKey = rule.observationWindow || 'Standard';
      if (!groups[windowKey]) {
        groups[windowKey] = [];
      }
      groups[windowKey].push(rule);
    }
    return groups;
  }, [filteredRules]);

  if (!isOpen) {
    return null;
  }

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'VERY_HIGH':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'HIGH':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-semibold';
      case 'MODERATE':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      case 'LOW':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const formatWindowLabel = (windowKey: string) => {
    if (windowKey === '24_HOURS') return '24-Hour Cumulative Rainfall Hazards';
    if (windowKey === '3_HOURS') return '3-Hour Short-Duration Rainfall Intensity Hazards';
    return `${windowKey} Hazard Window`;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-catalog-title"
      data-testid="risk-rule-catalog-modal"
    >
      <div
        className="relative bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="rule-catalog-title"
                className="text-lg font-bold text-slate-900 tracking-tight"
                data-testid="rule-catalog-modal-title"
              >
                Active Parametric Risk Rules
              </h2>
              <p className="text-xs text-slate-500">
                Scientific hazard thresholds configured in the database engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchRules}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
              title="Refresh rules"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              aria-label="Close dialog"
              data-testid="rule-catalog-close-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search bar & disclaimer */}
        <div className="px-6 py-3.5 bg-slate-50/40 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search active rules by name, code, or IMD reference..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              data-testid="rule-catalog-search-input"
            />
          </div>

          {/* Official Disclaimer */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Parametric Weather Indicator: </span>
              <span>
                Parametric weather indicators based on IMD meteorological standards. Rules define
                climate risk evaluation criteria and do not constitute formal insurance policy
                certificates or claim entitlements.
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div
              className="py-16 flex flex-col items-center justify-center space-y-3"
              data-testid="rule-catalog-loading"
            >
              <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">
                Loading active parametric rules...
              </p>
            </div>
          ) : error ? (
            <div
              className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2"
              data-testid="rule-catalog-error"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Error Loading Risk Rules</span>
              </div>
              <p>{error}</p>
              <button
                onClick={fetchRules}
                className="mt-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition"
              >
                Retry
              </button>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300" />
              <p>No active risk rules matching your criteria.</p>
            </div>
          ) : (
            Object.entries(groupedRules).map(([windowKey, windowRules]) => (
              <div key={windowKey} className="space-y-3" data-testid={`rule-group-${windowKey}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {formatWindowLabel(windowKey)} ({windowRules.length})
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {windowRules.map((rule) => (
                    <div
                      key={rule.id || rule.code}
                      className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-2xs space-y-2.5 flex flex-col justify-between"
                      data-testid={`rule-card-${rule.code}`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-slate-900 leading-tight">
                            {rule.name}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] border flex-shrink-0 ${getSeverityBadgeClass(
                              rule.severity
                            )}`}
                            data-testid={`rule-severity-${rule.code}`}
                          >
                            {rule.severity}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
                          <span>{rule.code}</span>
                        </div>

                        {rule.description && (
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {rule.description}
                          </p>
                        )}
                      </div>

                      {/* Threshold & Reference citation */}
                      <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Trigger Threshold:</span>
                          <span
                            className="font-bold text-slate-900"
                            data-testid={`rule-threshold-${rule.code}`}
                          >
                            &ge; {rule.threshold} {rule.thresholdUnit}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-100 flex items-start gap-1.5">
                          <ExternalLink className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-700">Source: </span>
                            <span className="text-slate-600" data-testid={`rule-source-${rule.code}`}>
                              {rule.sourceReference}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {rules.length > 0 && `${rules.length} active rules loaded from engine`}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
            data-testid="rule-catalog-footer-close-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
