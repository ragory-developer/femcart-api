# Femcart API � Complete API Reference

> **Last Updated:** 2026-06-11 | **Base URL:** `http://localhost:5000/api` | **AI-Maintained**

> **Swagger UI:** Available at `/api-docs` when server is running.

---

## Authentication

Protected endpoints require: `Authorization: Bearer <accessToken>`

**Roles:** `USER`, `ADMIN`, `SUPER_ADMIN`

---

## Table of Contents

1. [Health](#1-health)
2. [Authentication](#2-authentication)
3. [Users](#3-users)
4. [Products](#4-products)
5. [Categories](#5-categories)
6. [Brands](#6-brands)
7. [Tags](#7-tags)
8. [Cart](#8-cart)
9. [Orders](#9-orders)
10. [Payments](#10-payments)
11. [Wishlist](#11-wishlist)
12. [Coupons](#12-coupons)
13. [Media](#13-media)
14. [Builder](#14-builder)
15. [Navigation](#15-navigation)
16. [Locations](#16-locations)
17. [Wallet](#17-wallet)
18. [Settings](#18-settings)
19. [Pages (CMS)](#19-pages-cms)
20. [WordPress / Import](#20-wordpress--import)
21. [Admin Users](#21-admin-users)
22. [Admin Roles](#22-admin-roles)
23. [Specifications (Attributes)](#23-specifications-attributes)
24. [Variations](#24-variations)
25. [Testimonials](#25-testimonials)
26. [Reviews](#26-reviews)
27. [Tracking](#27-tracking)
28. [Facebook Ads](#28-facebook-ads)
29. [Contact](#29-contact)
30. [SMS](#30-sms)

---

## 1. Health

### `GET /api/health`
**Auth:** None | **Purpose:** Verify API is running

**Response:**
```json
{ "status": "ok", "timestamp": "2026-06-11T03:38:26.000Z" }
```

---

## 2. Authentication

### `POST /api/auth/register`
**Auth:** None | **Purpose:** Register with email + password

**Body:**
```json
{ "email": "user@example.com", "password": "secret123", "name": "John Doe", "phone": "01XXXXXXXXX" }
```
**Response 201:**
```json
{ "user": { "id": "...", "email": "...", "name": "...", "role": "USER" }, "accessToken": "...", "refreshToken": "..." }
```

---

### `POST /api/auth/setup-super-admin`
**Auth:** None (one-time only) | **Purpose:** Create first super admin

**Body:**
```json
{ "email": "admin@example.com", "password": "secret", "name": "Admin", "adminAccessKey": "ADMIN" }
```

---

### `POST /api/auth/login`
**Auth:** None | **Rate Limited** | **Purpose:** Email + password login

**Body:**
```json
{ "email": "user@example.com", "password": "secret123" }
```
**Response 200:**
```json
{
  "user": { "id": "...", "email": "...", "name": "...", "role": "USER", "phone": "...", "isGuest": false, "permissions": [] },
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

### `POST /api/auth/login-with-phone`
**Auth:** None | **Rate Limited** | **Purpose:** Phone + password login

**Body:** `{ "phone": "01XXXXXXXXX", "password": "secret123" }`

---

### `POST /api/auth/send-otp`
**Auth:** None | **Rate Limited** | **Purpose:** Send OTP to phone number

**Body:** `{ "phone": "01XXXXXXXXX" }`
**Response:** `{ "exists": true, "isRegistered": false }`

---

### `POST /api/auth/verify-otp`
**Auth:** None | **Rate Limited** | **Purpose:** Verify OTP code, auto-login/create guest

**Body:** `{ "phone": "01XXXXXXXXX", "code": "123456", "name": "Guest" }`

---

### `POST /api/auth/complete-registration`
**Auth:** None | **Purpose:** Upgrade OTP-verified phone to full account

**Body:** `{ "phone": "01XXXXXXXXX", "name": "John Doe", "email": "john@example.com", "password": "secret" }`

---

### `POST /api/auth/refresh`
**Auth:** None | **Purpose:** Get new access token

**Body:** `{ "refreshToken": "..." }`
**Response:** `{ "accessToken": "...", "refreshToken": "..." }`

---

### `POST /api/auth/logout`
**Auth:** Bearer | **Purpose:** Invalidate refresh token

---

## 3. Users

### `GET /api/users/profile`
**Auth:** Bearer (USER+) | **Purpose:** Get own profile

### `PUT /api/users/profile`
**Auth:** Bearer (USER+) | **Purpose:** Update own profile

**Body:** `{ "name": "...", "phone": "...", "address": "...", "city": "...", "area": "...", "gender": "...", "dateOfBirth": "..." }`

### `PUT /api/users/change-password`
**Auth:** Bearer (USER+) | **Purpose:** Change own password

**Body:** `{ "currentPassword": "...", "newPassword": "..." }`

### `GET /api/users/addresses`
**Auth:** Bearer (USER+) | **Purpose:** List saved delivery addresses

### `POST /api/users/addresses`
**Auth:** Bearer (USER+) | **Purpose:** Add delivery address

**Body:** `{ "label": "Home", "address": "...", "city": "...", "area": "...", "stateId": "...", "cityId": "...", "areaId": "...", "recipientName": "...", "recipientPhone": "...", "isDefault": true }`

### `PUT /api/users/addresses/:id`
**Auth:** Bearer (USER+) | **Purpose:** Update address

### `DELETE /api/users/addresses/:id`
**Auth:** Bearer (USER+) | **Purpose:** Delete address

### `GET /api/user-stats-service/stats`
**Auth:** Bearer (USER+) | **Purpose:** Dashboard statistics for user

---

## 4. Products

### `GET /api/products`
**Auth:** None | **Purpose:** List products with filtering and pagination

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `search` | string | Full-text search across name, description, brand, categories, tags, variant attributes |
| `category` | string | Comma-separated category slugs |
| `brand` | string | Comma-separated brand slugs |
| `minPrice` | number | Minimum price filter |
| `maxPrice` | number | Maximum price filter |
| `sort` | string | `price_asc`, `price_desc`, `name` (default: newest) |
| `featured` | boolean | Filter featured products |
| `hasPromotion` | boolean | Filter products on promotion |
| `attributes` | string | `AttributeName:value1,value2\|AttributeName2:value3` format |

**Response 200:**
```json
{
  "success": true,
  "data": [{ "id": "...", "name": "...", "slug": "...", "price": 100, "priceRange": {"min": 90, "max": 150}, "variants": [...], "categories": [...] }],
  "pagination": { "page": 1, "limit": 20, "total": 500, "totalPages": 25 }
}
```

### `GET /api/products/slugs`
**Auth:** None | **Purpose:** Get all product slugs (for ISR/SSG)

### `GET /api/products/check-slug`
**Auth:** None | **Purpose:** Check if slug is available across all entities

**Query:** `?slug=my-product&excludeId=product_id`

### `GET /api/products/:slug`
**Auth:** None | **Purpose:** Get single product with variants, reviews, related, upsells, downsells

### `POST /api/products`
**Auth:** ADMIN+ | **Purpose:** Create product

**Body:**
```json
{
  "name": "Product Name",
  "price": 100,
  "stock": 50,
  "image": "url",
  "images": ["url1", "url2"],
  "unit": "piece",
  "categoryIds": ["cat_id"],
  "brandId": "brand_id",
  "tags": ["tag_id"],
  "featured": false,
  "productType": "SIMPLE",
  "variants": [],
  "specifications": [],
  "faqs": [],
  "seoData": {},
  "slug": "optional-custom-slug"
}
```

### `PUT /api/products/:id`
**Auth:** ADMIN+ | **Purpose:** Update product

### `DELETE /api/products/:id`
**Auth:** ADMIN+ | **Purpose:** Delete product

### `POST /api/products/bulk-promotion`
**Auth:** ADMIN+ | **Purpose:** Apply/remove promotion to multiple products

**Body:**
```json
{
  "productIds": ["id1", "id2"],
  "type": "PERCENT",
  "value": 10,
  "startDate": "2026-06-01",
  "endDate": "2026-06-30",
  "remove": false
}
```

---

## 5. Categories

### `GET /api/categories`
**Auth:** None | **Purpose:** List all categories (with children)

### `GET /api/categories/:slug`
**Auth:** None | **Purpose:** Get category by slug with products

### `POST /api/categories`
**Auth:** ADMIN+ | **Purpose:** Create category

**Body:** `{ "name": "...", "slug": "...", "image": "...", "parentId": "...", "seoData": {} }`

### `PUT /api/categories/:id`
**Auth:** ADMIN+ | **Purpose:** Update category

### `DELETE /api/categories/:id`
**Auth:** ADMIN+ | **Purpose:** Delete category

---

## 6. Brands

### `GET /api/brands` � List all brands
### `GET /api/brands/:slug` � Get brand by slug
### `POST /api/brands` � Create (ADMIN+)
### `PUT /api/brands/:id` � Update (ADMIN+)
### `DELETE /api/brands/:id` � Delete (ADMIN+)

---

## 7. Tags

### `GET /api/tags` � List all tags
### `POST /api/tags` � Create (ADMIN+)
### `PUT /api/tags/:id` � Update (ADMIN+)
### `DELETE /api/tags/:id` � Delete (ADMIN+)

---

## 8. Cart

### `GET /api/cart`
**Auth:** Bearer | **Purpose:** Get current user's cart

### `POST /api/cart`
**Auth:** Bearer | **Purpose:** Add item to cart

**Body:** `{ "productId": "...", "variantId": "...", "quantity": 2 }`

### `PUT /api/cart/:itemId`
**Auth:** Bearer | **Purpose:** Update cart item quantity

**Body:** `{ "quantity": 3 }`

### `DELETE /api/cart/:itemId`
**Auth:** Bearer | **Purpose:** Remove item from cart

### `DELETE /api/cart`
**Auth:** Bearer | **Purpose:** Clear entire cart

---

## 9. Orders

### `POST /api/orders/calculate`
**Auth:** Optional | **Purpose:** Preview order totals before placing

**Body:**
```json
{
  "items": [{ "productId": "...", "quantity": 2 }],
  "couponCode": "SAVE10",
  "deliveryAreaId": "...",
  "deliveryCityId": "..."
}
```

**Response:**
```json
{ "success": true, "data": { "subtotal": 200, "deliveryFee": 50, "discount": 20, "total": 230 } }
```

### `POST /api/orders`
**Auth:** Optional | **Purpose:** Place order (guest or authenticated)

**Body:**
```json
{
  "deliveryAddress": "123 Main St",
  "deliveryCity": "Dhaka",
  "deliveryArea": "Mirpur",
  "deliveryCityId": "...",
  "deliveryAreaId": "...",
  "deliveryStateId": "...",
  "deliverySlot": "Morning",
  "paymentMethod": "COD",
  "couponCode": "SAVE10",
  "notes": "Please call before delivery",
  "items": [{ "productId": "...", "quantity": 2 }],
  "customerName": "John Doe",
  "customerPhone": "01XXXXXXXXX"
}
```

### `GET /api/orders/my-orders`
**Auth:** Bearer (USER+) | **Purpose:** List own orders with pagination

### `GET /api/orders/:id`
**Auth:** Bearer | **Purpose:** Get order by ID (own orders only for USER)

### `GET /api/orders` (admin)
**Auth:** ADMIN+ | **Purpose:** List all orders with filters

**Query:** `?status=PENDING&search=john&userId=...&couponCode=...&page=1&limit=20`

### `PUT /api/orders/:id/status`
**Auth:** ADMIN+ | **Purpose:** Update order status

**Body:** `{ "status": "SHIPPED" }`

### `POST /api/orders/:id/pay`
**Auth:** Bearer | **Purpose:** Mark order as paid (simulated)

### `POST /api/orders/:id/returns`
**Auth:** ADMIN+ | **Purpose:** Process return/damage for order items

**Body:**
```json
{
  "items": [
    { "orderItemId": "...", "quantity": 1, "isDamaged": false, "reason": "Wrong item sent" }
  ]
}
```

### `POST /api/orders/:id/notes`
**Auth:** ADMIN+ | **Purpose:** Add manual note to order

**Body:** `{ "content": "Customer called to confirm delivery." }`

---

## 10. Payments

### `POST /api/payments/initiate`
**Auth:** Bearer | **Purpose:** Initiate SSLCommerz payment

**Body:** `{ "orderId": "..." }`

---

## 11. Wishlist

### `GET /api/wishlist`
**Auth:** Bearer | **Purpose:** Get wishlist items

### `POST /api/wishlist`
**Auth:** Bearer | **Purpose:** Add product to wishlist

**Body:** `{ "productId": "..." }`

### `DELETE /api/wishlist/:productId`
**Auth:** Bearer | **Purpose:** Remove from wishlist

---

## 12. Coupons

### `GET /api/coupons`
**Auth:** ADMIN+ | **Purpose:** List all coupons

### `GET /api/coupons/validate/:code`
**Auth:** None | **Purpose:** Validate coupon code and calculate discount

### `POST /api/coupons`
**Auth:** ADMIN+ | **Purpose:** Create coupon

**Body:**
```json
{
  "code": "SAVE10",
  "discount": 10,
  "type": "PERCENT",
  "minOrder": 100,
  "maxUses": 500,
  "active": true,
  "expiresAt": "2026-12-31"
}
```

### `PUT /api/coupons/:id`
**Auth:** ADMIN+ | **Purpose:** Update coupon

### `DELETE /api/coupons/:id`
**Auth:** ADMIN+ | **Purpose:** Delete coupon

---

## 13. Media

### `GET /api/media`
**Auth:** ADMIN+ | **Purpose:** List media files

### `POST /api/media/upload`
**Auth:** ADMIN+ | **Purpose:** Upload image(s)

**Content-Type:** `multipart/form-data` | Field: `images` (up to multiple files)

Automatically processes images to 3 sizes: thumbnail, medium, full � stored to S3 or local.

### `PUT /api/media/:id`
**Auth:** ADMIN+ | **Purpose:** Update media metadata (altText, title, caption, description)

### `DELETE /api/media/:id`
**Auth:** ADMIN+ | **Purpose:** Delete media file

---

## 14. Builder

See [BUILDER_SYSTEM.md](./BUILDER_SYSTEM.md) for full documentation.

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/builder/public/:key` | None |
| GET | `/api/builder/components` | None |
| GET | `/api/builder/templates` | None |
| GET | `/api/builder/templates/:id` | None |
| GET | `/api/builder/packs` | Bearer |
| POST | `/api/builder/templates` | ADMIN |
| DELETE | `/api/builder/templates/:id` | ADMIN |
| GET | `/api/builder/pages/:key` | ADMIN |
| PUT | `/api/builder/pages/:key/draft` | ADMIN |
| POST | `/api/builder/pages/:key/publish` | ADMIN |
| GET | `/api/builder/pages/:key/versions` | ADMIN |
| POST | `/api/builder/pages/:key/apply-template` | ADMIN |

---

## 15. Navigation

### `GET /api/navigation/navbar`
**Auth:** None | **Purpose:** Get full navbar tree

### `POST /api/navigation/navbar`
**Auth:** ADMIN+ | **Purpose:** Create navbar item

### `PUT /api/navigation/navbar/:id`
**Auth:** ADMIN+ | **Purpose:** Update navbar item

### `DELETE /api/navigation/navbar/:id`
**Auth:** ADMIN+ | **Purpose:** Delete navbar item

### `GET /api/navigation/footer`
**Auth:** None | **Purpose:** Get full footer (sections + links)

### `POST /api/navigation/footer/sections`
**Auth:** ADMIN+ | **Purpose:** Create footer section

### `PUT /api/navigation/footer/sections/:id`
**Auth:** ADMIN+ | **Purpose:** Update footer section

### `DELETE /api/navigation/footer/sections/:id`
**Auth:** ADMIN+ | **Purpose:** Delete footer section

### `POST /api/navigation/footer/sections/:sectionId/links`
**Auth:** ADMIN+ | **Purpose:** Add link to footer section

### `PUT /api/navigation/footer/links/:id`
**Auth:** ADMIN+ | **Purpose:** Update footer link

### `DELETE /api/navigation/footer/links/:id`
**Auth:** ADMIN+ | **Purpose:** Delete footer link

---

## 16. Locations

### `GET /api/locations/states`
**Auth:** None | **Purpose:** List all states

### `POST /api/locations/states`
**Auth:** ADMIN+ | **Purpose:** Create state

### `PUT /api/locations/states/:id`
**Auth:** ADMIN+ | **Purpose:** Update state

### `DELETE /api/locations/states/:id`
**Auth:** ADMIN+ | **Purpose:** Delete state

### `GET /api/locations/cities`
**Auth:** None | **Purpose:** List cities (filter by `?stateId=`)

### `POST /api/locations/cities`
**Auth:** ADMIN+ | **Purpose:** Create city

### `PUT /api/locations/cities/:id`
**Auth:** ADMIN+ | **Purpose:** Update city (including delivery charge)

### `DELETE /api/locations/cities/:id`
**Auth:** ADMIN+

### `GET /api/locations/areas`
**Auth:** None | **Purpose:** List areas (filter by `?cityId=`)

### `POST /api/locations/areas`
**Auth:** ADMIN+

### `PUT /api/locations/areas/:id`
**Auth:** ADMIN+

### `DELETE /api/locations/areas/:id`
**Auth:** ADMIN+

---

## 17. Wallet

### `GET /api/wallet/balance`
**Auth:** ADMIN+ | **Purpose:** Get global wallet balance

### `GET /api/wallet/transactions`
**Auth:** ADMIN+ | **Purpose:** List wallet transactions

### `POST /api/wallet/topup`
**Auth:** ADMIN+ | **Purpose:** Add funds to global wallet

**Body:** `{ "amount": 100, "note": "Manual top-up" }`

### `GET /api/wallet/user/:userId/balance`
**Auth:** ADMIN+ | **Purpose:** Get user's reward point balance

---

## 18. Settings

### `GET /api/global-settings`
**Auth:** None | **Purpose:** Get all public settings

### `PUT /api/global-settings`
**Auth:** ADMIN+ | **Purpose:** Bulk upsert settings

**Body:** `{ "settings": [{ "key": "abandoned_cart_expiry_hours", "value": "48" }] }`

---

## 19. Pages (CMS)

### `GET /api/pages`
**Auth:** None | **Purpose:** List all CMS pages

### `GET /api/pages/:slug`
**Auth:** None | **Purpose:** Get page by slug

### `POST /api/pages`
**Auth:** ADMIN+ | **Purpose:** Create CMS page

**Body:** `{ "title": "About", "slug": "about", "content": "<p>...</p>", "css": "...", "status": "published", "seoData": {} }`

### `PUT /api/pages/:id`
**Auth:** ADMIN+

### `DELETE /api/pages/:id`
**Auth:** ADMIN+

---

## 20. WordPress / Import

### `GET /api/wordpress/settings`
**Auth:** ADMIN+ | **Purpose:** Get WooCommerce connection settings

### `POST /api/wordpress/settings`
**Auth:** ADMIN+ | **Purpose:** Save WooCommerce connection

**Body:** `{ "siteUrl": "https://mystore.com", "consumerKey": "ck_...", "consumerSecret": "cs_...", "apiVersion": "wc/v3" }`

### `POST /api/wordpress/import/start`
**Auth:** ADMIN+ | **Purpose:** Start new import (creates tasks for each page batch)

### `GET /api/wordpress/import/status`
**Auth:** ADMIN+ | **Purpose:** Get current import status

### `GET /api/wordpress/import/tasks`
**Auth:** ADMIN+ | **Purpose:** List all import tasks

### `POST /api/wordpress/import/tasks/:id/start`
**Auth:** ADMIN+ | **Purpose:** Start/resume a specific task

### `POST /api/wordpress/import/tasks/:id/cancel`
**Auth:** ADMIN+ | **Purpose:** Cancel/pause a running task

### `DELETE /api/wordpress/import/tasks`
**Auth:** ADMIN+ | **Purpose:** Clear all completed tasks

---

## 21. Admin Users

### `GET /api/admin-users`
**Auth:** SUPER_ADMIN | **Purpose:** List all admin/super-admin users

### `POST /api/admin-users`
**Auth:** SUPER_ADMIN | **Purpose:** Create admin user

### `PUT /api/admin-users/:id`
**Auth:** SUPER_ADMIN | **Purpose:** Update admin user

### `DELETE /api/admin-users/:id`
**Auth:** SUPER_ADMIN | **Purpose:** Delete admin user

---

## 22. Admin Roles

### `GET /api/admin-roles`
**Auth:** ADMIN+ | **Purpose:** List all admin roles

### `POST /api/admin-roles`
**Auth:** SUPER_ADMIN | **Purpose:** Create admin role with permissions

### `PUT /api/admin-roles/:id`
**Auth:** SUPER_ADMIN | **Purpose:** Update admin role

### `DELETE /api/admin-roles/:id`
**Auth:** SUPER_ADMIN | **Purpose:** Delete non-system admin role

---

## 23. Specifications (Attributes)

### `GET /api/specifications`
**Auth:** None | **Purpose:** List attributes with values

### `POST /api/specifications`
**Auth:** ADMIN+ | **Purpose:** Create attribute

### `POST /api/specifications/:id/values`
**Auth:** ADMIN+ | **Purpose:** Add value to attribute

### `DELETE /api/specifications/:id`
**Auth:** ADMIN+

---

## 24. Variations

### `GET /api/variations`
**Auth:** None | **Purpose:** List variations with values

### `POST /api/variations`
**Auth:** ADMIN+ | **Purpose:** Create variation

### `POST /api/variations/:id/values`
**Auth:** ADMIN+ | **Purpose:** Add value to variation

### `DELETE /api/variations/:id`
**Auth:** ADMIN+

---

## 25. Testimonials

### `GET /api/testimonials`
**Auth:** None | **Purpose:** List active testimonials

### `POST /api/testimonials`
**Auth:** ADMIN+

### `PUT /api/testimonials/:id`
**Auth:** ADMIN+

### `DELETE /api/testimonials/:id`
**Auth:** ADMIN+

---

## 26. Reviews

### `GET /api/reviews`
**Auth:** None | **Purpose:** List reviews (filter by `?productId=`)

### `POST /api/reviews`
**Auth:** ADMIN+ | **Purpose:** Add review manually

### `DELETE /api/reviews/:id`
**Auth:** ADMIN+

---

## 27. Tracking

### `GET /api/tracking/:orderId`
**Auth:** None | **Purpose:** Public order status tracking by order ID

---

## 28. Facebook Ads

### `GET /api/facebook-ads/settings`
**Auth:** ADMIN+ | **Purpose:** Get Facebook Pixel and CAPI settings

### `PUT /api/facebook-ads/settings`
**Auth:** ADMIN+ | **Purpose:** Update Facebook settings

---

## 29. Contact

### `POST /api/contact`
**Auth:** None | **Purpose:** Submit contact form

**Body:** `{ "name": "...", "email": "...", "subject": "...", "message": "..." }`

### `GET /api/contact`
**Auth:** ADMIN+ | **Purpose:** List contact messages

### `PUT /api/contact/:id/read`
**Auth:** ADMIN+ | **Purpose:** Mark message as read

---

## 30. SMS

### `GET /api/sms/settings`
**Auth:** ADMIN+ | **Purpose:** Get SMS gateway settings

### `PUT /api/sms/settings`
**Auth:** ADMIN+ | **Purpose:** Update SMS gateway settings

---

## Standard Response Formats

### Success
```json
{ "success": true, "data": { ... } }
```
```json
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
```

### Error
```json
{ "success": false, "message": "Human-readable error message" }
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Missing or invalid token |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate email) |
| 429 | Too many requests |
| 500 | Internal server error |
