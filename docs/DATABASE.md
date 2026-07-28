# Femcart API � Database Architecture

> **Last Updated:** 2026-06-11 | **Source:** `prisma/schema.prisma` | **AI-Maintained**

---

## Database Engine

- **Provider:** MySQL
- **ORM:** Prisma v6 (`@prisma/client`)
- **Connection:** `DATABASE_URL` environment variable

---

## Entity Relationship Overview

```
User ------------------+
 +-- Cart --- CartItem -+--- Product --- ProductVariant --- VariantAttribute
 +-- Order -- OrderItem-+    �               �
 �   +-- OrderNote           �               +-- CartItem / OrderItem
 +-- Wishlist --- Product     �
 +-- UserAddress               +-- Category (self-referential tree)
 +-- WalletTransaction         +-- Brand
 +-- AdminRole                 +-- Tag
                               +-- Review

BuilderPage --- BuilderPageVersion (document: JSON)
BuilderTemplate
BuilderTemplatePack --- BuilderTemplate
BuilderComponent --- BuilderComponentContent

State --- City --- Area
  �          �        +-- UserAddress / Order
  +-- Order

Setting (key-value store)
Media
OTPVerification
Coupon
Page (CMS)
NavbarItem (self-referential)
FooterSection --- FooterLink
Testimonial
ContactMessage
AdminRole --- User
WordPressSetting
ImportLog
ImportTask
WalletTransaction
Attribute --- AttributeValue
Variation --- VariationValue
```

---

## Model Reference

### `User`
| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | PK |
| email | String? | Unique, indexed |
| password | String? | bcrypt hashed |
| name | String | Required |
| phone | String? | Unique, indexed |
| isGuest | Boolean | Default false � guest accounts created during OTP checkout |
| role | Enum (Role) | USER / ADMIN / SUPER_ADMIN |
| permissions | String? (Text) | JSON-encoded array of permission strings |
| rewardPoints | Int | Running total |
| refreshToken | String? (Text) | Current valid refresh token |
| adminRoleId | String? | FK to AdminRole |
| address, city, area, gender, dateOfBirth | | Profile fields |

**Relations:** cart, orders, wishlist, addresses, walletTransactions, adminRole

---

### `UserAddress`
Saved delivery addresses per user. Linked to the location hierarchy (State/City/Area) via optional FKs.

---

### `OTPVerification`
| Field | Notes |
|-------|-------|
| phone | Unique � one OTP record per phone |
| code | 6-digit numeric code |
| verified | Becomes true after successful verification |
| attempts | Incremented on each send/verify attempt |
| blockedUntil | Set when max attempts exceeded |
| expiresAt | 5 minutes from generation |

---

### `Product`
| Field | Notes |
|-------|-------|
| slug | Unique, auto-generated or custom |
| productType | SIMPLE or VARIABLE |
| price | Base price |
| specialPrice | Promotional price (active between specialPriceStart/End) |
| comparePrice | "Was" price shown on frontend |
| images | JSON array of image URLs (LongText) |
| specifications | JSON array (LongText) |
| faqs | JSON array (LongText) |
| upsellProducts | JSON array of product IDs (LongText) |
| downsellProducts | JSON array of product IDs (LongText) |
| seoData | JSON object (LongText) |
| externalId | WooCommerce product ID (for import deduplication) |
| averageRating, ratingCount | Computed fields |

**Relations:** brand, categories (many-to-many), tags (many-to-many), variants, cartItems, orderItems, reviews, wishlist

---

### `ProductVariant`
Represents a single variation (e.g., "Size: XL, Color: Red") of a VARIABLE product.
- Each variant has its own `price`, `stock`, `specialPrice`, `sku`, `image`
- `isDefault` � the variant pre-selected on the product page
- `enabled` � soft-disabled variants not shown to customers
- Has many `VariantAttribute` records (name/value pairs)

---

### `Cart` & `CartItem`
- One cart per user (1:1 with User)
- `CartItem` links to a `Product` and optionally a `ProductVariant`
- Unique constraint: `[cartId, variantId]` prevents duplicate variant entries

---

### `Order`
| Field | Notes |
|-------|-------|
| status | PENDING ? CONFIRMED ? PROCESSING ? SHIPPED ? DELIVERED ? COMPLETED ? RETURNED / PARTIALLY_RETURNED / CANCELLED |
| paymentMethod | COD / CARD / BKASH / NAGAD |
| paymentStatus | UNPAID / PAID |
| deliveryFee | Calculated from City/Area delivery charges |
| discount | Applied coupon discount |
| rewardPoints | Points to credit on COMPLETED |
| refundAmount | Accumulated refund for returns |
| customerName/Phone | Snapshot at order time (not denormalized from user) |

**Relations:** user, items (OrderItem), orderNotes, state/city/area

---

### `OrderItem`
| Field | Notes |
|-------|-------|
| price | Snapshot price at order time |
| returnedQuantity | Quantity successfully returned |
| damagedQuantity | Quantity marked as damaged |
| returnReason | Text reason for return |

---

### `BuilderPage`
The top-level container for a builder-managed page.
| Field | Notes |
|-------|-------|
| key | Unique identifier (e.g., `home`, `about`) |
| slug | URL slug (e.g., `/`, `/about`) |
| status | `draft` or `published` |
| draftVersionId | FK to current working draft version |
| publishedVersionId | FK to currently live version |

---

### `BuilderPageVersion`
Immutable snapshot of a page's content at a point in time.
| Field | Notes |
|-------|-------|
| version | Auto-incrementing version number |
| status | `draft` / `published` / `archived` |
| document | Full JSON document (schema v1) |
| createdById | User who saved this version |
| publishedAt | Timestamp when promoted to published |
| activeFrom / activeTo | Optional scheduling window for campaign versions |

---

### `BuilderTemplate`
Pre-built page layouts that can be applied to builder pages.
| Field | Notes |
|-------|-------|
| key | Unique (e.g., `default-home`, `eid-home-v1`) |
| scope | `page` / `block` / `theme` |
| pageType | Which page type this targets (e.g., `home`) |
| themeKey | Festival theme (e.g., `eid`, `ramadan`, `puja`) |
| isSystem | System templates cannot be deleted |
| document | Full JSON document |

---

### `BuilderTemplatePack`
Groups related templates (e.g., "Eid 2026 Pack").
- `status`: `locked` or `unlocked` � SUPER_ADMIN sees all; others see only unlocked

---

### `BuilderComponent`
Registered component type with default prop values.
- `BuilderComponentContent` stores key-value pairs for each component's defaults

---

### `Setting` (Key-Value Store)
General-purpose configuration table. Known keys:

| Key | Purpose |
|-----|---------|
| `abandoned_cart_expiry_hours` | Hours before carts are cleaned up |
| `ignore_stock_limits` | `"true"` to bypass stock checks |
| `reward_points_amount` | Order value amount that earns points |
| `reward_points_earned` | Points earned per `reward_points_amount` spent |
| `facebook_capi_token` | FB Conversions API access token |
| `facebook_pixel_id` | FB Pixel ID |
| `facebook_test_event_code` | FB test event code |
| `sms_gateway_url` | SMS gateway endpoint (overrides ENV) |
| `sms_api_key` | SMS API key (overrides ENV) |
| `sms_sender_id` | SMS sender ID |

---

### `WalletTransaction`
Records all wallet movements. `userId` is nullable for global wallet transactions.

| type | Purpose |
|------|---------|
| TOPUP | Balance added |
| DEDUCTION | Balance removed (e.g., SMS cost, order fee) |
| REFUND | Balance restored after failure |

---

### `State` ? `City` ? `Area`
Three-level delivery zone hierarchy.
- Each City has a `deliveryCharge` (used if Area has none)
- Each Area has its own `deliveryCharge` (takes priority over city)
- Orders and UserAddresses link to all three levels

---

### `NavbarItem`
Self-referential tree (parentId ? children) for building navigation menus.

---

### `FooterSection` ? `FooterLink`
Footer content management with sortable sections and links.

---

### `AdminRole`
Defines a named role with a JSON-encoded permissions array. Assigned to admin users.
- `isSystem` � system roles cannot be deleted

---

### `ImportLog` & `ImportTask`
Track WooCommerce import progress.
- `ImportLog` � overall import session summary
- `ImportTask` � individual page-batch of products (status: `pending/queued/running/paused/done/failed`)

---

## Enums

| Enum | Values |
|------|--------|
| `Role` | USER, ADMIN, SUPER_ADMIN |
| `ProductType` | SIMPLE, VARIABLE |
| `OrderStatus` | PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, COMPLETED, RETURNED, PARTIALLY_RETURNED, CANCELLED |
| `PaymentMethod` | COD, CARD, BKASH, NAGAD |
| `DiscountType` | PERCENT, FIXED |
| `TransactionType` | TOPUP, DEDUCTION, REFUND |

---

## Indexes

All foreign keys and frequently-queried fields are indexed. Key indexes:
- `user.email`, `user.phone`
- `product.slug`, `product.brandId`, `product.name`
- `category.slug`, `category.parentId`
- `order.userId`, `order.status`, `order.deliveryStateId/CityId/AreaId`
- `builderPage.key`, `builderPage.slug`
- `builderpageversion.pageId + status`
- `buildertemplate.scope + pageType`, `buildertemplate.themeKey`
