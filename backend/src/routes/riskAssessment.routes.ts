/**
 * Module 6: Climate Risk Assessment Routes
 * Defines HTTP routes for farm risk assessment execution, retrieval, and history.
 *
 * Endpoints:
 * - POST /api/v1/farms/:farmId/risk-assessments
 * - GET  /api/v1/farms/:farmId/risk-assessments/latest
 * - GET  /api/v1/farms/:farmId/risk-assessments?limit=...
 * - GET  /api/v1/risk-assessments/:assessmentId
 */

import { Router } from 'express';
import { riskAssessmentController } from '../controllers/riskAssessment.controller.js';
import {
  validateParams,
  validateQuery,
  farmIdParamSchema,
  assessmentIdParamSchema,
  riskAssessmentQuerySchema,
} from '../validators/riskAssessment.validator.js';

// Farm-specific risk assessment router (nested under /api/v1/farms/:farmId/risk-assessments)
const farmRiskRouter = Router({ mergeParams: true });

/**
 * @route   POST /api/v1/farms/:farmId/risk-assessments
 * @desc    Execute and persist an end-to-end climate risk assessment using farm's latest weather
 * @access  Public / Protected (Standard API v1)
 */
farmRiskRouter.post(
  '/',
  validateParams(farmIdParamSchema),
  riskAssessmentController.createAssessment.bind(riskAssessmentController)
);

/**
 * @route   GET /api/v1/farms/:farmId/risk-assessments/latest
 * @desc    Retrieve the newest persisted risk assessment for a farm
 * @access  Public / Protected (Standard API v1)
 */
farmRiskRouter.get(
  '/latest',
  validateParams(farmIdParamSchema),
  riskAssessmentController.getLatestAssessment.bind(riskAssessmentController)
);

/**
 * @route   GET /api/v1/farms/:farmId/risk-assessments
 * @desc    Retrieve risk assessment history for a farm parcel, ordered newest first
 * @query   limit (integer 1-100, optional)
 * @access  Public / Protected (Standard API v1)
 */
farmRiskRouter.get(
  '/',
  validateParams(farmIdParamSchema),
  validateQuery(riskAssessmentQuerySchema),
  riskAssessmentController.getAssessmentsForFarm.bind(riskAssessmentController)
);

// Global risk assessment router (nested under /api/v1/risk-assessments)
const assessmentRouter = Router();

/**
 * @route   GET /api/v1/risk-assessments/:assessmentId
 * @desc    Retrieve a single risk assessment with its populated risk events and rule definitions
 * @access  Public / Protected (Standard API v1)
 */
assessmentRouter.get(
  '/:assessmentId',
  validateParams(assessmentIdParamSchema),
  riskAssessmentController.getAssessmentById.bind(riskAssessmentController)
);

export const farmRiskRoutes = farmRiskRouter;
export const riskAssessmentRoutes = assessmentRouter;
