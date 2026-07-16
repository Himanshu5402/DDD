# ITSYBIZZ Command Center

**AI-Powered Business Operating System (BOS)** built on the MERN stack — one modular, API-first platform that replaces scattered spreadsheets and tools across the business.

It answers the questions management actually asks: _What's happening today? What's delayed? Who's working on what? Which customers need follow-up? Which renewals are due? Where is money being spent? Which assets need maintenance? What should we focus on?_

---

## Modules (roadmap)

| # | Module | Status |
|---|--------|--------|
| — | **Foundation** (auth, RBAC, users/roles, audit, dynamic fields, providers) | ✅ done |
| 1 | Goal Management | ✅ done |
| 2 | Daily Task Management | ✅ done |
| 3 | RRRMAS (Recruitment / Running Projects / Renewals / Marketing / Support) | ✅ done |
| 4 | Products & Upgradation | ✅ done |
| 5 | Finance | ✅ done |
| 6 | Maintenance & Assets | ✅ done |
| 7 | Employee Analytics (HRMS) | ✅ done |
| 8 | Evening Reporting | ✅ done |
| 9 | AI Intelligence Layer | ✅ done |
| 10 | Dashboard | ✅ done |

## Tech stack

- **Frontend:** React 18 (**JavaScript only — no TypeScript**), Vite, Tailwind CSS, MUI, React Query, React Hook Form, Framer Motion, Recharts, Socket.IO client, PWA.
- **Backend:** Node.js + Express, MongoDB + Mongoose, JWT (access + refresh), **RBAC with module-level permissions**, Socket.IO, BullMQ/Redis (optional), Multer, Nodemailer, Helmet/CORS/rate-limiting, audit logs, Swagger/OpenAPI, Winston.
- **Pluggable providers:** storage (local → Cloudinary/S3), AI (Claude/OpenAI, MCP-ready).

## Repository layout

```
.
├── client/        # React + Vite (JavaScript) — config in client/.env
├── server/        # Express + Mongoose API   — config in server/.env
└── docker-compose.yml
```

## Quick start (dev)

All configuration lives in two env files (both gitignored — never commit them):

**`server/.env`** (required):

```ini
NODE_ENV=development
PORT=5000
API_PREFIX=/api/v1
CLIENT_URL=http://localhost:5173
MONGODB_URI=<your MongoDB / Atlas connection string>
JWT_ACCESS_SECRET=<random secret>
JWT_REFRESH_SECRET=<random secret>
SEED_ADMIN_EMAIL=admin@itsybizzz.local
SEED_ADMIN_PASSWORD=Admin@12345
STORAGE_PROVIDER=local
AI_PROVIDER=claude            # claude | openai | mock
ANTHROPIC_API_KEY=<your key>  # required when AI_PROVIDER=claude
ANTHROPIC_MODEL=claude-sonnet-5
```

**`client/.env`**:

```ini
VITE_API_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
```

Then:

```bash
npm install                       # installs all workspaces
npm run seed                      # create default roles/permissions + admin user
npm run dev                       # server (:5000) + client (:5173)
```

> Smoke tests (`npm run smoke*, -w server`) always run against an isolated in-memory MongoDB with the mock AI provider — they never touch your real database or spend API credits.

- API base: `http://localhost:5000/api/v1`
- API docs (Swagger): `http://localhost:5000/api/docs`
- Default admin: `admin@itsybizzz.local` / `Admin@12345` (change in `server/.env`)

### Production infra

```bash
docker compose up -d              # local Mongo + Redis (if not using Atlas)
# point MONGODB_URI / REDIS_URL in server/.env at these services
```

## Architecture principles

Modular & loosely coupled · API-first · RBAC with module-level permissions · dynamic custom fields · configurable workflows · audit logging · pluggable storage & AI providers · AI-ready data structures.
