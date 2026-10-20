/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.4: Claim Routes
 *
 * Configures the authenticated claims management routes and farm parcel sub-routes.
 */

import { Router } from 'express';
import { claimController } from '../../controllers/claim.controller.js';
import { authenticateJwt } from '../../middleware/auth.middleware.js';
import { authorizeFarmAccess } from '../../middleware/farmOwnership.middleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  claimIdParamSchema,
  farmIdParamSchema,
  evaluateClaimSchema,
  settleClaimSchema,
  rejectClaimSchema,
  claimQuerySchema,
} from '../../validators/claim.validator.js';

// ============================================================================
// Top-Level Claim Router (/api/v1/claims)
// ============================================================================
const claimRouter = Router();

/**
 * @route   POST /api/v1/claims/evaluate
 * @desc    Evaluate prospective claim against authoritative Module 6 assessment results
 * @access  Protected (Requires Bearer JWT)
 */
claimRouter.post(
  '/evaluate',
  authenticateJwt,
  validateBody(evaluateClaimSchema),
  claimController.evaluateClaim.bind(claimController)
);

/**
 * @route   GET /api/v1/claims
 * @desc    Query claims (e.g. ?policyId=<uuid> or ?farmId=<uuid>)
 * @access  Protected (Requires Bearer JWT)
 */
claimRouter.get(
  '/',
  authenticateJwt,
  validateQuery(claimQuerySchema),
  claimController.getClaims.bind(claimController)
);

/**
 * @route   GET /api/v1/claims/:id
 * @desc    Retrieve claim details by ID
 * @access  Protected (Requires Bearer JWT)
 */
claimRouter.get(
  '/:id',
  authenticateJwt,
  validateParams(claimIdParamSchema),
  claimController.getClaimById.bind(claimController)
);

/**
 * @route   POST /api/v1/claims/:id/approve
 * @desc    Approve a PENDING claim without modifying policy balance
 * @access  Protected (Requires Bearer JWT)
 */
claimRouter.post(
  '/:id/approve',
  authenticateJwt,
  validateParams(claimIdParamSchema),
  claimController.approveClaim.bind(claimController)
);

/**
 * @route   POST /api/v1/claims/:id/settle
 * @desc    Execute simulated parametric claim settlement in transaction
 * @access  Protected (Requires Bearer JWT)
 */
claimRouter.post(
  '/:id/settle',
  authenticateJwt,
  validateParams(claimIdParamSchema),
  validateBody(settleClaimSchema),
  claimController.settleClaim.bind(claimController)
);

/**
 * @route   POST /api/v1/claims/:id/reject
 * @desc    Reject a claim with an explicit reason
 * @access  Protected (Requires Bearer JWT)
 */
claimRouter.post(
  '/:id/reject',
  authenticateJwt,
  validateParams(claimIdParamSchema),
  validateBody(rejectClaimSchema),
  claimController.rejectClaim.bind(claimController)
);

// ============================================================================
// Farm-Nested Claim Router (/api/v1/farms/:farmId/claims)
// ============================================================================
const farmClaimRouter = Router({ mergeParams: true });

/**
 * @route   GET /api/v1/farms/:farmId/claims
 * @desc    Retrieve all claims for a farm parcel
 * @access  Protected (Requires Bearer JWT and verified farm ownership)
 */
farmClaimRouter.get(
  '/',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  authorizeFarmAccess,
  claimController.getClaimsForFarm.bind(claimController)
);

export const claimRoutes = claimRouter;
export const farmClaimRoutes = farmClaimRouter;
