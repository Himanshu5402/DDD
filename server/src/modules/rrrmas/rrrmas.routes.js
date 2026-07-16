import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

import * as contactsC from './contacts.controller.js';
import * as projectsC from './projects.controller.js';
import * as renewalsC from './renewals.controller.js';
import * as campaignsC from './campaigns.controller.js';
import * as ticketsC from './tickets.controller.js';

import * as contactsV from './contacts.validation.js';
import * as projectsV from './projects.validation.js';
import * as renewalsV from './renewals.validation.js';
import * as campaignsV from './campaigns.validation.js';
import * as ticketsV from './tickets.validation.js';

const M = MODULES.RRRMAS;

/**
 * Build a standard CRUD sub-router (list + get + create + update + delete)
 * for one RRRMAS resource, wired with RBAC, validation and audit.
 */
function buildResource({
  controller,
  listSchema,
  createSchema,
  updateSchema,
  idParamSchema,
  entityType,
  describeCreate,
}) {
  const router = Router();

  router.get('/', authorize(M, ACTIONS.READ), validate({ query: listSchema }), controller.list);

  router.post(
    '/',
    authorize(M, ACTIONS.CREATE),
    validate({ body: createSchema }),
    auditAction({ action: ACTIONS.CREATE, module: M, entityType, describe: describeCreate }),
    controller.create
  );

  router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), controller.getOne);

  router.patch(
    '/:id',
    authorize(M, ACTIONS.UPDATE),
    validate({ params: idParamSchema, body: updateSchema }),
    auditAction({ action: ACTIONS.UPDATE, module: M, entityType, entityId: (req) => req.params.id }),
    controller.update
  );

  router.delete(
    '/:id',
    authorize(M, ACTIONS.DELETE),
    validate({ params: idParamSchema }),
    auditAction({ action: ACTIONS.DELETE, module: M, entityType, entityId: (req) => req.params.id }),
    controller.remove
  );

  return router;
}

const contactsRouter = buildResource({
  controller: contactsC,
  listSchema: contactsV.listContactsSchema,
  createSchema: contactsV.createContactSchema,
  updateSchema: contactsV.updateContactSchema,
  idParamSchema: contactsV.idParamSchema,
  entityType: 'Contact',
  describeCreate: (req) => `Created contact "${req.body.name}"`,
});

const projectsRouter = buildResource({
  controller: projectsC,
  listSchema: projectsV.listProjectsSchema,
  createSchema: projectsV.createProjectSchema,
  updateSchema: projectsV.updateProjectSchema,
  idParamSchema: projectsV.idParamSchema,
  entityType: 'Project',
  describeCreate: (req) => `Created project "${req.body.name}"`,
});

const renewalsRouter = buildResource({
  controller: renewalsC,
  listSchema: renewalsV.listRenewalsSchema,
  createSchema: renewalsV.createRenewalSchema,
  updateSchema: renewalsV.updateRenewalSchema,
  idParamSchema: renewalsV.idParamSchema,
  entityType: 'Renewal',
  describeCreate: (req) => `Created renewal "${req.body.title}"`,
});

const campaignsRouter = buildResource({
  controller: campaignsC,
  listSchema: campaignsV.listCampaignsSchema,
  createSchema: campaignsV.createCampaignSchema,
  updateSchema: campaignsV.updateCampaignSchema,
  idParamSchema: campaignsV.idParamSchema,
  entityType: 'Campaign',
  describeCreate: (req) => `Created campaign "${req.body.name}"`,
});

const ticketsRouter = buildResource({
  controller: ticketsC,
  listSchema: ticketsV.listTicketsSchema,
  createSchema: ticketsV.createTicketSchema,
  updateSchema: ticketsV.updateTicketSchema,
  idParamSchema: ticketsV.idParamSchema,
  entityType: 'SupportTicket',
  describeCreate: (req) => `Created support ticket "${req.body.subject}"`,
});

const router = Router();

// All RRRMAS routes require authentication.
router.use(authenticate);

/**
 * @swagger
 * tags: { name: RRRMAS, description: Recruitment CRM / Projects / Renewals / Marketing / Support (Module 3) }
 */

router.use('/contacts', contactsRouter);
router.use('/projects', projectsRouter);
router.use('/renewals', renewalsRouter);
router.use('/campaigns', campaignsRouter);
router.use('/tickets', ticketsRouter);

export default router;
