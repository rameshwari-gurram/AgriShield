/**
 * Module 6: Idempotent Risk Rule Seeding Utility
 * Seeds or updates initial scientifically documented IMD risk rules into PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db.js';
import { INITIAL_IMD_RISK_RULES } from './initialRiskRules.js';
import { logger } from './logger.js';

export interface SeedRiskRulesResult {
  rulesProcessed: number;
  ruleCodes: string[];
}

export async function seedRiskRules(
  client: PrismaClient = defaultPrisma
): Promise<SeedRiskRulesResult> {
  const processedCodes: string[] = [];

  for (const rule of INITIAL_IMD_RISK_RULES) {
    await client.riskRule.upsert({
      where: { code: rule.code },
      update: {
        name: rule.name,
        description: rule.description,
        hazardType: rule.hazardType,
        measurement: rule.measurement,
        threshold: rule.threshold,
        thresholdUnit: rule.thresholdUnit,
        observationWindow: rule.observationWindow,
        severity: rule.severity,
        sourceType: rule.sourceType,
        sourceReference: rule.sourceReference,
        isActive: rule.isActive ?? true,
      },
      create: {
        code: rule.code,
        name: rule.name,
        description: rule.description,
        hazardType: rule.hazardType,
        measurement: rule.measurement,
        threshold: rule.threshold,
        thresholdUnit: rule.thresholdUnit,
        observationWindow: rule.observationWindow,
        severity: rule.severity,
        sourceType: rule.sourceType,
        sourceReference: rule.sourceReference,
        isActive: rule.isActive ?? true,
      },
    });

    processedCodes.push(rule.code);
  }

  logger.info(`Successfully seeded/upserted ${processedCodes.length} climate risk rules.`);

  return {
    rulesProcessed: processedCodes.length,
    ruleCodes: processedCodes,
  };
}
