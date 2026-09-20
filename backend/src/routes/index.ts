import { Router } from 'express';
import { v1Routes } from './v1/index.js';

const router = Router();

// Mount versioned API routes
router.use('/v1', v1Routes);

export const apiRoutes = router;
