import { Router } from 'express';
import { authController } from '../../controllers/auth.controller.js';
import { adminAuthController } from '../../controllers/adminAuth.controller.js';
import { authenticateJwt } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  sendOtpSchema,
  verifyOtpSchema,
  requestEmailLinkSchema,
  confirmEmailLinkSchema,
  adminLoginSchema,
} from '../../validators/auth.validator.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/admin/login
 * @desc    Authenticate administrator and receive ADMIN JWT Bearer token
 * @access  Public (Sliding-window rate-limited, timing attack defended)
 */
router.post(
  '/admin/login',
  validateBody(adminLoginSchema),
  adminAuthController.login.bind(adminAuthController)
);

/**
 * @route   POST /api/v1/auth/otp/send
 * @desc    Request a 6-digit verification code sent to registered mobile number or email
 * @access  Public (Rate-limited, non-enumerating)
 */
router.post(
  '/otp/send',
  validateBody(sendOtpSchema),
  authController.sendOtp.bind(authController)
);

/**
 * @route   POST /api/v1/auth/otp/verify
 * @desc    Verify 6-digit code and receive authenticated JWT Bearer token
 * @access  Public (Rate-limited, max 3 attempts)
 */
router.post(
  '/otp/verify',
  validateBody(verifyOtpSchema),
  authController.verifyOtp.bind(authController)
);

/**
 * @route   POST /api/v1/auth/email/request-link
 * @desc    Request linking an email address to authenticated producer account (dispatches OTP)
 * @access  Protected (Requires Bearer JWT)
 */
router.post(
  '/email/request-link',
  authenticateJwt,
  validateBody(requestEmailLinkSchema),
  authController.requestEmailLink.bind(authController)
);

/**
 * @route   POST /api/v1/auth/email/confirm-link
 * @desc    Confirm email linking with 6-digit code received in email inbox
 * @access  Protected (Requires Bearer JWT)
 */
router.post(
  '/email/confirm-link',
  authenticateJwt,
  validateBody(confirmEmailLinkSchema),
  authController.confirmEmailLink.bind(authController)
);

export const authRoutes = router;
