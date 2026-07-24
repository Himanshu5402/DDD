import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import { uploadImportFile, handleUpload } from '../../middleware/upload.middleware.js';
import * as importC from './import.controller.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Import, description: Excel/CSV/PDF file parsing for bulk form imports }
 */

router.post('/parse', handleUpload(uploadImportFile), importC.parse);

export default router;
