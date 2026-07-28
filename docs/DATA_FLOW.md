# Femcart API � Data Flow Documentation

> **Last Updated:** 2026-06-11 | **AI-Maintained**

---

## Order Placement Flow

```
Customer POSTs to /api/orders
           �
           ?
optionalAuthenticate middleware
  +-- Authenticated: req.user = { userId, role }
  +-- Anonymous: req.user = undefined
           �
           ?
OrderController.create()
           �
           +-[No auth]-? Create/find guest user by phone
           �               +-- Auto-create with isGuest=true
           �
           +-[Auth]---? Load user from DB
           �
           ?
calculateOrderTotals()
  +-- Resolve items from payload OR user's DB cart
  +-- Check stock limits (unless ignore_stock_limits=true)
  +-- Calculate subtotal = S(price � quantity)
  +-- Resolve deliveryFee from Area ? City (cascade)
  +-- Validate coupon (check active, not expired, minOrder, maxUses)
  +-- Calculate discount + total
           �
           ?
Calculate rewardPoints (for non-guest users)
  +-- Read reward_points_amount and reward_points_earned settings
           �
           ?
prisma.$transaction()
  +-- Lock+increment coupon.usedCount
  +-- Create Order with all fields
  +-- Create OrderItems (price snapshot)
  +-- Decrement product/variant stock
  +-- Clear cart (if DB cart was used)
  +-- Deduct from global wallet (if ORDER_DEDUCTION_AMOUNT > 0)
           �
           ?
[After transaction � non-blocking, async]
  +-- sendFacebookEvent("Purchase") � FB CAPI
  +-- (SMS notification not sent on creation � only on status changes)
           �
           ?
Return 201 with order data
```

---

## Order Status Change Flow

```
Admin PUTs to /api/orders/:id/status
  { "status": "SHIPPED" }
           �
           ?
authenticate + authorize(ADMIN, SUPER_ADMIN)
           �
           ?
OrderController.updateStatus()
           �
           ?
Load current order
           �
           ?
prisma.$transaction()
  +-- Update order.status
  +-- Set paymentStatus=PAID if status=COMPLETED
  +-- Create OrderNote "Status updated to X by Admin"
  �
  +-[COMPLETED]-? Add reward points to user.rewardPoints
  +-[Was COMPLETED, now other]-? Deduct reward points
  �
  +-[? CANCELLED]-? Restock all items (increment stock)
  +-[CANCELLED ? other]-? Deduct stock again (with validation)
           �
           ?
[After transaction � non-blocking]
  +-- sendGlobalSms() for SHIPPED / DELIVERED / CANCELLED statuses
```

---

## OTP Authentication Flow

```
POST /api/auth/send-otp { phone }
           �
           ?
Check existing OTPVerification record
  +-[Blocked]-? Throw TooManyRequestsError
  +-[Not blocked]-? Proceed
           �
           ?
Check if user exists for this phone
  +-- exists: true/false
  +-- isRegistered: true if user exists and NOT isGuest
           �
           ?
Manage attempt counter + set blockedUntil if attempts >= 3
           �
           ?
Generate 6-digit code, 5-min expiry
           �
           ?
Upsert OTPVerification record
           �
           ?
sendGlobalSms(phone, "Your code is: XXXXXX", "OTP")
  +-- OTP SMS is NOT wallet-deducted (purpose="OTP")
           �
           ?
Return { exists, isRegistered }

---------------------------------------------

POST /api/auth/verify-otp { phone, code, name? }
           �
           ?
Load OTPVerification record
  +-[Not found]-? 401
  +-[Blocked]-? 429
  +-[Code mismatch OR expired]-? Increment attempts, maybe block
           �
           ?
Mark OTP as verified, reset attempts
           �
           ?
Find user by phone
  +-[Not found]-? Create guest account (isGuest=true, random password)
  �                +-- Create empty cart for guest
  +-[Found + isGuest + name is default]-? Update name
           �
           ?
Generate JWT tokens
           �
           ?
Return { user, accessToken, refreshToken }
```

---

## Builder Publish Flow

```
Admin edits content in frontend builder UI
           �
           ?
PUT /api/builder/pages/home/draft
  { document: BuilderDocument }
           �
           ?
validateBuilderDocument(document)
  +-- Zod schema validation (structure, field lengths, enum values)
  +-- Check no duplicate section IDs
  +-- Validate each section's props against section-specific schema
  +-- assertNoUnsafeStrings() � XSS prevention
           �
           ?
prisma.$transaction()
  +-- Upsert BuilderPage (create if first save)
  +-- Find latest version number
  +-- Create new BuilderPageVersion (version+1, status: "draft")
  +-- Update BuilderPage.draftVersionId
           �
           ?
Return { page, draft }

---------------------------------------------

POST /api/builder/pages/home/publish
           �
           ?
Find current draft (from page.draftVersionId or body.draftVersionId)
           �
           ?
Validate draft document again
           �
           ?
prisma.$transaction()
  +-- Update all existing "published" versions ? "archived"
  +-- Update draft.status = "published", publishedAt = now
  +-- Update page.status = "published"
  +-- Update page.title, page.slug from document
  +-- Update page.draftVersionId = published.id
  +-- Update page.publishedVersionId = published.id
           �
           ?
Return { page, published }

---------------------------------------------

Frontend: GET /api/builder/public/home
           �
           ?
Find BuilderPage by key
           �
           ?
Try: find version with status=published + activeFrom<=now + activeTo>=now
  +-[No campaign active]-? findUnique(page.publishedVersionId)
           �
           ?
Return { page, version: { id, version, publishedAt, document } }
```

---

## Media Upload Flow

```
POST /api/media/upload (multipart/form-data)
  field: images[]
           �
           ?
Multer middleware handles file buffering
           �
           ?
For each uploaded file:
  +-- Validate file type (images only)
  +-- Generate unique filename (UUID)
  �
  +-[S3 configured]--?
  �   +-- Sharp: resize to thumbnail (300px), medium (800px), full (1920px)
  �   +-- Convert to WebP
  �   +-- Upload all 3 sizes to S3 bucket
  �
  +-[Local storage]--?
      +-- Sharp: resize to 3 sizes
      +-- Convert to WebP
      +-- Save to ./uploads/ folder
           �
           ?
Create Media record in DB
  { fileName, originalName, fileType, fileSize,
    urlThumbnail, urlMedium, urlFull, width, height }
           �
           ?
Return Media records array
```

---

## WooCommerce Import Flow

```
POST /api/wordpress/import/start
           �
           ?
Load WooCommerce settings from DB (WordPressSetting)
           �
           ?
Fetch total product count from WooCommerce API
           �
           ?
Create ImportLog (session record)
           �
           ?
Create ImportTask records (one per page batch)
  e.g., page 1 (products 1-20), page 2 (21-40), etc.
           �
           ?
For each task: call startImportTask()

---------------------------------------------

importQueue.ts (in-process task manager):
  MAX_CONCURRENT_TASKS = 1
           �
           ?
For each task execution:
  +-- Fetch categories from WooCommerce ? build catMap
  +-- Fetch page of products from WooCommerce
  �
  +-- For each product:
  �   +-- Map WC fields to Femcart Product fields
  �   +-- Handle externalId for deduplication (upsert)
  �   +-- Map categories (create if missing)
  �   +-- Import images (download + re-upload to storage)
  �   +-- Handle SIMPLE vs VARIABLE products
  �   +-- Create/update ProductVariants if variable
  �
  +-- Update task.imported / task.failed
  +-- Check for cancel request between products
  +-- Write final status (done/paused/failed)
```

---

## SMS & Wallet Deduction Flow

```
Any code calls: sendGlobalSms(phone, text, purpose)
           �
           ?
Fetch SMS settings from DB (sms_gateway_url, sms_api_key, sms_sender_id)
Override with ENV if ENV values are set
           �
           ?
[purpose !== "OTP"]--?
  WalletService.adjustGlobalBalance(-cost, "DEDUCTION", reason)
    +-[Insufficient balance]-? Throw, ABORT SMS
    +-[Success]-? Continue
           �
           ?
[NODE_ENV === "development"]--?
  Log mock SMS to console, return true
           �
[production]--?
  Build gateway URL with params
  HTTP GET to gateway endpoint
           �
           ?
Parse response:
  +-[Success codes]-? SMS delivered, return true
  +-[Error codes 5201-5209]-? Refund pre-deducted cost, return false
               �
               ?
    WalletService.adjustGlobalBalance(+cost, "REFUND", reason)
```
