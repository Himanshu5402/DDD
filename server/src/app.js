import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import morgan from 'morgan';

import env, { isProd } from './config/env.js';
import { corsOrigin } from './config/cors.js';
import { httpLogStream } from './config/logger.js';
import requestId from './middleware/requestId.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import notFound from './middleware/notFound.middleware.js';
import errorHandler from './middleware/error.middleware.js';
import apiRoutes from './routes/index.js';
import { mountSwagger } from './docs/swagger.js';
import { LocalStorageProvider } from './services/storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built React app (client/dist) — served by Express in production so the
// whole platform (API + frontend + Socket.IO) runs as ONE service.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct req.ip behind a proxy/load balancer

  // Security & parsing. CSP is disabled because the SPA + Socket.IO are
  // served same-origin; re-enable with a tailored policy if needed.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(compression());
  app.use(mongoSanitize());
  app.use(hpp());

  // Observability
  app.use(requestId);
  app.use(morgan(isProd ? 'combined' : 'dev', { stream: httpLogStream }));

  // Static: locally-stored uploads (no-op if using a cloud storage provider)
  app.use('/uploads', express.static(LocalStorageProvider.root));

  // API docs
  mountSwagger(app);

  // Rate-limited API
  app.use(env.API_PREFIX, apiLimiter, apiRoutes);

  if (isProd) {
    // Production: serve the built React app + SPA fallback (client-side routes
    // like /tasks or /projects must all resolve to index.html).
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: 'index.html' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  } else {
    // Dev: the client runs on Vite (:5173); the API root just identifies itself.
    app.get('/', (_req, res) =>
      res.json({ name: 'ITSYBIZZ Command Center API', version: '0.1.0', docs: '/api/docs' })
    );
  }

  // 404 + error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
