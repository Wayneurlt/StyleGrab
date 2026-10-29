# Architecture

StyleGrab is a **modular monolith**: one Nuxt 3 application serving the storefront (server-rendered for SEO), the staff workspace (client-rendered under `/admin`) and a JSON API (Nitro server routes), backed by one PostgreSQL database.

```
app/                    Vue front end
  layouts/              default (storefront), admin (staff shell)
  pages/                storefront pages, /admin/** staff pages
  components/ui/        design-system primitives (Button, Modal, Field, Badge, …)
  components/<area>/    feature components (admin, catalog, inventory, sales, purchasing, reports, settings, store)
  composables/          useStaff (session + permissions), useAction, useConfirm, useToast, useFormat, useStore
  stores/cart.ts        storefront cart (browser convenience only; server revalidates)
server/
  api/                  thin HTTP handlers: validate (Zod) → authorize → call a service
  services/             business rules — the only place that writes business data
  lib/                  prisma client + transactions, errors, actor/permissions, audit, numbering, settings
  utils/                HTTP helpers (error mapping, auth guards, rate limit), object storage
  middleware/           CSRF + security headers + request log
  plugins/              reservation-expiry sweep
shared/                 code used by both sides: money maths, permission catalogue, status labels/transitions
prisma/                 schema, migrations, seed
tests/                  Vitest suites (services against a real test DB; HTTP suite against the build)
```

## Layering rules

1. **Vue components never contain business rules.** They call the API; totals they display before submission are previews.
2. **API handlers are thin**: parse input with Zod (`server/schemas.ts`), call `requireStaff(event, permission)`, call one service function.
3. **Services own transactions and invariants.** Each mutating service takes an `Actor` (user id, label, permission set), re-checks permissions, runs inside `withTx`, and writes an audit event in the same transaction.
4. **One stock primitive.** `applyMovement` in `server/services/inventory.ts` is the only code that changes `InventoryBalance`. POS sales, website reservations, manual orders, receipts, adjustments, stocktakes and returns all call it.

## Data model (key tables)

| Domain | Tables |
| --- | --- |
| Access | `Role` (permission strings), `User`, `Session` (hashed tokens, staff and customers) |
| Catalogue | `Category` (tree, `code` for SKUs), `CategoryAttribute` (per-category attribute definitions, inherited by children), `Product`, `ProductImage` (object-storage keys), `ProductVariant` (unique SKU/barcode), `VariantAttributeValue` |
| Inventory | `InventoryBalance` (one row per variant: onHand, reserved, threshold, avgCost), `InventoryMovement` (append-only ledger), `StockAdjustment(+Item)`, `Stocktake(+Item)` |
| Purchasing | `Supplier`, `PurchaseOrder(+Item)`, `GoodsReceipt(+Item)` |
| Sales | `Order` (all channels — POS, website, WhatsApp, Instagram, …), `OrderItem` (price/name/SKU/cost snapshots), `OrderStatusEvent`, `PaymentMethod`, `PaymentRecord`, `Return(+Item)`, `Refund` |
| Cash | `PosRegister`, `PosShift`, `CashMovement` |
| Other | `Customer`, `Setting`, `Counter` (document numbers), `AuditEvent` (append-only) |

**Why one `Order` table for every channel?** A POS sale is simply an order created as `COMPLETED` with stock deducted immediately. Reports, receipts, payments, returns and customer history then work identically for every channel, and there is no second code path that could deduct stock.

### Database-level guarantees (migration `init`)

- `CHECK (onHand >= 0)` and `CHECK (0 <= reserved <= onHand)` → available stock can never go negative.
- Unique `InventoryMovement.dedupeKey` → each logical stock effect (e.g. `SALE:<orderItemId>`) is applied at most once.
- Triggers reject `UPDATE`/`DELETE` on `InventoryMovement` and `AuditEvent`.
- Partial unique index: one `OPEN` shift per register; one active (pending/confirmed) payment per `(method, reference)`.
- Case-insensitive unique SKU index; money/quantity sanity checks; `amountPaid + amountPending <= total`.
- Foreign keys use `RESTRICT` for anything historical (orders, payments, variants with sales).

## Key decisions

| Decision | Rationale |
| --- | --- |
| Money as integer minor units (`Int`) | No floating point. Max single value ≈ 21.4M major units; sums are computed in SQL as `bigint`. Rounding: half away from zero, once per computed amount (`shared/money.ts`). |
| Weighted-average cost per variant | Simple, stable, matches small-retail practice. Snapshotted on each order line at deduction. |
| Reservation model for website/manual orders | Stock is held when the order is placed and converted to a deduction on completion, so channels cannot oversell each other. |
| Server-side sessions in Postgres | Immediate revocation on deactivation/password change; tokens stored only as SHA-256 hashes; argon2id passwords. |
| Admin area client-rendered, storefront SSR | Staff screens don't need SEO; the storefront does. |
| Single inventory location | Multi-location transfers are out of scope; `InventoryBalance` would gain a `locationId` column when needed. |
| Local-disk object storage driver | Behind `server/utils/storage.ts`; swap for an S3-compatible driver on ephemeral hosting. |
| In-process rate limiter | Adequate for a single instance; use a shared store (Redis) when scaling horizontally. |
