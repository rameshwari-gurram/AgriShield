/**
 * Module 6 Stage 6: Risk Rule Routes
 * Defines HTTP route for retrieving active parametric risk rules.
 *
 * Endpoint:
 * - GET /api/v1/risk-rules
 */

import { Router } from 'express';
import { riskRuleController } from '../controllers/riskRule.controller.js';

const router = Router();

/**
 * @route   GET /api/v1/risk-rules
 * @desc    Retrieve all active parametric risk rules ordered deterministically by code ascending
 * @access  Public (Standard API v1)
 */
router.get('/', riskRuleController.getActiveRules.bind(riskRuleController));

export const riskRuleRoutes = router;
