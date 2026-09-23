/**
 * Module 6 Stage 5B-2: Historical Assessment Modal Component
 * Displays comprehensive details for a past climate risk assessment,
 * including evaluated rules, observed weather metrics, and triggers.
 *
 * NOTE: The frontend NEVER recalculates risk decisions.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, AlertCircle, History } from 'lucide-react';
import { riskAssessmentService } from '../../services/riskAssessmentService';
import { RiskAssessment } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { RiskAssessmentSummaryCard } from './RiskAssessmentSummaryCard';
import { InsufficientDataWarning } from './InsufficientDataWarning';
import { RiskEventList } from './RiskEventList';

export interface HistoricalAssessmentModalProps {
  assessmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  // Optional test overrides for deterministic unit testing
  initialDetail?: RiskAssessment | null;
  initialLoading?: boolean;
  initialError?: string | null;
}

export const HistoricalAssessmentModal: React.FC<HistoricalAssessmentModalProps> = ({
  assessmentId,
  isOpen,
  onClose,
  initialDetail = null,
  initialLoading = false,
  initialError = null,
}) => {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(initialDetail);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(initialError);

  const fetchAssessmentDetails = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await riskAssessmentService.getRiskAssessmentById(id);
      setAssessment(res.data);
    } catch {
      setError('Unable to load this assessment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialDetail !== null || initialError !== null || initialLoading) {
      // In test mode with pre-supplied states
      setAssessment(initialDetail);
      setLoading(initialLoading);
      setError(initialError);
      return;
    }

    if (isOpen && assessmentId) {
      fetchAssessmentDetails(assessmentId);
    } else {
      setAssessment(null);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, assessmentId, fetchAssessmentDetails, initialDetail, initialError, initialLoading]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <History className="w-5 h-5 text-slate-700" aria-hidden="true" />
            </div>
            <div>
              <h3 id="modal-title" className="text-lg font-bold text-slate-900">
                Historical Assessment Details
              </h3>
              <p className="text-xs text-slate-500">
                Archived parametric evaluation snapshot
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <LoadingSpinner size="lg" />
            <p className="text-xs text-slate-500 font-medium">Loading assessment details...</p>
          </div>
        ) : error ? (
          <div className="p-8 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-rose-900">Failed to Load Details</h4>
            <p className="text-xs text-rose-700">{error}</p>
            {assessmentId && (
              <button
                onClick={() => fetchAssessmentDetails(assessmentId)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50 transition shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        ) : assessment ? (
          <div className="space-y-6">
            <InsufficientDataWarning
              hasInsufficientDataCoverage={assessment.hasInsufficientDataCoverage}
            />
            <RiskAssessmentSummaryCard assessment={assessment} />
            <RiskEventList events={assessment.events || []} />
          </div>
        ) : null}
      </div>
    </div>
  );
};
