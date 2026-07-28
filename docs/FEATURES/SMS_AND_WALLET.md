# Feature: SMS & Wallet System

> **Source files:** `src/utils/sms.ts`, `src/services/walletService.ts`, `src/controllers/WalletController.ts`

---

## SMS Gateway

### Overview
Femcart uses an external SMS gateway (MassData) to send OTP codes and order status notifications.

### Global SMS Function

```typescript
sendGlobalSms(phone: string, textBody: string, purpose: string): Promise<boolean>
```

### How It Resolves Configuration

SMS configuration is resolved in this priority order:
1. ENV variables (`SMS_API_KEY`, `SMS_GATEWAY_URL`) � highest priority
2. DB settings (`sms_api_key`, `sms_gateway_url`) � fallback

This allows runtime configuration changes via the admin panel without server restart.

### SMS in Development

When `NODE_ENV=development`, SMS is mocked:
```
=== MOCK SMS API (DEVELOPMENT MODE) ===
TO: 01XXXXXXXXX
TEXT: Your Femcart verification code is: 123456
====================
```

No actual gateway call is made. Always returns `true`.

### SMS Triggers

| Event | Message | Wallet Deducted? |
|-------|---------|-----------------|
| OTP send | `"Your Femcart verification code is: XXXXXX"` | No |
| Order SHIPPED | `"Your order #XXXXXX has been shipped..."` | Yes |
| Order DELIVERED | `"Your order #XXXXXX has been delivered..."` | Yes |
| Order CANCELLED | `"Your order #XXXXXX has been cancelled..."` | Yes |

### Error Codes

The gateway returns error codes 5201-5209:
| Code | Meaning |
|------|---------|
| 5201 | API not valid |
| 5202 | API not Active |
| 5203 | Sender ID not valid |
| 5204 | Text body not valid |
| 5205 | Contact numbers not valid |
| 5206 | Insufficient balance |
| 5207 | Insufficient balance of seller |
| 5208 | Account not active |
| 5209 | Account expired |

On any error code: the pre-deducted wallet amount is refunded.

---

## Global Wallet

### Purpose
The global wallet is an organizational-level balance used to track SMS costs and order-related fees.

### Operations

```typescript
WalletService.adjustGlobalBalance(
  amount: number,    // negative = deduction, positive = credit
  type: 'TOPUP' | 'DEDUCTION' | 'REFUND',
  note: string,
  userId?: string,   // undefined = global transaction
  tx?: Prisma.TransactionClient  // optional Prisma transaction
): Promise<void>
```

### Balance Calculation

Balance is computed by summing all `WalletTransaction` records where `userId IS NULL`. Not stored as a single balance field.

### Wallet vs User Reward Points

| Wallet | Reward Points |
|--------|--------------|
| Organization-level funds | Per-user loyalty points |
| Deducted for SMS costs | Earned on COMPLETED orders |
| Managed by admin | Credited automatically |
| `WalletTransaction` table (userId=null) | `User.rewardPoints` field |
| Top-up via admin panel | Cannot be manually edited (only via order status) |

### Admin API

```
GET  /api/wallet/balance         ? { balance: number }
GET  /api/wallet/transactions    ? paginated transaction list
POST /api/wallet/topup           ? { amount, note }
```
