# Femcart API � Builder System

> **Last Updated:** 2026-06-11 | **Source:** `src/controllers/BuilderController.ts`, `src/validators/builder.schema.ts`, `src/routes/builderRoutes.ts` | **AI-Maintained**

---

## What Is the Builder System?

The Builder System is a **visual page composition engine** that allows administrators to construct storefront page layouts by arranging pre-defined section components (Hero Banners, Product Showcases, Testimonial Sliders, etc.) without writing code.

Previously, layouts were stored as massive JSON documents. To improve data integrity and prevent layout breaks, the architecture has been migrated to a **relational schema** (`BuilderSection` and `BuilderSectionStyle`). The API reconstructs the expected JSON document format at runtime for the frontend renderer.

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **BuilderPage** | A named page slot (e.g., `home`, `about`). Has one draft and one published version at any time. |
| **BuilderPageVersion** | A snapshot of a page's layout. Contains multiple `BuilderSection` rows. |
| **BuilderSection** | A relational row representing a single component. Contains `type`, `variant`, `props` (JSON), and `settings` (JSON). |
| **BuilderSectionStyle** | A relational row storing strict design tokens (`theme`, `alignment`, `spacing`) linked to a `BuilderSection`. |
| **BuilderDocument** | The reconstructed JSON payload sent to the frontend renderer. |
| **BuilderTemplate** | A saved layout that can be applied to a page as a starting point. |

---

## Relational Schema vs API Payload

While the database uses distinct tables (`BuilderSection`, `BuilderSectionStyle`), the API endpoint (`/api/builder/pages/:key`) reconstructs the `BuilderDocument` so the frontend doesn't need to drastically change its rendering logic:

```typescript
{
  schemaVersion: 2,       
  page: {
    key: string,          // e.g. "home"
    slug: string,         // e.g. "/"
    title: string,        // e.g. "Home"
  },
  sections: BuilderSectionAPI[],  
}
```

### BuilderSectionAPI (Sent to Frontend)

```typescript
{
  id: string,             // unique db id
  sectionId: string,      // frontend reference id
  type: string,           // component type (e.g. "HeroBanner")
  variant: string,        // variant name
  props: Record<string, unknown>,  // component-specific props
  settings: {
    hidden: boolean,
    container: "full"|"contained"
  },
  styles: {               // Mapped from BuilderSectionStyle relation
    theme: "default" | "dark" | "light" | "brand" | "festive",
    alignment: "left" | "center" | "right",
    spacing: "none" | "small" | "medium" | "large"
  }
}
```

> **Important Design Rule:** To prevent admins from breaking layouts, arbitrary styling fields (`customBgColor`, `paddingX`, `textColor`, etc.) have been fully removed. Components must derive their styling from the strict `theme`, `alignment`, and `spacing` tokens.

---

## Supported Section Types

| Type | Category | Props |
|------|----------|-------|
| `HeroBanner` | Hero | title, subtitle, badgeText, description, ctaText, ctaHref, imageSrc, textAlign, themeVariant |
| `HeroSlider` | Hero | slides[] (title, subtitle, description, cta, href, image, gradient) |
| `SpecialOffersBanner` | Offers | title, subtitle, ctaText, ctaHref, bgColor, leftImageSrc, rightImageSrc, textAlign |
| `ProductShowcase` | Products | title, subtitle, showcaseCategoryId, showCategoryFilter, textAlign |
| `PromoBadgeGrid` | Promo | badges[] (title, subtitle, iconName, bgColor, href) |
| `TestimonialSection` | Social | title, subtitle, textAlign, testimonials[] |
| `HotDealsSection` | Promotions | title, subtitle, deals[] |
| `ConsultationBanner` | CTA | title, subtitle, badgeText, features[], ctaText, ctaHref, imageSrc, imageAlign |
| `RoutineBanner` | CTA | extends ConsultationBanner + description |
| `NewArrivalsSection` | Products | title, subtitle, ctaHref |
| `EidSpecialBanner` | Festival | title, subtitle, ctaText, ctaHref |
| `PujaSpecialBanner` | Festival | Same as Eid |
| `RamadanSpecialBanner` | Festival | Same as Eid |
| `BoishakhSpecialBanner` | Festival | Same as Eid |
| `BlackFridaySpecialBanner` | Festival | Same as Eid |
| `ChristmasSpecialBanner` | Festival | Same as Eid |
| `ProductOverviewSection` | PDP | showFlashSale, showTrustBadges, showSku |
| `ProductReviewsSection` | PDP | (any key-value) |
| `ProductTabsSection` | PDP | (any key-value) |
| `ProductUpsellSection` | PDP | (any key-value) |
| `ProductDownsellSection` | PDP | (any key-value) |
| `CustomCodeSection` | Custom | (any key-value � unrestricted) |

---

## Security: XSS Prevention

The validator runs `assertNoUnsafeStrings()` on the entire document tree before accepting it. Blocked patterns:
- `<script` tags
- `javascript:` URLs
- Inline event handlers (`onclick=`, `onload=`, etc.)

Any violation throws a 400 Bad Request.

---

## Builder Workflow

```
+-------------------------------------------------------------+
�                    Admin Panel                               �
+-------------------------------------------------------------+
                           �
         +-----------------+--------------------+
         ?                 ?                    ?
   Apply Template      Edit Draft           Get Published
   POST /pages/:key/   PUT /pages/:key/     GET /public/:key
   apply-template      draft               (frontend render)
         �                 �
         ?                 ?
   Clone template      Validate document
   doc, update         (Zod + XSS check)
   page.key metadata        �
         �                  ?
         +------? Create new BuilderPageVersion (status: draft)
                  Increment version number
                  Update page.draftVersionId
                           �
                           ?
              POST /pages/:key/publish
                           �
                           ?
              Archive old published version
              Promote draft ? status: published
              Update page.publishedVersionId
              Update page.draftVersionId = published.id
                           �
                           ?
              GET /public/:key
              (frontend fetches published version)
```

---

## Campaign Scheduling

Published versions can have `activeFrom` and `activeTo` timestamps. When `getPublicPage` is called:

1. **First:** Look for a version with `status=published`, `activeFrom <= now`, `activeTo >= now`
2. **Fallback:** Use `page.publishedVersionId` (the default published version)

This enables time-boxed festival campaigns without modifying the permanent layout.

---

## System Auto-Seeding

When certain core pages are first requested (e.g., `GET /api/builder/pages/:key`), the system automatically ensures they exist:

### Home Page (`home`)
1. Checks if a `home` BuilderPage with any versions exists
2. If not, looks for a `default-home` template in `BuilderTemplate`
3. Falls back to `createDefaultHomeDocument()` which creates a 3-section default layout
4. Creates the page + version inside a transaction, marks it as published

### Product Template (`product_template`)
1. Checks if a `product_template` BuilderPage with any versions exists
2. If not, automatically creates a default product page layout consisting of:
   - `ProductOverviewSection`
   - `ProductTabsSection`
   - `ProductUpsellSection`
   - `ProductDownsellSection`
   - `ProductReviewsSection`
3. Marks the page as published with route `/products/:slug`
---

## Template Packs

Template packs group related templates for seasonal/festival themes.

**Access rules:**
- `SUPER_ADMIN`: can see all packs (locked and unlocked)
- `ADMIN` / authenticated: can see only `unlocked` packs

**Apply template flow:**
```
POST /api/builder/pages/:key/apply-template
  { "templateId": "template_id" }

1. Load template document
2. Clone it (deep copy)
3. Overwrite clonedDoc.page.{key, slug, title, theme} with target page values
4. Create new draft version from cloned document
5. Update page.draftVersionId
```

---

## API Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/builder/public/:key` | None | Get published page for frontend rendering |
| GET | `/api/builder/components` | None | List registered components with default props |
| POST | `/api/builder/components` | ADMIN | Register a new builder component and defaults |
| GET | `/api/builder/templates` | None | List templates (filter by scope/themeKey/pageType) |
| GET | `/api/builder/templates/:id` | None | Get single template |
| GET | `/api/builder/packs` | Bearer | List template packs |
| POST | `/api/builder/templates` | ADMIN | Create custom template |
| DELETE | `/api/builder/templates/:id` | ADMIN | Delete custom template (not system) |
| GET | `/api/builder/pages/:key` | ADMIN | Get page with draft + published version |
| PUT | `/api/builder/pages/:key/draft` | ADMIN | Save draft document |
| POST | `/api/builder/pages/:key/publish` | ADMIN | Publish current draft |
| GET | `/api/builder/pages/:key/versions` | ADMIN | List version history (last 50) |
| POST | `/api/builder/pages/:key/apply-template` | ADMIN | Apply template as new draft |

---

## Data Flow Diagram

```
Admin saves draft:
  POST body { document: BuilderDocument }
       �
       +-- validateBuilderDocument(document)   ? Zod + XSS check
       +-- prisma.builderPage.upsert(key)       ? ensure page exists
       +-- prisma.builderPageVersion.findFirst  ? get latest version #
       +-- prisma.builderPageVersion.create     ? new version (status: draft)
       +-- prisma.builderPage.update            ? update draftVersionId
       
Frontend reads page:
  GET /api/builder/public/home
       �
       +-- prisma.builderPage.findUnique(key)
       +-- Try: findFirst version with activeFrom/activeTo (campaign)
       +-- Fallback: findUnique(publishedVersionId)
       +-- Return { page, version: { document } }
```
