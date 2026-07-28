# Femcart API � Authentication & Security

> **Last Updated:** 2026-06-11 | **Source:** `src/services/authService.ts`, `src/middleware/auth.ts` | **AI-Maintained**

---

## Overview

Femcart uses **JWT (JSON Web Token)** based authentication with a dual-token strategy (access + refresh tokens). Additionally, it supports **OTP-based phone authentication** for guest and mobile-first checkout flows.

---

## Authentication Methods

### 1. Email + Password Authentication

**Registration:** `POST /api/auth/register`
- Validates email uniqueness
- Hashes password with bcrypt (cost factor: 12)
- If phone provided and a guest account already exists for that phone, **upgrades the guest** to a full account
- Creates a shopping cart for the new user
- Returns `accessToken` + `refreshToken`

**Login:** `POST /api/auth/login`
- Validates email + password
- Returns `accessToken` + `refreshToken` + user profile

**Phone Login:** `POST /api/auth/login-with-phone`
- Requires a registered (non-guest) account
- Returns same token pair

---

### 2. OTP Phone Authentication

This is the primary mobile checkout flow:

```
Step 1: POST /api/auth/send-otp    { phone }
         ? Sends 6-digit code via SMS (5 min expiry)
         ? Returns: { exists: bool, isRegistered: bool }
         ? Rate limited: max 3 OTP requests ? 10-min block

Step 2a (Login flow): POST /api/auth/verify-otp  { phone, code }
         ? Verifies code
         ? If no user: auto-creates guest account
         ? Returns: accessToken + refreshToken + user

Step 2b (Registration flow): POST /api/auth/verify-otp  { phone, code }
         ? Then: POST /api/auth/complete-registration
           { phone, name, email?, password }
         ? Upgrades guest stub to full account
```

**OTP Security Rules:**
- 6-digit code, 5-minute expiry
- Max 3 OTP send attempts ? blocked for 10 minutes
- Max 5 verify attempts ? blocked for 15 minutes
- OTP cost is NOT deducted from wallet (only transactional SMS is)

---

### 3. Super Admin Setup (First-Run Only)

`POST /api/auth/setup-super-admin`
- Works **only once** � blocked if any SUPER_ADMIN exists
- Requires `adminAccessKey: "ADMIN"` (hardcoded secret, change in production)
- Creates the first SUPER_ADMIN account

---

## Token System

### Access Token
- **Algorithm:** HS256
- **Payload:** `{ userId, role }`
- **Expiry:** `JWT_ACCESS_EXPIRES_IN` (default: `8h`)
- **Usage:** `Authorization: Bearer <token>` header

### Refresh Token
- **Algorithm:** HS256
- **Payload:** `{ userId, role }`
- **Expiry:** `JWT_REFRESH_EXPIRES_IN` (default: `7d`)
- **Storage:** Persisted in `user.refreshToken` column (single token per user � rotation on each refresh)
- **Validation:** Token in DB must match the token presented ? revoked on logout

**Refresh:** `POST /api/auth/refresh` `{ refreshToken }`
**Logout:** `POST /api/auth/logout` (clears `refreshToken` from DB)

---

## Authorization System

### Role Hierarchy

```
USER (default)
  +-- Can: access own profile, cart, orders, wishlist

ADMIN
  +-- Can: all USER capabilities + manage products, orders,
           categories, brands, media, coupons, users, builder

SUPER_ADMIN
  +-- Can: all ADMIN capabilities + manage other admins,
           admin roles & permissions, locked template packs
```

### Middleware Usage

```typescript
// Require authentication only
router.get('/my-orders', authenticate, controller.getMyOrders);

// Require specific role(s)
router.post('/products', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), controller.create);

// Optional auth (works for both guests and logged-in users)
router.post('/orders/calculate', optionalAuthenticate, controller.calculate);
```

### Granular Permission System

Admin users can have a custom `permissions` JSON array (stored in `user.permissions`). This allows fine-grained control beyond role-level access. The `AdminRole` model groups permissions into named roles (e.g., "Order Manager", "Content Editor").

Example permissions array:
```json
["orders.read", "orders.write", "products.read"]
```

---

## Security Middleware

### Rate Limiting
- Applied globally to all `/api/*` routes
- Also applied specifically to sensitive auth endpoints: `/login`, `/send-otp`, `/verify-otp`
- Configured via `express-rate-limit`

### Helmet
- Sets secure HTTP headers
- `crossOriginResourcePolicy: { policy: "cross-origin" }` � allows images to load cross-origin

### CORS
- Origin controlled by `FRONTEND_URL` env var
- Set `ALLOW_ALL_ORIGINS=true` to bypass (development only)
- `credentials: true` � allows cookies in cross-origin requests

---

## Password Security

- All passwords hashed with **bcryptjs** at cost factor **12** (registration) or **10** (guest account auto-created passwords)
- Guest accounts get a random 20-character password (they never need it � they use OTP)
- No plain-text passwords are ever stored or returned in API responses

---

## Known Security Notes

> [!WARNING]
> The `setupSuperAdmin` endpoint uses a hardcoded access key `"ADMIN"`. In a real production deployment, this should be changed to a strong environment-variable-based secret.

> [!WARNING]
> The `ForbiddenError` message in `authorize()` middleware contains `"DEBUG: Insufficient permissions (AUTH MOD)"` � this is a developer debug string that should be cleaned up before production.
