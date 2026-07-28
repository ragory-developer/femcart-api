# Module: Product System

> **Source files:** `src/controllers/ProductController.ts`, `src/routes/productRoutes.ts`

---

## Purpose

The Product System manages the full product catalog including CRUD operations, rich search and filtering, variant management, pricing (simple + promotional), and bulk operations.

---

## Product Types

| Type | Description |
|------|-------------|
| `SIMPLE` | Single product with one price and stock level |
| `VARIABLE` | Product with multiple variants (e.g., Size × Color), each with their own price/stock |

---

## Key Methods

### `getAll(req, res)` — Public
Advanced product listing with these filter capabilities:
- **Text search:** searches name, description, brand, categories, tags, variant attributes
- **Category filter:** by comma-separated slugs (multi-category OR filter)
- **Brand filter:** by comma-separated slugs
- **Price range:** supports checking both `price` and `specialPrice` on products AND variants
- **Attribute filter:** `attributes=Color:Red,Blue|Size:XL` format (AND between attribute groups, OR within values)
- **Featured filter:** `featured=true`
- **Promotion filter:** `hasPromotion=true/false`

Returns `priceRange: { min, max }` computed from enabled variants for VARIABLE products.

### `getBySlug(req, res)` — Public
Returns full product detail including:
- Full category tree (up to 4 levels deep)
- All variants with attributes
- Reviews
- Related products (from same first category, up to 4)
- Resolved upsell products (from `upsellProducts` IDs or `upsellCategoryIds`)
- Resolved downsell products (from `downsellProducts` IDs or `downsellCategoryIds`)

### `checkSlug(req, res)` — Public
Checks slug availability **across all entities** (products, categories, brands, pages) simultaneously. Used by admin slug pickers.

### `create(req, res)` — Admin
Creates product with auto-slug generation (appends `-1`, `-2` etc. for duplicates). If variants array provided, creates VARIABLE product with ProductVariant + VariantAttribute records.

### `update(req, res)` — Admin
Updates product. For variants: uses `upsert` for existing variants (by ID), disables variants not in the incoming array (soft-delete via `enabled: false`).

### `applyBulkPromotion(req, res)` — Admin
Applies or removes `specialPrice` (promotional price) to multiple products at once. Supports `PERCENT` or `FIXED` discount types. Also applies to all variants of selected products.

---

## Pricing Logic

The `getActivePrice(product)` utility (in `helpers.ts`) returns the effective price:
- If `specialPrice` is set and `specialPriceStart/End` window is valid → return `specialPrice`
- Otherwise → return `price`

---

## Slug Rules

- Auto-generated from `name` using `slugify()`
- If custom slug provided: must be unique (hard error if taken)
- If auto-generated: appended with counter until unique
- Slugs are unique **globally** across products, categories, brands, and pages
