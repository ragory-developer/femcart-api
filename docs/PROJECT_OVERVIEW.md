# Femcart API � Project Overview

> **Last Updated:** 2026-06-21 | **Version:** 1.0.0 | **AI-Maintained**

---

## What Is This Project?

**Femcart** (internal project name: Femcart) is a full-featured grocery & e-commerce backend API built with **Node.js**, **TypeScript**, **Express**, and **Prisma ORM** on a **MySQL** database. It powers an online storefront where customers can browse products, manage carts, place orders, and track deliveries � and where admins can manage the entire catalog, inventory, orders, and even the visual layout of the storefront.

The project name in `package.json` is `femcart-backend`.

---

## Business Problem Solved

Femcart enables small-to-medium grocery and lifestyle e-commerce businesses in Bangladesh to:

1. **Sell online** � product catalog, categories, brands, promotions, and variant-based pricing.
2. **Accept orders** � COD, card, bKash, Nagad payment methods.
3. **Manage deliveries** � hierarchical location system (State ? City ? Area) with configurable delivery charges per zone.
4. **Retain customers** � OTP-based phone authentication, reward points, wallet credits, wishlists.
5. **Run marketing campaigns** � Facebook Conversions API integration, coupons, bulk promotions.
6. **Control storefront layout** � a builder system that lets admins visually compose page layouts by section without writing code.
7. **Import products from WooCommerce** � migrate an existing WooCommerce store's catalog into Femcart automatically.

---

## Target Users

| User Type | Description |
|-----------|-------------|
| **End Customers** | Browse products, add to cart, checkout (guest or registered), track orders |
| **Registered Users** | Full account with order history, saved addresses, reward points, wallet |
| **Guest Users** | Phone-verified or fully anonymous checkout without registration |
| **Admin** | Manage products, orders, categories, brands, coupons, media, users |
| **Super Admin** | All admin capabilities + manage other admins and their role-based permissions |

---

## Core Feature Summary

| Feature | Status |
|---------|--------|
| JWT Auth (email + phone/OTP) | ? Implemented |
| Role-Based Access Control (USER / ADMIN / SUPER_ADMIN) | ? Implemented |
| Granular Permission System (JSON-stored per user) | ? Implemented |
| Product Catalog (Simple + Variable products) | ? Implemented |
| Category Tree (multi-level nested) | ? Implemented |
| Brand Management | ? Implemented |
| Tag Management | ? Implemented |
| Attribute / Variation System | ? Implemented |
| Cart (server-side, per user) | ? Implemented |
| Order Placement (with stock deduction) | ? Implemented |
| Order Status Management | ? Implemented |
| Return & Damage Handling | ? Implemented |
| Coupon / Discount System | ? Implemented |
| Reward Points System | ? Implemented |
| Wallet System | ? Implemented |
| Media Library (S3 + Local with image processing) | ? Implemented |
| SMS Notifications (via external gateway) | ? Implemented |
| Facebook Conversions API | ? Implemented |
| SSLCommerz Payment Gateway | ? Implemented (partial) |
| WooCommerce Product Import | ? Implemented |
| Dynamic Page Builder | ? Implemented |
| Navigation Management (Navbar + Footer) | ? Implemented |
| Location Management (State/City/Area) | ? Implemented |
| Testimonials & Contact Messages | ? Implemented |
| Abandoned Cart Cleanup (Cron Job) | ? Implemented |
| Swagger API Documentation | ? Implemented |
| Rate Limiting | ? Implemented |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (TypeScript via `tsx`) |
| Framework | Express.js v4 |
| ORM | Prisma v6 |
| Database | MySQL |
| Authentication | JSON Web Tokens (JWT) + bcryptjs |
| Validation | Zod |
| File Storage | AWS S3 + Local `uploads/` fallback |
| Image Processing | Sharp |
| HTTP Logging | Morgan |
| Security | Helmet, CORS, Rate Limiting |
| API Docs | Swagger (swagger-jsdoc + swagger-ui-express) |
| Background Jobs | node-cron |
| Testing | Vitest + Supertest |
| Build | TypeScript compiler (`tsc`) |

---

## Project Entry Points

```
src/
+-- server.ts        ? Application bootstrap (DB connect + HTTP server + jobs)
+-- app.ts           ? Express app setup (middleware + routes registration)
+-- config/
�   +-- index.ts     ? Centralized environment configuration
+-- routes/
�   +-- index.ts     ? Root router aggregating all route modules
+-- ...
```

---

## Key Design Patterns

1. **Controller-Service separation** � controllers handle HTTP, services handle business logic
2. **`asyncHandler` wrapper** � all async controllers are wrapped to avoid boilerplate try/catch
3. **Custom `ApiError` hierarchy** � typed error classes propagate to a centralized `errorHandler` middleware
4. **Zod validators** � input schemas validated by middleware before controllers run
5. **Prisma transactions** � complex multi-table writes use `prisma.$transaction()` to ensure atomicity
6. **Builder versioning** � every save creates a new immutable `BuilderPageVersion`; publish promotes a draft

---

## Repository Structure

```
femcart-api/
+-- docs/                    ? All documentation (this folder)
+-- prisma/
�   +-- schema.prisma        ? Prisma data model (single source of truth for DB)
�   +-- schema_clean.prisma  ? Clean version (reference)
�   +-- seed.ts              ? Database seeder
�   +-- migrations/          ? Auto-generated SQL migrations
+-- scripts/                 ? One-off admin & seed scripts
+-- src/
�   +-- app.ts               ? Express app creation & middleware
�   +-- server.ts            ? Server startup
�   +-- config/              ? Environment config & DB client
�   +-- controllers/         ? Request handlers (29 controllers)
�   +-- routes/              ? Route definitions (30 route files)
�   +-- services/            ? Business logic services (10 files)
�   +-- middleware/          ? Auth, validation, rate limit, error handler
�   +-- jobs/                ? Background cron jobs
�   +-- utils/               ? Shared utilities (errors, SMS, FB-CAPI, etc.)
�   +-- validators/          ? Zod schema definitions
+-- .env.example             ? Required environment variable template
+-- package.json             ? npm scripts & dependencies
+-- tsconfig.json            ? TypeScript configuration
```
