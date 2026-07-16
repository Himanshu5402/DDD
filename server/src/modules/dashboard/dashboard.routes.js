import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './dashboard.controller.js';

const router = Router();
const M = MODULES.DASHBOARD;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Dashboard, description: Cross-module business overview (Module 10) }
 */

router.get('/overview', authorize(M, ACTIONS.READ), c.getOverview);

export default router;
