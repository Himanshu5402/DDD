import path from "node:path";
import { fileURLToPath } from "node:url";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import env from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "ITSYBIZZ Command Center API",
      version: "0.1.0",
      description: "AI-powered Business Operating System — REST API",
    },
    servers: [{ url: env.API_PREFIX, description: "API v1" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
            code: { type: "string" },
            requestId: { type: "string" },
          },
        },
      },
    },
    tags: [{ name: "System" }],
  },
  // Scan route files for @swagger JSDoc annotations.
  apis: [
    path.join(__dirname, "../modules/**/*.js"),
    path.join(__dirname, "../routes/*.js"),
  ],
});

/** Mount Swagger UI at /api/docs and raw spec at /api/docs.json. */
export function mountSwagger(app) {
  app.get("/api/docs.json", (_req, res) => res.json(spec));
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, { customSiteTitle: "ITSYBIZZ API Docs" }),
  );
}

export default spec;
