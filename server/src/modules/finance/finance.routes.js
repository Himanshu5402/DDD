import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as transactionsC from './transactions.controller.js';
import * as budgetsC from './budgets.controller.js';
import {
  idParamSchema,
  listTransactionsSchema,
  createTransactionSchema,
  updateTransactionSchema,
  listBudgetsSchema,
  createFinanceOptionSchema,
  createBudgetSchema,
  updateBudgetSchema,
  summaryQuerySchema,
  aiInsightsSchema,
} from './finance.validation.js';

const M = MODULES.FINANCE;

// --- /transactions ---
const transactionsRouter = Router();

transactionsRouter.get(
  '/',
  authorize(M, ACTIONS.READ),
  validate({ query: listTransactionsSchema }),
  transactionsC.list
);

transactionsRouter.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createTransactionSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'Transaction',
    describe: (req) => `Recorded ${req.body.type} of ${req.body.amount} (${req.body.category || 'uncategorized'})`,
  }),
  transactionsC.create
);

// Reusable custom payment-method labels. MUST be declared before '/:id' so the
// literal path isn't captured as an id.
transactionsRouter.get(
  '/custom-methods',
  authorize(M, ACTIONS.READ),
  transactionsC.customMethods
);

transactionsRouter.get(
  '/:id',
  authorize(M, ACTIONS.READ),
  validate({ params: idParamSchema }),
  transactionsC.getOne
);

transactionsRouter.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateTransactionSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Transaction', entityId: (req) => req.params.id }),
  transactionsC.update
);

transactionsRouter.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Transaction', entityId: (req) => req.params.id }),
  transactionsC.remove
);

// --- /budgets ---
const budgetsRouter = Router();

budgetsRouter.get(
  '/',
  authorize(M, ACTIONS.READ),
  validate({ query: listBudgetsSchema }),
  budgetsC.list
);

budgetsRouter.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createBudgetSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'Budget',
    describe: (req) => `Created budget "${req.body.name}"`,
  }),
  budgetsC.create
);

budgetsRouter.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateBudgetSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Budget', entityId: (req) => req.params.id }),
  budgetsC.update
);

budgetsRouter.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Budget', entityId: (req) => req.params.id }),
  budgetsC.remove
);

const router = Router();

// All Finance routes require authentication.
router.use(authenticate);

/**
 * @swagger
 * tags: { name: Finance, description: Income / expense tracking, budgets & insights (Module 5) }
 */

router.use('/transactions', transactionsRouter);
router.use('/budgets', budgetsRouter);

// Dynamic dropdown options (categories + payment methods) — admin-customizable.
router.get('/options', authorize(M, ACTIONS.READ), transactionsC.listOptions);
router.post(
  '/options',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createFinanceOptionSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'FinanceOption',
    describe: (req) => `Added finance ${req.body.kind} "${req.body.label}"`,
  }),
  transactionsC.addOption
);

router.get(
  '/summary',
  authorize(M, ACTIONS.READ),
  validate({ query: summaryQuerySchema }),
  transactionsC.summary
);

router.post(
  '/ai-insights',
  authorize(M, ACTIONS.READ),
  validate({ body: aiInsightsSchema }),
  transactionsC.aiInsights
);

export default router;
