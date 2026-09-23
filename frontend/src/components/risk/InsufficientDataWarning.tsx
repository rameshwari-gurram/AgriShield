/**
 * Module 6 Stage 5B-2: Incomplete Weather Data Warning Banner
 * Displays prominent advisory when weather observation coverage is incomplete.
 *
 * NOTE: The frontend NEVER calculates or infers why data is incomplete;
 * it strictly relies on backend-provided `hasInsufficientDataCoverage`.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface InsufficientDataWarningProps {
  hasInsufficientDataCoverage?: boolean;
}

export const InsufficientDataWarning: React.FC<InsufficientDataWarningProps> = ({
  hasInsufficientDataCoverage,
}) => {
  if (!hasInsufficientDataCoverage) {
    return null;
  }

  return (
    <div
      role="alert"
      className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm"
    >
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-1 text-xs">
        <div className="font-bold text-amber-950 flex items-center gap-1.5">
          <span>Incomplete Weather Data</span>
        </div>
        <p className="leading-relaxed text-amber-900">
          Some climate-risk rules could not be evaluated because the required weather observation window is incomplete (fewer than 24 consecutive hourly records).
        </p>
        <p className="font-semibold text-amber-950">
          The displayed LOW risk must not be interpreted as confirmed low risk.
        </p>
      </div>
    </div>
  );
};
