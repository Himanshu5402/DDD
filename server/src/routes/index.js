import { Router } from 'express';
import mongoose from 'mongoose';
import ApiResponse from '../utils/ApiResponse.js';
import { redisEnabled } from '../config/redis.js';
import { isMemoryDb } from '../config/database.js';

import authRoutes from '../modules/auth/auth.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import rolesRoutes from '../modules/roles/roles.routes.js';
import auditRoutes from '../modules/audit/audit.routes.js';
import customFieldsRoutes from '../modules/customFields/customFields.routes.js';
import companiesRoutes from '../modules/companies/companies.routes.js';
import aiRoutes from '../modules/ai/ai.routes.js';
import aiInsightsRoutes from '../modules/ai/insights.routes.js';
import tasksRoutes from '../modules/tasks/tasks.routes.js';
import goalsRoutes from '../modules/goals/goals.routes.js';
import rrrmasRoutes from '../modules/rrrmas/rrrmas.routes.js';
import productsRoutes from '../modules/products/products.routes.js';
import financeRoutes from '../modules/finance/finance.routes.js';
import maintenanceRoutes from '../modules/maintenance/maintenance.routes.js';
import employeeAnalyticsRoutes from '../modules/employeeAnalytics/employeeAnalytics.routes.js';
import reportingRoutes from '../modules/reporting/reporting.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import notificationsRoutes from '../modules/notifications/notifications.routes.js';
import pepsiRoutes from '../modules/integrations/pepsi.routes.js';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Liveness/readiness probe
 *     responses:
 *       200: { description: Service health }
 */
router.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  return ApiResponse.ok(
    res,
    {
      status: dbState === 1 ? 'ok' : 'degraded',
      uptime: process.uptime(),
      db: { connected: dbState === 1, memory: isMemoryDb() },
      redis: { enabled: redisEnabled() },
      timestamp: new Date().toISOString(),
    },
    'Health'
  );
});

// Foundation modules
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/audit', auditRoutes);
router.use('/custom-fields', customFieldsRoutes);
router.use('/companies', companiesRoutes);
router.use('/ai/insights', aiInsightsRoutes);
router.use('/ai', aiRoutes);

// Product modules
router.use('/tasks', tasksRoutes);
router.use('/goals', goalsRoutes);
router.use('/rrrmas', rrrmasRoutes);
router.use('/products', productsRoutes);
router.use('/finance', financeRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/employee-analytics', employeeAnalyticsRoutes);
router.use('/reports', reportingRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/integrations/pepsi', pepsiRoutes);

export default router;
