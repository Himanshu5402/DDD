import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './products.controller.js';
import {
  idParamSchema,
  itemParamSchema,
  listProductsSchema,
  createCategorySchema,
  createProductSchema,
  updateProductSchema,
  addVersionSchema,
  addRoadmapItemSchema,
  updateRoadmapItemSchema,
} from './products.validation.js';

const router = Router();
const M = MODULES.PRODUCTS;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Products, description: Products & Product Upgradation (Module 4) }
 */

router.get('/', authorize(M, ACTIONS.READ), validate({ query: listProductsSchema }), c.list);

// Categories — declared before '/:id' so the literal path isn't shadowed.
router.get('/categories', authorize(M, ACTIONS.READ), c.listCategories);
router.post(
  '/categories',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createCategorySchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ProductCategory', describe: (req) => `Added product category "${req.body.label}"` }),
  c.addCategory
);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createProductSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Product', describe: (req) => `Created product "${req.body.name}"` }),
  c.create
);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateProductSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Product', entityId: (req) => req.params.id }),
  c.update
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Product', entityId: (req) => req.params.id }),
  c.remove
);

router.post(
  '/:id/versions',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: addVersionSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'Product',
    entityId: (req) => req.params.id,
    describe: (req) => `Released version ${req.body.version}`,
  }),
  c.addVersion
);

router.post(
  '/:id/roadmap',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: addRoadmapItemSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'Product',
    entityId: (req) => req.params.id,
    describe: (req) => `Added roadmap item "${req.body.title}"`,
  }),
  c.addRoadmapItem
);

router.patch(
  '/:id/roadmap/:itemId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: itemParamSchema, body: updateRoadmapItemSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'Product',
    entityId: (req) => req.params.id,
    describe: (req) => `Moved roadmap item to ${req.body.status}`,
  }),
  c.updateRoadmapItem
);

export default router;
