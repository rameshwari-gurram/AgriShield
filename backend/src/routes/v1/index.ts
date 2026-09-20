import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { farmerRoutes } from './farmer.routes.js';

const router = Router();

// Mount module routes
router.use('/health', healthRoutes);
router.use('/farmers', farmerRoutes);

// Future modules will be mounted here:
// router.use('/farms', farmRoutes);
// router.use('/policies', policyRoutes);
// router.use('/claims', claimRoutes);

export const v1Routes = router;
