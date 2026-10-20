import { Router } from 'express';
import { authController } from '../../controllers/auth.controller.js';
import {
  validateBody,
  sendOtpSchema,
  verifyOtpSchema,
} from '../../validators/auth.validator.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/otp/send
 * @desc    Request a 6-digit verification code sent to registered mobile number
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

export const authRoutes = router;
