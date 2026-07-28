# Femcart API � AI Onboarding Guide

> **Last Updated:** 2026-06-11 | **For AI Agents & New Developers**

---

## What Is This Project?

**Femcart** is a production-ready **grocery e-commerce REST API** built with:
- **Language:** TypeScript
- **Framework:** Express.js
- **ORM:** Prisma (MySQL)
- **Runtime:** Node.js 18+

It is the **backend API** for a grocery/lifestyle e-commerce platform primarily targeting Bangladesh. The frontend (not in this repo) consumes this API.

---

## Repository Location

```
/home/shaharia/E_COM_API/femcart-api
```

---

## Quick Project Map

```
src/
+-- server.ts         ? Start here: bootstrap, DB connect, jobs
+-- app.ts            ? Express app, middleware, route registration
+-- config/index.ts   ? All env vars exposed as `config` object
+-- routes/index.ts   ? Master router � all 30 route modules
�
+-- controllers/      ? HTTP handlers (29 controllers)
�   +-- BuilderController.ts    ? MOST COMPLEX: page builder
�   +-- OrderController.ts      ? MOST COMPLEX: order lifecycle
�   +-- ProductController.ts    ? Product CRUD + search
�   +-- AuthController.ts       ? Auth flows
�
+-- services/         ? Business logic
�   +-- authService.ts          ? JWT, OTP, register, login
�   +-- importQueue.ts          ? WooCommerce import task manager
�   +-- walletService.ts        ? Global wallet balance
�
+-- middleware/
�   +-- auth.ts                 ? authenticate, optionalAuthenticate, authorize
�   +-- validate.ts             ? Zod validation middleware
�   +-- errorHandler.ts         ? Centralized error responses
�
+-- validators/
�   +-- builder.schema.ts       ? Zod schemas for builder documents
�   +-- auth.schema.ts          ? Zod schemas for auth endpoints
�
+-- utils/
    +-- errors.ts               ? ApiError, BadRequestError, etc.
    +-- helpers.ts              ? asyncHandler, parsePagination, slugify, getActivePrice
    +-- sms.ts                  ? SMS gateway integration + wallet deduction
    +-- facebook-capi.ts        ? Facebook Conversions API

prisma/
+-- schema.prisma       ? SINGLE SOURCE OF TRUTH for all database models
+-- seed.ts             ? Initial data seed

docs/                   ? All documentation (maintained by AI)
```

---

## Core Concepts to Understand Immediately

### 1. Authentication is JWT + OTP dual-track

- **Email/password:** Traditional login (`/api/auth/login`)
- **Phone/OTP:** Mobile-first login (`/api/auth/send-otp` ? `/api/auth/verify-otp`)
- **Guest accounts:** Auto-created when anonymous users check out
- **Tokens:** Short-lived `accessToken` (8h) + long-lived `refreshToken` (7d)
- **Role:** `USER`, `ADMIN`, `SUPER_ADMIN` � embedded in JWT payload

### 2. Two middleware functions protect routes

```typescript
authenticate         // Verify JWT, attach req.user
authorize('ADMIN')   // Check role � must come AFTER authenticate
```

### 3. All async controllers use asyncHandler

```typescript
someMethod = asyncHandler(async (req, res) => {
  // Errors thrown here are caught automatically and passed to errorHandler
});
```

### 4. Prisma is the ORM

- Schema: `prisma/schema.prisma`
- Client: `import prisma from '../config/database'`
- Transactions: `await prisma.$transaction(async (tx) => { ... })`
- All complex writes use transactions

### 5. Builder System = JSON document in database

Pages are JSON (validated by Zod) stored as `BuilderPageVersion.document`. The frontend reads `/api/builder/public/home` to get the layout JSON and renders it as components.

---

## Key Files You Must Read

| File | Why |
|------|-----|
| `prisma/schema.prisma` | All database models � read this first |
| `src/config/index.ts` | What env vars exist and their defaults |
| `src/middleware/auth.ts` | How authentication and authorization work |
| `src/validators/builder.schema.ts` | Builder document structure |
| `src/controllers/BuilderController.ts` | Builder system implementation |
| `src/controllers/OrderController.ts` | Order lifecycle with stock/coupon/wallet logic |
| `src/services/authService.ts` | Full auth flow including OTP |

---

## How to Find an API Endpoint

1. Start at `src/routes/index.ts` � all route modules are registered here
2. Find the route module (e.g., `orderRoutes.ts` for `/api/orders/*`)
3. Find the controller method called by that route
4. Find the controller file (e.g., `OrderController.ts`)

---

## Common Patterns

### Creating a new feature

1. Add model to `prisma/schema.prisma`
2. Run `npx prisma migrate dev`
3. Create controller in `src/controllers/`
4. Create route file in `src/routes/`
5. Register route in `src/routes/index.ts`

### Validation

All request bodies are validated with Zod in `src/validators/`. Use the `validate(schema)` middleware in routes.

### Error handling

```typescript
throw new BadRequestError('Descriptive message');   // ? 400
throw new NotFoundError('Product not found');        // ? 404
throw new UnauthorizedError('Token required');       // ? 401
throw new ForbiddenError('Admin only');              // ? 403
```

### Settings (runtime configuration)

Key-value pairs in the `Setting` table. Read with:
```typescript
const setting = await prisma.setting.findUnique({ where: { key: 'some_key' } });
```

---

## Critical Business Rules

1. **Stock validation:** Orders check stock unless `ignore_stock_limits` setting is `"true"`
2. **Stock management:** Stock decrements on order creation, increments on cancellation, increments on return (not damage)
3. **Coupons:** Validated inside transaction to prevent race conditions on `maxUses`
4. **OTP:** Maximum 3 send attempts, 5 verify attempts � blocks for 10-15 minutes
5. **Guest checkout:** Users can order without an account � a guest user is auto-created
6. **SMS cost:** All non-OTP SMS deducts from global wallet; fails if balance is 0
7. **Builder versions:** Every save creates a new immutable version; publish promotes a draft
8. **Reward points:** Only credited when order reaches `COMPLETED` status; revoked if status reverts

---

## External Dependencies Summary

| Service | Purpose | Config |
|---------|---------|--------|
| MySQL | Database | `DATABASE_URL` |
| AWS S3 | Media storage | AWS SDK credentials |
| MassData | SMS gateway | `SMS_API_KEY` or DB setting |
| Facebook | Conversions API | DB settings: `facebook_capi_token`, `facebook_pixel_id` |
| SSLCommerz | Payment gateway | `SSL_STORE_ID`, `SSL_STORE_PASSWORD` |
| WooCommerce | Product import source | DB: `WordPressSetting` |

---

## Documentation Map

| Document | What It Covers |
|----------|---------------|
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | Business purpose, features, tech stack |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, request flow, middleware |
| [DATABASE.md](./DATABASE.md) | All models, relationships, enums |
| [API_REFERENCE.md](./API_REFERENCE.md) | Every endpoint with request/response examples |
| [BUILDER_SYSTEM.md](./BUILDER_SYSTEM.md) | Builder deep-dive: concepts, workflow, security |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Auth flows, JWT details, OTP, security notes |
| [DATA_FLOW.md](./DATA_FLOW.md) | Step-by-step flows for order, builder, auth, SMS |
| [COMMANDS_AND_OPERATIONS.md](./COMMANDS_AND_OPERATIONS.md) | All npm scripts, Prisma commands, env vars |
| [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) | Local, Docker, production setup |
| [DEPLOYMENT_PLAYBOOK.md](./DEPLOYMENT_PLAYBOOK.md) | Deploy, update, rollback procedures |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common errors and how to fix them |
| [CHANGELOG_AI.md](./CHANGELOG_AI.md) | AI-tracked change history |
| [AI_ONBOARDING.md](./AI_ONBOARDING.md) | This document |

---

## Development Workflow

```bash
# Start development
npm run dev

# Make schema change
# 1. Edit prisma/schema.prisma
# 2. npx prisma migrate dev
# 3. npx prisma generate (if needed)

# Run tests
npm test

# Build for production
npm run build

# View database
npm run db:studio
```

---

## Known Issues / Technical Debt

1. **`setupSuperAdmin` hardcoded key:** The admin access key is hardcoded as `"ADMIN"` � should be moved to an env var
2. **Debug message in auth middleware:** `authorize()` returns `"DEBUG: Insufficient permissions (AUTH MOD)"` � should be cleaned up
3. **`DEBUG` console.log in OrderController:** Several `console.log('[DEBUG]...')` lines in production code should be removed or moved to logger
4. **No Docker support:** No `Dockerfile` or `docker-compose.yml` � containerization would improve portability
5. **Import runs in-process:** WooCommerce import blocks the Node.js event loop; should be moved to a worker thread or separate process for large catalogs
6. **SSLCommerz partially implemented:** `PaymentController.initiate` initiates payment but webhook handling for callbacks is incomplete
