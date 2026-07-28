# Femcart API � Architecture Documentation

> **Last Updated:** 2026-06-11 | **AI-Maintained**

---

## High-Level Architecture

```
+-----------------------------------------------------------+
�                    Client Applications                     �
�         (Next.js Frontend / Admin Panel / Mobile)          �
+-----------------------------------------------------------+
                             � HTTPS
                             ?
+-----------------------------------------------------------+
�                   Express.js HTTP Server                   �
�                    (Port: 5000 default)                    �
�  +-----------------------------------------------------+  �
�  �                  Middleware Stack                    �  �
�  �  Helmet ? CORS ? RateLimit ? JSON ? Cookie ? Morgan �  �
�  +-----------------------------------------------------+  �
�  +-----------------------------------------------------+  �
�  �                  API Router /api/*                   �  �
�  �  /auth  /products  /orders  /cart  /builder  /users  �  �
�  �  /media  /wallet  /locations  /navigation  /wordpress �  �
�  +-----------------------------------------------------+  �
+-----------------------+-----------------------------------+
                        �
          +-------------+-------------+
          ?             ?             ?
   +----------+  +----------+  +----------+
   �Controllers�  �Services  �  �  Utils   �
   �(29 files) �  �(10 files) �  � (errors, �
   �           �  �           �  � SMS, FB  �
   �           �  �           �  �  CAPI)   �
   +-----------+  +----------+  +----------+
          �
          ?
   +--------------+
   �  Prisma ORM  �
   �  (schema.    �
   �  prisma)     �
   +--------------+
          �
          ?
   +--------------+
   �   MySQL DB   �
   +--------------+

External Integrations:
 +-------------+  +-------------+  +-------------+
 �  AWS S3     �  � Facebook    �  � SMS Gateway �
 � (Media Stor)�  � Conversions �  � (MassData)  �
 +-------------+  +-------------+  +-------------+
 +-------------+  +-------------+
 � SSLCommerz  �  � WooCommerce �
 � (Payments)  �  � (Import)    �
 +-------------+  +-------------+
```

---

## Application Bootstrap Sequence

```
server.ts
   �
   +-- 1. Import app (Express instance + middleware)
   +-- 2. prisma.$connect()  ? verify DB connection
   +-- 3. app.listen(port)   ? start HTTP server
   +-- 4. cartCleanupJob.start()  ? activate cron jobs
   +-- 5. Register SIGTERM handler for graceful shutdown

app.ts
   �
   +-- setupSwagger(app)              ? /api-docs
   +-- helmet()                       ? security headers
   +-- apiLimiter on /api/*           ? rate limiting
   +-- cors({ origin: frontendUrl })  ? CORS
   +-- express.json()                 ? body parsing
   +-- cookieParser()                 ? cookies
   +-- morgan('dev')                  ? HTTP logging
   +-- /uploads static                ? local media
   +-- GET /api/health                ? health check
   +-- /api ? apiRoutes               ? all routes
   +-- GET /api/user-stats-service/stats  ? dashboard
   +-- 404 handler                    ? catch-all
   +-- errorHandler()                 ? global errors
```

---

## Request Flow (typical authenticated route)

```
HTTP Request
    �
    ?
Express Router (/api/*)
    �
    ?
Rate Limiter (apiLimiter)
    �
    ?
Route Handler (e.g., PUT /api/builder/pages/:key/draft)
    �
    ?
authenticate middleware
  +-- Read Authorization: Bearer <token>
  +-- jwt.verify(token, accessSecret)
  +-- Attach req.user = { userId, role }
    �
    ?
authorize('ADMIN', 'SUPER_ADMIN') middleware
  +-- Check req.user.role ? allowed roles
    �
    ?
validate(schema) middleware (if present)
  +-- Zod schema parse on req.body
    �
    ?
Controller method (asyncHandler wrapper)
  +-- Extract params/body/query
  +-- Call service or direct Prisma queries
  +-- Prisma transaction (if multi-step)
  +-- res.json({ success: true, data: ... })
    �
    ?
errorHandler middleware (catches ApiError + unexpected errors)
  +-- res.status(error.statusCode).json({ success: false, message })
```

---

## Middleware Stack Details

### `src/middleware/auth.ts`

| Function | Purpose |
|----------|---------|
| `authenticate` | Verifies JWT access token from `Authorization: Bearer` header. Blocks with 401 if missing/invalid. |
| `optionalAuthenticate` | Tries to authenticate but continues as guest if token is missing or invalid. Used for endpoints that work for both guests and logged-in users. |
| `authorize(...roles)` | Role guard, must be used *after* `authenticate`. Blocks with 403 if role not in list. |

### `src/middleware/rateLimiters.ts`

A global `apiLimiter` is applied to all `/api/*` routes. Configuration is set via `express-rate-limit`.

### `src/middleware/validate.ts`

Wraps Zod schemas. Runs `schema.parse(req.body)` and throws a 400 error if validation fails.

### `src/middleware/errorHandler.ts`

Catches all errors passed via `next(error)`. Distinguishes `ApiError` (operational, uses `statusCode`) from unexpected errors (returns 500).

---

## Configuration Architecture

All configuration is loaded from environment variables via `src/config/index.ts`:

```typescript
export const config = {
  port: number,
  nodeEnv: string,
  database: { url: string },
  jwt: {
    accessSecret: string,
    refreshSecret: string,
    accessExpiresIn: string,  // default: '15m'
    refreshExpiresIn: string, // default: '7d'
  },
  frontendUrl: string,
  allowAllOrigins: boolean,    // ALLOW_ALL_ORIGINS=true bypasses CORS origin check
  apiUrl: string,
  sms: { gatewayUrl, apiKey, senderId, costPerSms },
  orderDeductionAmount: number, // auto-deduct from global wallet per order
}
```

---

## Controller Architecture

All controllers extend `BaseController`. The `asyncHandler()` utility wraps async route handlers to automatically catch promise rejections and pass to `next()`.

| Controller | Responsibilities |
|-----------|-----------------|
| `AuthController` | register, login, OTP, refresh, logout |
| `UserController` | profile, addresses, dashboard stats |
| `ProductController` | CRUD, search/filter, variants, bulk promotions |
| `CategoryController` | CRUD, hierarchical categories |
| `BrandController` | CRUD |
| `OrderController` | place, list, status updates, returns, notes |
| `CartController` | add/update/remove items, view cart |
| `WishlistController` | add/remove/list wishlist items |
| `BuilderController` | page CRUD, drafts, publish, templates, components |
| `MediaController` | upload, list, delete (S3 or local) |
| `NavigationController` | Navbar items + Footer sections/links CRUD |
| `LocationController` | State/City/Area CRUD |
| `CouponController` | CRUD + validate |
| `WalletController` | balance, transactions, top-up |
| `WordpressController` | WooCommerce settings + import trigger |
| `SettingController` | Key-value store for global settings |
| `PageController` | Static CMS pages (non-builder) |
| `FacebookAdsController` | Facebook pixel + CAPI settings |
| `SmsController` | SMS settings management |
| `ContactController` | Contact form submission + admin read |
| `TestimonialController` | CRUD for customer testimonials |
| `TrackingController` | Order tracking (public) |
| `ReviewController` | Product reviews (from WooCommerce import or manual) |
| `TagController` | Product tags CRUD |
| `SpecificationController` | Attribute/AttributeValue CRUD |
| `VariationController` | Variation/VariationValue CRUD |
| `AdminRoleController` | Admin role & permission management |
| `PaymentController` | SSLCommerz payment initiation |

---

## Service Layer

Services encapsulate complex business logic. They use Prisma directly.

| Service | Responsibilities |
|---------|-----------------|
| `authService.ts` | Full auth lifecycle: register, login, OTP send/verify, token management |
| `walletService.ts` | Global wallet balance read/write, `adjustGlobalBalance()` utility |
| `imageService.ts` | Image upload processing (Sharp resize to thumbnail/medium/full), S3 or local storage |
| `importService.ts` | WooCommerce product import logic (map WC data to Prisma schema) |
| `importQueue.ts` | In-process task queue (max 1 concurrent), start/cancel/pause tasks |
| `wordpressService.ts` | WooCommerce REST API fetch utility |
| `cartService.ts` | Cart operations |
| `navigationService.ts` | Navbar/footer data assembly |
| `userService.ts` | User-specific data queries |
| `adminUsersService.ts` | Admin user management |

---

## Background Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `cartCleanup.ts` | Every hour (`0 * * * *`) | Deletes carts older than configurable `abandoned_cart_expiry_hours` setting (default: 24h) |

---

## External Integrations

### SMS Gateway (MassData)
- **Purpose:** OTP delivery, order status notifications
- **Config:** `SMS_GATEWAY_URL`, `SMS_API_KEY`, `SMS_SENDER_ID` (env or DB setting)
- **Behavior:** In development mode, SMS is mocked (logged to console). In production, sends to actual gateway.
- **Cost tracking:** Deducts from global wallet before sending (except OTP). Refunds on failure.

### Facebook Conversions API
- **Purpose:** Server-side tracking of purchase events
- **Config:** `facebook_capi_token`, `facebook_pixel_id` stored in `Setting` table
- **Trigger:** Fires async after successful order placement
- **Data:** Hashed email/phone/userId, order value in BDT

### AWS S3
- **Purpose:** Media storage (images)
- **Config:** AWS credentials (via env or instance role)
- **Fallback:** Local `uploads/` folder if S3 is not configured

### WooCommerce Import
- **Purpose:** Migrate products from an existing WooCommerce store
- **Config:** Stored in `WordPressSetting` table per-site
- **Mechanism:** REST API calls with Basic Auth (consumerKey:consumerSecret)

### SSLCommerz
- **Purpose:** Online payment gateway (Bangladesh)
- **Config:** `SSL_STORE_ID`, `SSL_STORE_PASSWORD`
- **Status:** Partially implemented (gateway redirect logic in `PaymentController`)
