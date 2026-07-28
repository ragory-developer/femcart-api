# Femcart API � Commands & Operations Reference

> **Last Updated:** 2026-06-11 | **AI-Maintained**

---

## NPM Scripts

| Command | Purpose | When To Use | Environment | Expected Result | Notes |
|---------|---------|-------------|-------------|-----------------|-------|
| `npm install` | Install all dependencies | Initial setup, after `package.json` changes | Any | `node_modules/` populated | Run from project root |
| `npm run dev` | Start development server with hot-reload | Local development | Local only | Server starts on configured port | Uses `tsx watch` � restarts on file changes |
| `npm run build` | Compile TypeScript to JavaScript | Before production deployment | Server/CI | `dist/` folder generated | Required before `npm start` |
| `npm start` | Start production server | Production runtime | Server | Application starts from `dist/server.js` | Requires `npm run build` first |
| `npm run db:migrate` | Run Prisma migrations (interactive) | After schema changes | Local/Server | DB schema updated | Creates migration files; NOT for auto-deploy |
| `npm run db:push` | Push schema to DB without migration files | Prototyping / dev | Local | DB schema synced | **Dangerous in production** � does not create migration history |
| `npm run db:seed` | Run database seeder | Fresh database setup | Local/Server | Default data inserted (categories, settings, etc.) |  Review `prisma/seed.ts` before running |
| `npm run db:studio` | Open Prisma Studio GUI | DB inspection | Local | Browser GUI opens on port 5555 | Useful for debugging data |
| `npm test` | Run Vitest test suite | Before commits / CI | Any | Test results shown | Currently uses `vitest run` (non-interactive) |

---

## Script Files (`scripts/`)

| Script | Purpose | Run Command | Notes |
|--------|---------|-------------|-------|
| `add-admin.ts` | Add an admin user directly to DB | `npx tsx scripts/add-admin.ts` | Used when API endpoint can't be used |
| `seed-admin.ts` | Seed initial admin account | `npx tsx scripts/seed-admin.ts` | Used for initial setup |
| `seed-areas.ts` | Seed Bangladesh State/City/Area data | `npx tsx scripts/seed-areas.ts` | Run once for fresh setup |
| `seed-divisions.ts` | Seed division data | `npx tsx scripts/seed-divisions.ts` | Bangladesh administrative divisions |
| `seed-sidebar.ts` | Seed sidebar navigation | `npx tsx scripts/seed-sidebar.ts` | |
| `seed-navigation.ts` | Seed navbar & footer navigation items | `npx tsx scripts/seed-navigation.ts` | |
| `seed-contact-nav.ts` | Seed contact page navigation | `npx tsx scripts/seed-contact-nav.ts` | |
| `check_locations.ts` | Verify location data integrity | `npx tsx scripts/check_locations.ts` | Diagnostic only |

---

## Prisma Commands (Direct)

| Command | Purpose | When To Use | Risk |
|---------|---------|-------------|------|
| `npx prisma migrate dev --name <name>` | Create + apply a migration | After schema changes in dev | Low � local only |
| `npx prisma migrate deploy` | Apply pending migrations | Production deployment | Medium � irreversible |
| `npx prisma migrate status` | Show pending migrations | Before deployment | None � read only |
| `npx prisma generate` | Regenerate Prisma Client | After schema changes | None |
| `npx prisma db push` | Sync schema without migration | Dev prototyping | High � bypasses migration history |
| `npx prisma studio` | Open GUI | DB debugging | None � read/write GUI |
| `npx prisma db seed` | Run seed file | Fresh DB setup | Medium � inserts/modifies data |

---

## Full Setup Sequence (Fresh Environment)

```bash
# 1. Clone and install
git clone <repo>
cd femcart-api
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Run migrations
npx prisma migrate deploy
# OR for development:
npm run db:migrate

# 4. Seed the database
npx tsx scripts/seed-areas.ts    # Bangladesh locations
npx tsx scripts/seed-navigation.ts  # Nav items
npm run db:seed                   # Main seed (categories, settings, etc.)

# 5. Create super admin
# POST /api/auth/setup-super-admin (one-time endpoint)
# OR: npx tsx scripts/seed-admin.ts

# 6. Start server
npm run dev      # Development
npm run build && npm start   # Production
```

---

## Environment Variables Reference

All variables must be set in `.env` file (copy from `.env.example`):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `DATABASE_URL` | **Yes** | � | MySQL connection string: `mysql://user:pass@host:3306/db` |
| `JWT_ACCESS_SECRET` | **Yes** | `access-secret` | JWT signing secret for access tokens |
| `JWT_REFRESH_SECRET` | **Yes** | `refresh-secret` | JWT signing secret for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | No | `8h` | Access token expiry (e.g., `15m`, `8h`) |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiry |
| `FRONTEND_URL` | **Yes** | `http://localhost:3000` | Allowed CORS origin |
| `ALLOW_ALL_ORIGINS` | No | `false` | Set `true` to allow all CORS origins (dev only) |
| `API_URL` | No | `http://localhost:5000` | Self-reference URL for media/webhook URLs |
| `SMS_GATEWAY_URL` | No | MassData URL | SMS gateway endpoint |
| `SMS_API_KEY` | No | � | SMS gateway API key |
| `SMS_COST_PER_SMS` | No | `0.40` | Per-SMS cost for wallet deduction |
| `SMS_SENDER_ID` | No | � | Sender ID for SMS |
| `SSL_STORE_ID` | No | � | SSLCommerz store ID |
| `SSL_STORE_PASSWORD` | No | � | SSLCommerz store password |
| `ORDER_DEDUCTION_AMOUNT` | No | `0` | Amount to deduct from global wallet per order |
| AWS credentials | No | � | For S3 media storage (configured via AWS SDK default chain) |

> [!NOTE]
> SMS is automatically mocked in `NODE_ENV=development` � messages are logged to console instead of sent.

---

## Background Job Operations

| Job | Schedule | Configuration | Expected Behavior |
|-----|----------|---------------|-------------------|
| Cart Cleanup | `0 * * * *` (hourly) | DB setting `abandoned_cart_expiry_hours` (default: 24) | Deletes carts older than configured hours |

**Disable cart cleanup:** Set `abandoned_cart_expiry_hours` to `0` in the Settings table.

---

## API Documentation

When server is running, Swagger UI is available at:
```
http://localhost:5000/api-docs
```
