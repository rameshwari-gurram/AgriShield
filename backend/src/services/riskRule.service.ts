/**
 * Module 6 Stage 6: Risk Rule Service
 * Exposes active parametric risk rules from PostgreSQL repository.
 * Formats rules into standardized RiskRuleResponseDTOs.
 */

import { IRiskRepository, RiskRuleResponseDTO } from '../types/risk.types.js';
import { riskRepository } from '../repositories/risk.repository.js';

export class RiskRuleService {
  private riskRepo: IRiskRepository;

  constructor(riskRepo: IRiskRepository = riskRepository) {
    this.riskRepo = riskRepo;
  }

  /**
   * Allows injecting a repository instance (e.g. for testing)
   */
  public setRepository(riskRepo: IRiskRepository): void {
    this.riskRepo = riskRepo;
  }

  /**
   * Retrieve all active parametric risk rules.
   * Rules are ordered by code ascending (handled deterministically by repository).
   * Converts Prisma Decimal threshold to native JavaScript number.
   */
  async getActiveRules(): Promise<RiskRuleResponseDTO[]> {
    const rules = await this.riskRepo.findActiveRules();
    return rules.map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      description: rule.description,
      hazardType: rule.hazardType,
      measurement: rule.measurement,
      threshold: Number(rule.threshold),
      thresholdUnit: rule.thresholdUnit,
      observationWindow: rule.observationWindow,
      severity: rule.severity,
      sourceType: rule.sourceType,
      sourceReference: rule.sourceReference,
      isActive: rule.isActive,
      createdAt: rule.createdAt instanceof Date ? rule.createdAt.toISOString() : String(rule.createdAt),
      updatedAt: rule.updatedAt instanceof Date ? rule.updatedAt.toISOString() : String(rule.updatedAt),
    }));
  }
}

export const riskRuleService = new RiskRuleService();
