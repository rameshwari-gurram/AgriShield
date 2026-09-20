import { Router } from 'express';
import { healthController } from '../../controllers/health.controller.js';
import { validateRequest, healthQuerySchema } from '../../validators/health.validator.js';

const router = Router();

router.get(
  '/',
  validateRequest(healthQuerySchema),
  healthController.getHealth.bind(healthController)
);

router.get(
  '/ready',
  healthController.getReadiness.bind(healthController)
);

export const healthRoutes = router;
