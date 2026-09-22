/**
 * Module 6: Climate Risk Rule Engine Service
 *
 * Core Responsibility:
 * Evaluates WeatherAggregationResult against configured active RiskRule[] specifications.
 * Implements mutually exclusive threshold-band classification, completeness checking,
 * and deterministic, explainable rule outcomes.
 *
 * Principles:
 * - Pure domain engine: does NOT access PostgreSQL, does NOT write to database.
 * - Does NOT calculate final farm-level RiskLevel (handled in Stage 4).
 * - Distinguishes TRIGGERED, NOT_TRIGGERED, and INSUFFICIENT_DATA.
 * - Enforces highest-satisfied threshold selection within mutually exclusive rule bands.
 */

import { WeatherAggregationResult } from '../types/weather.types.js';
import {
  RiskRuleEvaluationInput,
  RuleEvaluationResult,
  RuleEvaluationStatus,
  RiskMeasurement,
} from '../types/risk.types.js';
import { AppError } from '../utils/apiError.js';

function formatWindowLabel(window: string, measurement: RiskMeasurement): string {
  if (measurement === 'RAINFALL') {
    if (window === '24_HOURS') return '24-hour rainfall';
    if (window === '3_HOURS') return '3-hour rolling rainfall';
    return `${window} rainfall`;
  }
  if (measurement === 'TEMPERATURE') return 'Maximum temperature';
  if (measurement === 'WIND_SPEED') return 'Maximum wind speed';
  if (measurement === 'WIND_GUST') return 'Maximum wind gust';
  return `${measurement} (${window})`;
}


export class ClimateRiskRuleEngine {
  /**
   * Pure evaluation function that executes active RiskRule specifications against WeatherAggregationResult.
   */
  public evaluate(
    weather: WeatherAggregationResult,
    rules: RiskRuleEvaluationInput[]
  ): RuleEvaluationResult[] {
    // 1. Validate Input Aggregation
    if (weather.totalRainfall24h < 0 || weather.maximumRolling3hRainfall < 0) {
      throw AppError.badRequest(
        `Invalid negative rainfall measurement: 24h=${weather.totalRainfall24h}, 3h=${weather.maximumRolling3hRainfall}`
      );
    }
    if (weather.maximumWindSpeedKmh !== null && weather.maximumWindSpeedKmh < 0) {
      throw AppError.badRequest(`Invalid negative wind speed measurement: ${weather.maximumWindSpeedKmh}`);
    }
    if (weather.maximumWindGustKmh !== null && weather.maximumWindGustKmh < 0) {
      throw AppError.badRequest(`Invalid negative wind gust measurement: ${weather.maximumWindGustKmh}`);
    }

    // 2. Filter Active Rules
    const activeRules = rules.filter((r) => r.isActive !== false);
    if (activeRules.length === 0) {
      return [];
    }

    // 3. Group Rules by (hazardType + measurement + observationWindow)
    const groups = new Map<string, RiskRuleEvaluationInput[]>();
    for (const r of activeRules) {
      const key = `${r.hazardType}__${r.measurement}__${r.observationWindow}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(r);
    }

    const results: RuleEvaluationResult[] = [];

    // 4. Evaluate each rule group independently
    for (const [, groupRules] of groups.entries()) {
      // Deduplicate rules by code
      const uniqueMap = new Map<string, RiskRuleEvaluationInput>();
      for (const r of groupRules) {
        uniqueMap.set(r.code, r);
      }
      const dedupedRules = Array.from(uniqueMap.values());

      // Sort applicable rules by threshold descending
      dedupedRules.sort((a, b) => Number(b.threshold) - Number(a.threshold));

      const firstRule = dedupedRules[0];
      const measurement = firstRule.measurement;
      const observationWindow = firstRule.observationWindow;

      // Map rule to aggregated weather measurement and check completeness
      let observedValue: number | null = null;
      let hasSufficientData = false;
      let insufficientReason = '';

      switch (measurement) {
        case 'RAINFALL':
          if (observationWindow === '24_HOURS') {
            observedValue = weather.totalRainfall24h;
            hasSufficientData = weather.complete24hWindow;
            insufficientReason =
              'The 24-hour rainfall rule could not be evaluated because the available weather records do not form a complete 24-hour observation window.';
          } else if (observationWindow === '3_HOURS') {
            observedValue = weather.maximumRolling3hRainfall;
            hasSufficientData = weather.complete3hWindow;
            insufficientReason =
              'The 3-hour rainfall rule could not be evaluated because the available weather records do not form a complete 3-hour continuous observation window.';
          } else {
            hasSufficientData = false;
            insufficientReason = `Unsupported rainfall observation window: '${observationWindow}'.`;
          }
          break;

        case 'TEMPERATURE':
          observedValue = weather.maximumTemperatureC;
          hasSufficientData = weather.maximumTemperatureC !== null;
          insufficientReason =
            'The temperature rule could not be evaluated because no weather observations were available.';
          break;

        case 'WIND_SPEED':
          observedValue = weather.maximumWindSpeedKmh;
          hasSufficientData = weather.maximumWindSpeedKmh !== null;
          insufficientReason =
            'The wind speed rule could not be evaluated because no weather observations were available.';
          break;

        case 'WIND_GUST':
          observedValue = weather.maximumWindGustKmh;
          hasSufficientData = weather.maximumWindGustKmh !== null;
          insufficientReason =
            'The wind gust rule could not be evaluated because no weather observations were available.';
          break;

        default:
          hasSufficientData = false;
          insufficientReason = `Unsupported measurement type: '${measurement}'.`;
      }

      // 5. If data is insufficient, mark all rules in this group as INSUFFICIENT_DATA
      if (!hasSufficientData || observedValue === null) {
        for (const rule of dedupedRules) {
          results.push({
            ruleId: rule.id,
            ruleCode: rule.code,
            ruleName: rule.name,
            hazardType: rule.hazardType,
            measurement: rule.measurement,
            threshold: Number(rule.threshold),
            thresholdUnit: rule.thresholdUnit,
            observationWindow: rule.observationWindow,
            observedValue,
            severity: rule.severity,
            sourceType: rule.sourceType,
            sourceReference: rule.sourceReference,
            status: 'INSUFFICIENT_DATA' as RuleEvaluationStatus,
            triggered: false,
            explanation: insufficientReason,
          });
        }
        continue;
      }

      // 6. When data is sufficient, find the HIGHEST threshold satisfied in this group
      // Using integer cents to avoid floating-point comparison inaccuracies
      const obsInt = Math.round(observedValue * 100);
      let triggeredRule: RiskRuleEvaluationInput | null = null;

      for (const rule of dedupedRules) {
        const threshInt = Math.round(Number(rule.threshold) * 100);
        if (obsInt >= threshInt) {
          triggeredRule = rule;
          break; // Highest threshold satisfied selected!
        }
      }

      // 7. Generate evaluation outcome and explanation for each rule in group
      for (const rule of dedupedRules) {
        const threshNum = Number(rule.threshold);
        const windowLabel = formatWindowLabel(rule.observationWindow, rule.measurement);
        const isTriggered = triggeredRule !== null && rule.code === triggeredRule.code;

        let status: RuleEvaluationStatus;
        let explanation: string;

        if (isTriggered) {
          status = 'TRIGGERED';
          explanation = `${windowLabel} was ${observedValue.toFixed(2)} ${rule.thresholdUnit}, which met the configured threshold of ${threshNum.toFixed(2)} ${rule.thresholdUnit}.`;
        } else {
          status = 'NOT_TRIGGERED';
          if (triggeredRule) {
            explanation = `${windowLabel} was ${observedValue.toFixed(2)} ${rule.thresholdUnit}, but this threshold (${threshNum.toFixed(2)} ${rule.thresholdUnit}) was superseded by higher classification (${triggeredRule.name} >= ${Number(triggeredRule.threshold).toFixed(2)} ${triggeredRule.thresholdUnit}).`;
          } else {
            explanation = `${windowLabel} was ${observedValue.toFixed(2)} ${rule.thresholdUnit}, which did not meet the configured threshold of ${threshNum.toFixed(2)} ${rule.thresholdUnit}.`;
          }
        }

        results.push({
          ruleId: rule.id,
          ruleCode: rule.code,
          ruleName: rule.name,
          hazardType: rule.hazardType,
          measurement: rule.measurement,
          threshold: threshNum,
          thresholdUnit: rule.thresholdUnit,
          observationWindow: rule.observationWindow,
          observedValue,
          severity: rule.severity,
          sourceType: rule.sourceType,
          sourceReference: rule.sourceReference,
          status,
          triggered: isTriggered,
          explanation,
        });
      }
    }

    // Sort results deterministically by ruleCode ASC
    return results.sort((a, b) => a.ruleCode.localeCompare(b.ruleCode));
  }

  /**
   * Alias for evaluate.
   */
  public evaluateRules(
    weather: WeatherAggregationResult,
    rules: RiskRuleEvaluationInput[]
  ): RuleEvaluationResult[] {
    return this.evaluate(weather, rules);
  }
}

export const climateRiskRuleEngine = new ClimateRiskRuleEngine();
