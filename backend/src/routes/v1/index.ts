import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { farmerRoutes } from './farmer.routes.js';
import { farmRoutes } from './farm.routes.js';
import { riskAssessmentRoutes } from '../riskAssessment.routes.js';
import { riskRuleRoutes } from '../riskRule.routes.js';
import { policyRoutes } from './policy.routes.js';
import { claimRoutes } from './claim.routes.js';
import { authRoutes } from './auth.routes.js';

const router = Router();

// Mount module routes
router.use('/health', healthRoutes);
router.use('/farmers', farmerRoutes);
router.use('/farms', farmRoutes);
router.use('/risk-assessments', riskAssessmentRoutes);
router.use('/risk-rules', riskRuleRoutes);
router.use('/policies', policyRoutes);
router.use('/claims', claimRoutes);
router.use('/auth', authRoutes);

export const v1Routes = router;
export { healthRoutes } from './health.routes.js';
export { farmerRoutes } from './farmer.routes.js';
export { farmRoutes } from './farm.routes.js';
export { farmBoundaryRoutes } from './farmBoundary.routes.js';
export { weatherRoutes } from './weather.routes.js';
export { riskAssessmentRoutes, farmRiskRoutes } from '../riskAssessment.routes.js';
export { riskRuleRoutes } from '../riskRule.routes.js';
export { satelliteRoutes } from '../satellite.routes.js';
export { mlRiskRoutes } from './mlRisk.routes.js';
export { policyRoutes, farmPolicyRoutes } from './policy.routes.js';
export { claimRoutes, farmClaimRoutes } from './claim.routes.js';
export { authRoutes } from './auth.routes.js';

