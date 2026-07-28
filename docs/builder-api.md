# Builder Template API Documentation

This document describes the REST endpoints available for managing templates and applying them to builder pages.

## Authentication
- Routes marked with **[Admin Auth Required]** require a valid JWT token in the `Authorization` header (`Bearer <token>`) and the authenticated user must have the role `ADMIN` or `SUPER_ADMIN`.
- Unprotected routes are accessible publicly.

---

## 1. List Templates
Retrieves a list of templates filtered by query parameters.

- **URL:** `/api/builder/templates`
- **Method:** `GET`
- **Query Parameters:**
  - `scope` (optional): Filter by scope (`page` or `theme`).
  - `themeKey` (optional): Filter by theme key (e.g., `eid`, `ramadan`, or `null` for none).
  - `pageType` (optional): Filter by page type (e.g., `home`).
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clm12345...",
        "key": "default-home",
        "name": "Default Home Layout",
        "scope": "page",
        "pageType": "home",
        "themeKey": null,
        "thumbnail": null,
        "isSystem": true,
        "document": { ... },
        "createdAt": "2026-05-20T04:54:21.000Z",
        "updatedAt": "2026-05-20T04:54:21.000Z"
      }
    ]
  }
  ```

---

## 2. Get Template by ID
Retrieves details of a specific template.

- **URL:** `/api/builder/templates/:id`
- **Method:** `GET`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "clm12345...",
      "key": "default-home",
      "name": "Default Home Layout",
      "scope": "page",
      "document": { ... }
    }
  }
  ```
- **Response (Not Found - 404):**
  ```json
  {
    "success": false,
    "message": "Builder template not found"
  }
  ```

---

## 3. Create Custom Template [Admin Auth Required]
Creates a user-defined template (can be a full page layout or block layout).

- **URL:** `/api/builder/templates`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "key": "my-custom-layout",
    "name": "My Custom Layout",
    "scope": "page",
    "pageType": "home",
    "themeKey": null,
    "document": {
      "schemaVersion": 1,
      "page": {
        "key": "home",
        "slug": "/",
        "title": "Custom Title"
      },
      "sections": []
    }
  }
  ```
- **Response (Created - 201):**
  ```json
  {
    "success": true,
    "data": {
      "id": "clm98765...",
      "key": "my-custom-layout",
      "name": "My Custom Layout",
      "scope": "page",
      "isSystem": false,
      "document": { ... }
    },
    "message": "Template saved"
  }
  ```

---

## 4. Apply Template to Page [Admin Auth Required]
Clones a template's document structure into a new draft version for the target page. If the page does not exist yet, it is initialized automatically. The document's internal metadata (`key`, `slug`, `title`) is updated automatically to match the target page properties, avoiding conflicts.

- **URL:** `/api/builder/pages/:key/apply-template`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "templateId": "clm12345..."
  }
  ```
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "page": {
        "id": "page_id_here",
        "key": "home",
        "slug": "/",
        "status": "published",
        "draftVersionId": "new_draft_version_id"
      },
      "draft": {
        "id": "new_draft_version_id",
        "version": 2,
        "status": "draft",
        "document": { ... }
      }
    },
    "message": "Template applied as draft"
  }
  ```

---

## 5. Delete Custom Template [Admin Auth Required]
Deletes a user-created template. System-seeded templates (e.g. `default-home` or festival layout baselines) are protected and cannot be deleted.

- **URL:** `/api/builder/templates/:id`
- **Method:** `DELETE`
- **Headers:** `Authorization: Bearer <token>`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "message": "Template deleted successfully"
  }
  ```
- **Response (Forbidden - 400):**
  ```json
  {
    "success": false,
    "message": "System templates cannot be deleted"
  }
  ```

---

## 6. Get Admin Page Details [Admin Auth Required]
Retrieves the target page config, including the current active draft version and published version documents.

- **URL:** `/api/builder/pages/:key`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "page": {
        "id": "page_id_here",
        "key": "home",
        "slug": "/",
        "title": "Home",
        "status": "published",
        "draftVersionId": "draft_id",
        "publishedVersionId": "published_id"
      },
      "draft": {
        "id": "draft_id",
        "version": 3,
        "status": "draft",
        "document": { ... }
      },
      "published": {
        "id": "published_id",
        "version": 2,
        "status": "published",
        "document": { ... }
      },
      "dirty": true
    }
  }
  ```

---

## 7. Save Page Draft [Admin Auth Required]
Saves/replaces the draft document, creating a new version with status `draft`.

- **URL:** `/api/builder/pages/:key/draft`
- **Method:** `PUT`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "document": {
      "schemaVersion": 1,
      "page": { "key": "home", "slug": "/", "title": "Home" },
      "sections": [ ... ]
    }
  }
  ```
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "page": { ... },
      "draft": {
        "id": "new_draft_id",
        "version": 4,
        "status": "draft",
        "document": { ... }
      }
    },
    "message": "Draft saved"
  }
  ```

---

## 8. Publish Draft [Admin Auth Required]
Promotes the specified draft version (or the page's current draft) to status `published` so it renders publicly.

- **URL:** `/api/builder/pages/:key/publish`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "draftVersionId": "optional_draft_version_id"
  }
  ```
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "page": { ... },
      "published": {
        "id": "published_version_id",
        "status": "published"
      }
    },
    "message": "Page published"
  }
  ```

---

## 9. List Page Version History [Admin Auth Required]
Retrieves the 50 most recent revision history entries for a specific builder page.

- **URL:** `/api/builder/pages/:key/versions`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "ver_id_1",
        "pageId": "page_id",
        "version": 4,
        "status": "draft",
        "document": { ... },
        "createdAt": "2026-05-20T06:00:00.000Z",
        "createdById": "admin_user_id"
      },
      {
        "id": "ver_id_2",
        "pageId": "page_id",
        "version": 3,
        "status": "published",
        "document": { ... },
        "createdAt": "2026-05-20T05:30:00.000Z",
        "createdById": "admin_user_id"
      }
    ]
  }
  ```

---

## 10. Get Public Page Config
Returns the current active layout document to render the storefront page. Automatically resolves campaigns or falls back to standard published layouts.

- **URL:** `/api/builder/public/:key`
- **Method:** `GET`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "page_id",
      "slug": "/",
      "title": "Home",
      "version": {
        "version": 3,
        "document": { ... }
      }
    }
  }
  ```

---

## 11. List Component Schema Specifications
Retrieves registered metadata and schemas for the builder sections.

- **URL:** `/api/builder/components`
- **Method:** `GET`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "name": "HeroBanner",
        "label": "Hero Banner",
        "category": "Hero",
        "schema": { ... }
      }
    ]
  }
  ```

---

## 12. List Template Packs [Auth Required]
Retrieves available preset template packs (e.g., unlocked themes/bundles).

- **URL:** `/api/builder/packs`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (Success - 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "pack_1",
        "name": "Ramadan Mubarak Pack",
        "status": "unlocked",
        "templates": [ ... ]
      }
    ]
  }
  ```

