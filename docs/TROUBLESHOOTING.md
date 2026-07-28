# Femcart API � Troubleshooting Guide

> **Last Updated:** 2026-06-11 | **AI-Maintained**

---

## Quick Diagnosis Checklist

1. Is the server running? ? `pm2 status` or `curl /api/health`
2. Is the database connected? ? Check logs for "Database connected successfully"
3. Is `.env` configured correctly? ? Verify `DATABASE_URL`, JWT secrets, `FRONTEND_URL`
4. Were migrations run? ? `npx prisma migrate status`
5. Was TypeScript built? ? `ls dist/server.js`

---

## Error Reference Table

| Problem | Symptoms | Root Cause | Fix |
|---------|---------|-----------|-----|
| Server won't start | Process exits immediately | Database connection failed | Verify `DATABASE_URL`; check MySQL is running |
| Server won't start | `Cannot find module 'dist/server.js'` | TypeScript not compiled | Run `npm run build` |
| Server won't start | Prisma client error | Schema changed without regenerating | Run `npx prisma generate` |
| Port conflict | `EADDRINUSE :5000` | Another process on port | `kill -9 $(lsof -t -i:5000)` |
| 401 on all requests | Invalid or expired token | JWT secret mismatch or expired token | Verify `JWT_ACCESS_SECRET` in .env |
| 403 Insufficient permissions | Role check fails | User doesn't have required role | Check user role in DB |
| 404 Route not found | All API calls 404 | Wrong base URL | Ensure requests use `/api/` prefix |
| CORS errors | Frontend gets CORS blocked | `FRONTEND_URL` mismatch | Set `FRONTEND_URL` to exact frontend origin |
| Images not loading | Broken image URLs | `API_URL` not set to public URL | Set `API_URL` to public backend domain |
| SMS not sent (dev) | No SMS received | Normal � dev mode mocks SMS | Check console log for mock SMS output |
| SMS not sent (prod) | OTP never arrives | Wrong API key or gateway config | Verify `SMS_API_KEY` in .env or Settings table |
| OTP blocked | "Too many requests" error | Rate limiting after 3 attempts | Wait 10 minutes; or reset `OTPVerification` record in DB |
| Payment redirect fails | SSLCommerz error | Missing store credentials | Set `SSL_STORE_ID`, `SSL_STORE_PASSWORD` |
| WooCommerce import fails | HTTP 401 from WC | Wrong consumer key/secret | Regenerate WooCommerce REST API keys |
| Builder page empty | Home page shows blank | No published version exists | Admin ? Builder ? Publish the home page |
| Stock not deducting | Orders placed but stock unchanged | `ignore_stock_limits=true` setting | Check Setting table, set to `false` |
| Cart not clearing | Cart persists after order | Cart cleanup job not running | Check `cartCleanupJob.start()` in server.ts; check cron is active |
| Migration fails | SQL error during migration | Schema conflict in DB | Backup DB, manually resolve conflict, re-run migration |
| Prisma type errors | TypeScript compile fails | Prisma client not regenerated | `npx prisma generate` then `npm run build` |
| `Cannot read property of undefined` | Server crash | Missing `.env` variable | Review `src/config/index.ts` defaults; add missing vars |

---

## Database Troubleshooting

### Check Connection

```bash
mysql -u <user> -p -h localhost <database>
```

### Check Pending Migrations

```bash
npx prisma migrate status
```

### View a Table in Prisma Studio

```bash
npm run db:studio
# Opens browser GUI on http://localhost:5555
```

### Reset Development Database (DANGER � dev only)

```bash
npx prisma migrate reset   # Drops DB, re-runs all migrations, re-seeds
```

### Manually Fix OTP Block

```sql
UPDATE otpverification 
SET attempts = 0, blockedUntil = NULL 
WHERE phone = '01XXXXXXXXX';
```

---

## Authentication Troubleshooting

### JWT Token Expired

**Symptom:** `401 Invalid or expired token`
**Fix:** Use the refresh token to get a new access token:
```bash
POST /api/auth/refresh
{ "refreshToken": "<your-refresh-token>" }
```

### Super Admin Endpoint Blocked

**Symptom:** `403 A super admin already exists`
**Cause:** The one-time setup has already been used
**Fix:** Log in with existing super admin credentials, or manually update role via DB:
```sql
UPDATE user SET role = 'SUPER_ADMIN' WHERE email = 'admin@example.com';
```

---

## Performance Troubleshooting

### Slow Queries

1. Check Prisma query logs (enable via `DATABASE_URL` with `?connection_limit=10`)
2. Look for missing indexes � all FK columns should be indexed (they are in this schema)
3. Check N+1 issues: ensure includes are used rather than loop queries

### High Memory Usage

- WooCommerce import runs in-process � imports keep 500 log lines per task in memory
- Restart PM2 after large imports: `pm2 restart femcart-api`

### Cart Cleanup Not Running

```bash
# Verify PM2 logs show "Cart Cleanup Job started"
pm2 logs femcart-api | grep "Cart Cleanup"
```

If missing, verify `cartCleanupJob.start()` is called in `server.ts` after `app.listen()`.

---

## Logs

### Application Logs

```bash
# PM2 logs (production)
pm2 logs femcart-api

# Dev logs appear in terminal (Morgan HTTP logs + custom logger)
```

### Custom Logger Levels

The `src/utils/logger.ts` provides `logger.info()`, `logger.error()`, `logger.warn()`. All logs go to stdout (captured by PM2).

### Key Log Patterns to Watch

| Log Pattern | Meaning |
|-------------|---------|
| `Database connected successfully` | Startup success |
| `[SMS] ABORTED: Insufficient global wallet balance` | Wallet empty � top up needed |
| `[FB-CAPI] Missing access token or pixel ID` | Facebook settings not configured |
| `[Task:XXXXXX] ? Failed to fetch product` | WooCommerce import error for a specific product |
| `[Config] Order Deduction Amount: 0` | Normal startup log showing config values |
| `Error during Abandoned Cart Cleanup:` | Cron job error � check DB connection |
