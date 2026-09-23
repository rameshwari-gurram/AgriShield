/**
 * Module 6 Stage 5B-2: Risk Event List Component
 * Renders the collection of evaluated climate-risk events for an assessment.
 *
 * NOTE: The frontend NEVER calculates or recalculates risk, severity, or triggers.
 * It renders backend-provided status and triggered flags directly.
 */

import React from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, HelpCircle } from 'lucide-react';
import { RiskEvent } from '../../types';
import { RiskEventCard } from './RiskEventCard';

export interface RiskEventListProps {
  events: RiskEvent[];
}

export const RiskEventList: React.FC<RiskEventListProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
        <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <HelpCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <h4 className="text-sm font-bold text-slate-800">No Risk Events Recorded</h4>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          No risk events were recorded for this assessment.
        </p>
      </div>
    );
  }

  // Tally counts directly from backend flags for presentation only
  const triggeredCount = events.filter((e) => e.triggered || e.status === 'TRIGGERED').length;
  const insufficientCount = events.filter((e) => e.status === 'INSUFFICIENT_DATA').length;
  const notTriggeredCount = events.filter((e) => e.status === 'NOT_TRIGGERED').length;

  return (
    <div className="space-y-4">
      {/* Header and status distribution pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h4 className="text-base font-bold text-slate-900">
            Evaluated Risk Events ({events.length})
          </h4>
          <p className="text-xs text-slate-500">
            Rule evaluations produced by the meteorological risk engine.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {triggeredCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{triggeredCount} Triggered</span>
            </span>
          )}

          {insufficientCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{insufficientCount} Incomplete Data</span>
            </span>
          )}

          {notTriggeredCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{notTriggeredCount} Not Triggered</span>
            </span>
          )}
        </div>
      </div>

      {/* List of RiskEventCards */}
      <div className="space-y-3">
        {events.map((event) => (
          <RiskEventCard key={event.id || event.ruleCode} event={event} />
        ))}
      </div>
    </div>
  );
};
