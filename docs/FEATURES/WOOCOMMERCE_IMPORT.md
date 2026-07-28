# Feature: WooCommerce Import

> **Source files:** `src/services/importService.ts`, `src/services/importQueue.ts`, `src/services/wordpressService.ts`, `src/controllers/WordpressController.ts`

---

## Purpose

Allows admins to migrate an entire WooCommerce product catalog into Femcart. Products are fetched via the WooCommerce REST API and mapped to Femcart's data model.

---

## How It Works

### 1. Configure WooCommerce Connection

Admin saves WooCommerce settings:
- Site URL (e.g., `https://myoldstore.com`)
- Consumer Key + Consumer Secret (from WooCommerce ? Settings ? Advanced ? REST API)
- API Version (default: `wc/v3`)

Stored in `WordPressSetting` table.

### 2. Start Import

`POST /api/wordpress/import/start`
- Fetches total product count from WooCommerce
- Creates `ImportLog` (session record)
- Creates one `ImportTask` per page batch (e.g., 20 products/page)
- Queues all tasks

### 3. Task Execution

`importQueue.ts` manages an **in-process task queue** with `MAX_CONCURRENT_TASKS = 1`.

For each task:
1. Fetch WooCommerce categories ? build `catMap` (WC category ID ? Femcart category ID)
2. Fetch product page from WooCommerce
3. For each product: call `importProduct()`
4. Log progress to `ImportTask.details` (JSON array of timestamped messages, max 500 lines)
5. Update `imported` / `failed` counters

### 4. Product Import Mapping

`importService.importProduct()` maps WooCommerce fields:

| WooCommerce | Femcart |
|-------------|-----------|
| `id` | `externalId` (for deduplication) |
| `name` | `name` |
| `slug` | `slug` |
| `description` | `description` |
| `short_description` | `shortDescription` |
| `regular_price` | `price` |
| `sale_price` | `specialPrice` |
| `images[0].src` | `image` |
| `images[]` | `images` (array) |
| `categories[]` | Create/map to `Category` records |
| `type=simple` | `productType: SIMPLE` |
| `type=variable` | `productType: VARIABLE` + create `ProductVariant` records |
| `attributes` | `VariantAttribute` records |
| `reviews` | `Review` records |

### 5. Deduplication

Products are upserted by `externalId` (WooCommerce product ID). Re-running the import updates existing products.

### 6. Task Controls

- **Start:** `POST /api/wordpress/import/tasks/:id/start`
- **Cancel/Pause:** `POST /api/wordpress/import/tasks/:id/cancel`
  - Sets a flag in `cancelRequests` Set � checked between each product
  - Task status set to `paused` if cancelled mid-run
- Tasks can be individually started/paused/resumed

---

## Task Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Created but not yet queued |
| `queued` | In the in-memory queue |
| `running` | Currently executing |
| `paused` | Cancelled mid-run, can be resumed |
| `done` | Completed successfully |
| `failed` | Crashed with unrecoverable error |

---

## Limitations

- Import runs **in Node.js main process** � not in a worker thread
- Only 1 task runs at a time (`MAX_CONCURRENT_TASKS = 1`)
- Large imports (10,000+ products) may impact API responsiveness
- Network timeouts: 30-second timeout per product fetch

---

## Monitoring

```
GET /api/wordpress/import/status
GET /api/wordpress/import/tasks
```

Each task includes a `details` JSON array with timestamped log entries visible in the admin panel.
