/**
 * Module 6 Stage 5B-3: Assessment Provenance View / Risk Assessment Audit View
 * Read-only modal displaying persisted backend assessment metadata, rule evaluations,
 * and data provenance strictly from the Stage 5A RiskAssessmentResponseDTO.
 *
 * NOTE: The frontend does NOT calculate risk thresholds, triggered status, or overall risk.
 * This view provides an immutable, transparent inspection of the backend assessment record.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Copy,
  Download,
  Check,
  AlertTriangle,
  Info,
  Layers,
  Code,
} from 'lucide-react';
import { RiskAssessment } from '../../types';

export interface RiskAssessmentAuditModalProps {
  assessment: RiskAssessment | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RiskAssessmentAuditModal: React.FC<RiskAssessmentAuditModalProps> = ({
  assessment,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'provenance' | 'json'>('provenance');

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

  if (!isOpen || !assessment) {
    return null;
  }

  // Serializes strictly the displayed assessment DTO without Axios transport metadata
  const serializedJson = JSON.stringify(assessment, null, 2);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(serializedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for restricted clipboard contexts
      setCopied(false);
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([serializedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `risk-assessment-${assessment.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatSourceType = (sourceType: string): string => {
    if (sourceType === 'OFFICIAL_REFERENCE') {
      return 'Official Reference';
    }
    if (sourceType === 'PROJECT_INDICATOR') {
      return 'Project Indicator';
    }
    return sourceType;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-100/70 text-emerald-800 rounded-xl">
              <FileText className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 id="audit-modal-title" className="text-xl font-bold text-slate-900">
                Assessment Provenance View
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                ID: {assessment.id} &bull; Farm: {assessment.farmId}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              aria-label="Close provenance modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher & Export Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-100/60 border-b border-slate-200 text-xs font-medium">
          <div className="flex items-center space-x-1.5 p-1 bg-white rounded-lg border border-slate-200 shadow-sm">
            <button
              onClick={() => setActiveTab('provenance')}
              className={`px-3 py-1.5 rounded-md transition font-semibold flex items-center gap-1.5 ${
                activeTab === 'provenance'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Provenance Details</span>
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-3 py-1.5 rounded-md transition font-semibold flex items-center gap-1.5 ${
                activeTab === 'json'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Raw Backend DTO JSON</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm font-semibold"
              title="Copy backend response JSON to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition shadow-sm font-semibold"
              title="Download backend response JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download JSON</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'provenance' ? (
            <>
              {/* Assessment Top-Level Metadata Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Assessment Metadata
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-medium">Overall Risk</span>
                    <div className="font-bold text-slate-900">{assessment.overallRisk}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-medium">Assessment Version</span>
                    <div className="font-mono font-bold text-slate-800">
                      {assessment.assessmentVersion}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-medium">Weather Records</span>
                    <div className="font-mono font-bold text-slate-800">
                      {assessment.weatherRecordCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-medium">Rules Triggered</span>
                    <div className="font-mono font-bold text-slate-800">
                      {assessment.triggeredRuleCount} / {assessment.ruleCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 col-span-2">
                    <span className="text-[11px] text-slate-500 font-medium">Evaluation Timestamp (assessedAt)</span>
                    <div className="text-xs font-mono text-slate-800">
                      {new Date(assessment.assessedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 col-span-2">
                    <span className="text-[11px] text-slate-500 font-medium">Record Created (createdAt)</span>
                    <div className="text-xs font-mono text-slate-800">
                      {new Date(assessment.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Summary: </span>
                  {assessment.summary}
                </div>

                {assessment.hasInsufficientDataCoverage && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">hasInsufficientDataCoverage: true</span> &bull; Weather observation window is incomplete. Low risk cannot be conclusively confirmed.
                    </div>
                  </div>
                )}
              </div>

              {/* Evaluated Rules Provenance Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Rule Evaluation Provenance ({assessment.events?.length || 0} Evaluated Rules)
                </h3>

                {assessment.events && assessment.events.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">Rule / Code</th>
                          <th className="py-2.5 px-3">Hazard / Measure</th>
                          <th className="py-2.5 px-3">Window</th>
                          <th className="py-2.5 px-3">Threshold</th>
                          <th className="py-2.5 px-3">Observed</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Severity</th>
                          <th className="py-2.5 px-3">Source Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {assessment.events.map((evt) => {
                          const threshold = evt.threshold ?? evt.thresholdValue;
                          const thresholdUnit = evt.thresholdUnit ?? evt.unit;
                          const formattedObserved =
                            evt.observedValue !== null && evt.observedValue !== undefined
                              ? `${Number(evt.observedValue).toFixed(2)} ${thresholdUnit}`
                              : 'N/A';

                          return (
                            <tr key={evt.id || evt.riskRuleId || evt.ruleCode} className="hover:bg-slate-50/60 transition">
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-900">{evt.ruleName}</div>
                                <div className="font-mono text-[10px] text-slate-400">{evt.ruleCode}</div>
                              </td>
                              <td className="py-3 px-3">
                                <div>{evt.hazardType}</div>
                                <div className="text-[10px] text-slate-400">{evt.measurement}</div>
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px]">
                                {evt.observationWindow}
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px] font-semibold text-slate-700">
                                {Number(threshold).toFixed(2)} {thresholdUnit}
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px] font-bold">
                                {formattedObserved}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    evt.status === 'TRIGGERED'
                                      ? 'bg-rose-100 text-rose-800'
                                      : evt.status === 'INSUFFICIENT_DATA'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {evt.status}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                  {evt.severity}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-[11px] text-slate-600 max-w-xs">
                                <div className="font-semibold text-slate-800">
                                  {formatSourceType(evt.sourceType)}
                                </div>
                                <div className="text-[10px] text-slate-500 italic mt-0.5">
                                  {evt.sourceReference}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                    No risk events recorded for this assessment.
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Raw JSON Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Exact persisted Stage 5A RiskAssessmentResponseDTO payload</span>
                <span className="font-mono text-[11px]">{serializedJson.length} bytes</span>
              </div>
              <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto max-h-[500px] border border-slate-800">
                {serializedJson}
              </pre>
            </div>
          )}

          {/* Project Disclaimer Banner */}
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
            <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">Parametric Risk Assessment Disclaimer: </span>
              Parametric weather indicator only. Not a formal insurance policy certificate or claim entitlement.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
          >
            Close Provenance View
          </button>
        </div>
      </div>
    </div>
  );
};
