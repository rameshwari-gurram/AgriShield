/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.4: Policy Routes
 *
 * Configures the authenticated policy management routes and farm parcel sub-routes.
 */

import { Router } from 'express';
import { policyController } from '../../controllers/policy.controller.js';
import { authenticateJwt } from '../../middleware/auth.middleware.js';
import { authorizeFarmAccess } from '../../middleware/farmOwnership.middleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  createPolicySchema,
  policyIdParamSchema,
  farmIdParamSchema,
  policyQuerySchema,
  activePolicyQuerySchema,
} from '../../validators/policy.validator.js';

// ============================================================================
// Top-Level Policy Router (/api/v1/policies)
// ============================================================================
const policyRouter = Router();

/**
 * @route   POST /api/v1/policies
 * @desc    Create a new parametric insurance policy in PENDING status
 * @access  Protected (Requires Bearer JWT)
 */
policyRouter.post(
  '/',
  authenticateJwt,
  validateBody(createPolicySchema),
  policyController.createPolicy.bind(policyController)
);

/**
 * @route   GET /api/v1/policies
 * @desc    Query policies (e.g. ?farmId=<uuid>)
 * @access  Protected (Requires Bearer JWT)
 */
policyRouter.get(
  '/',
  authenticateJwt,
  validateQuery(policyQuerySchema),
  policyController.getPolicies.bind(policyController)
);

/**
 * @route   GET /api/v1/policies/:id
 * @desc    Retrieve policy details by ID
 * @access  Protected (Requires Bearer JWT)
 */
policyRouter.get(
  '/:id',
  authenticateJwt,
  validateParams(policyIdParamSchema),
  policyController.getPolicyById.bind(policyController)
);

/**
 * @route   POST /api/v1/policies/:id/issue
 * @desc    Explicitly activate and issue a PENDING policy
 * @access  Protected (Requires Bearer JWT)
 */
policyRouter.post(
  '/:id/issue',
  authenticateJwt,
  validateParams(policyIdParamSchema),
  policyController.issuePolicy.bind(policyController)
);

// ============================================================================
// Farm-Nested Policy Router (/api/v1/farms/:farmId/policies)
// ============================================================================
const farmPolicyRouter = Router({ mergeParams: true });

/**
 * @route   GET /api/v1/farms/:farmId/policies/active
 * @desc    Retrieve the active policy covering referenceDate for the farm parcel
 * @access  Protected (Requires Bearer JWT and verified farm ownership)
 */
farmPolicyRouter.get(
  '/active',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  validateQuery(activePolicyQuerySchema),
  authorizeFarmAccess,
  policyController.getActivePolicyForFarm.bind(policyController)
);

/**
 * @route   GET /api/v1/farms/:farmId/policies
 * @desc    Retrieve all policies for a farm parcel
 * @access  Protected (Requires Bearer JWT and verified farm ownership)
 */
farmPolicyRouter.get(
  '/',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  authorizeFarmAccess,
  policyController.getPoliciesForFarm.bind(policyController)
);

export const policyRoutes = policyRouter;
export const farmPolicyRoutes = farmPolicyRouter;
