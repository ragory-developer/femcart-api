# Module: Order System

> **Source files:** `src/controllers/OrderController.ts`, `src/routes/orderRoutes.ts`

---

## Purpose

The Order System manages the complete lifecycle of a customer purchase — from calculating totals to placing, tracking, and fulfilling orders. It handles both authenticated and guest checkouts.

---

## Responsibilities

1. **Calculate order totals** — subtotal, delivery fee, coupon discounts
2. **Place orders** — with stock validation and deduction
3. **Process payments** — initiate SSLCommerz or mark COD
4. **Manage order status** — admin lifecycle management
5. **Process returns and damages** — partial and full returns with restocking
6. **Award reward points** — on order completion
7. **Send notifications** — SMS on status changes

---

## Key Methods

### `calculate(req, res)`
Preview order totals without placing an order. Accepts payload `items` or falls back to DB cart. Supports `optionalAuthenticate` — works for guests.

### `create(req, res)`
Places a real order. If no `userId` in token, creates/finds a guest user by `customerPhone`. Runs inside a `prisma.$transaction()` to atomically:
- Lock and increment coupon `usedCount`
- Create `Order` + `OrderItem` records
- Decrement stock
- Clear DB cart
- Deduct from global wallet (if configured)

After the transaction, fires an async Facebook CAPI event.

### `updateStatus(req, res)` — Admin only
Changes order status with side effects:
- Status → COMPLETED: credit reward points
- Status → CANCELLED: restock all items
- Cancelled → other status: deduct stock again
- Creates an audit `OrderNote`
- Sends SMS for SHIPPED / DELIVERED / CANCELLED

### `processReturn(req, res)` — Admin only
Processes item returns/damages:
- Returns: restocks product/variant
- Damages: does NOT restock
- Updates `OrderItem.returnedQuantity` / `damagedQuantity`
- Recalculates order status: RETURNED (all) or PARTIALLY_RETURNED

---

## Business Rules

| Rule | Implementation |
|------|---------------|
| Guest checkout requires phone | If no token, `customerPhone` is mandatory |
| Stock checked before order | Unless `ignore_stock_limits` setting = `"true"` |
| Coupon locked inside transaction | Prevents race condition on maxUses |
| Price is snapshotted | `OrderItem.price` is copied at order time, not product price |
| Reward points only on COMPLETED | Added in `updateStatus`, revoked if status reverts |
| Returns only on DELIVERED/COMPLETED/PARTIALLY_RETURNED | Validation in `processReturn` |
