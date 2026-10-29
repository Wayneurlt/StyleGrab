# API

JSON over HTTP, served by Nitro from `server/api/**` (file name = route + method).

## Conventions

- **Auth**: staff use the `sg_staff` cookie (`POST /api/auth/login`); shoppers have no accounts (guest checkout). The cookie is httpOnly, SameSite=Lax, Secure in production; sessions are stored server-side (hashed) and revoked on logout, deactivation or password change.
- **Authorization**: every `/api/admin/**` handler calls `requireStaff(event, '<permission>')`; services re-check permissions. Permission keys are listed in `shared/permissions.ts`.
- **CSRF**: non-GET `/api/**` requests must carry an `Origin`/`Referer` matching the host.
- **Validation**: request bodies/queries are parsed with Zod (`server/schemas.ts`). Unknown values are rejected, not ignored.
- **Money**: integer minor units (KES cents) in both directions.
- **Idempotency**: order/sale/checkout, receipt, return and (optionally) payment requests take an `idempotencyKey`; repeating a request returns the original result without side effects.
- **Errors**: `{ statusCode, statusMessage: <code>, message: <safe human text>, data: { code, …details } }`.
  `401` unauthenticated · `403` forbidden/CSRF · `404` not found · `409` conflict (insufficient stock, duplicate reference/SKU, invalid transition) · `413/415` upload size/type · `422` validation · `429` rate limited · `500` generic (details only in server logs).
- **Pagination**: `?page=&pageSize=` (max 100) → `{ total, items }`.

## Public (storefront)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/store/info` | Business name, contact, return policy, currency |
| GET | `/api/store/home` | Featured, new arrivals, best sellers (real sales only), categories |
| GET | `/api/store/categories` | Visible categories |
| GET | `/api/store/products` | `q, category, sort, min, max, inStock, attr_<code>=v1,v2, page` → cards + facets |
| GET | `/api/store/products/:slug` | Product, variants with availability, related |
| POST | `/api/store/cart` | Revalidate `{ lines }` against current price/stock |
| GET | `/api/store/payment-methods` | Methods + customer instructions |
| POST | `/api/store/checkout` | Guest order; reserves stock; rate limited |
| GET | `/api/store/orders/:number?key=` | Order confirmation view — requires the access key returned at checkout |
| GET | `/media/:key` | Uploaded images (immutable, cached) |

## Staff

| Area | Endpoints | Permission |
| --- | --- | --- |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` | — / signed in |
| Dashboard & search | `GET /api/admin/dashboard?from&to`, `GET /api/admin/search?q` | `dashboard.view`; search results filtered per permission |
| Categories | `GET/POST /api/admin/categories`, `PUT /api/admin/categories/:id`, `GET/PUT …/:id/attributes`, `POST …/:id/image`, `POST /api/admin/categories/reorder` | `catalog.view` / `catalog.manage` |
| Products | `GET/POST /api/admin/products`, `GET/PUT /api/admin/products/:id`, `POST …/:id/status`, `POST/PUT …/:id/images`, `DELETE …/:id/images/:imageId`, `GET /api/admin/products/sku-check` | `catalog.view` / `catalog.manage` (+ `catalog.price` for price/cost changes) |
| Variant lookup | `GET /api/admin/variants/search?q&categoryId&all` | any of `pos.sell`, `orders.manage`, `inventory.view`, `purchasing.manage` |
| Stock | `GET /api/admin/inventory/stock`, `GET /api/admin/inventory/movements`, `PUT /api/admin/inventory/:variantId/threshold` | `inventory.view` / `inventory.adjust` |
| Adjustments | `GET/POST /api/admin/inventory/adjustments`, `POST …/:id/decide` | `inventory.adjust` / `inventory.adjust.approve` |
| Receiving | `GET/POST /api/admin/inventory/receipts` | `inventory.receive` |
| Stocktakes | `GET/POST /api/admin/inventory/stocktakes`, `GET …/:id`, `PUT …/:id/counts`, `POST …/:id/submit|finalize|cancel` | `inventory.stocktake` / `inventory.stocktake.finalize` |
| Import | `GET /api/admin/inventory/import-template`, `POST /api/admin/inventory/import` (`{csv, commit}`) | `inventory.import` |
| POS | `POST /api/admin/pos/sale`, `GET /api/admin/pos/registers` | `pos.sell` |
| Shifts | `GET/POST /api/admin/shifts`, `GET /api/admin/shifts/current`, `GET /api/admin/shifts/:id`, `POST …/:id/cash`, `POST …/:id/close` | `shifts.manage` (+ `shifts.view.all` for others' shifts) |
| Orders | `GET/POST /api/admin/orders`, `GET/PATCH /api/admin/orders/:id`, `POST …/:id/status`, `POST …/:id/payments` | `orders.view` / `orders.manage` / `orders.cancel` / `payments.record` |
| Payments | `GET /api/admin/payments`, `POST /api/admin/payments/:id/verify`, `POST …/:id/void`, `GET/POST /api/admin/payment-methods`, `PUT …/:id` | `orders.view` / `payments.verify` / `payments.void` / `settings.manage` |
| Returns | `GET/POST /api/admin/returns`, `POST /api/admin/returns/items/:id/inspect` | `orders.view` / `returns.create` |
| Customers | `GET/POST /api/admin/customers`, `GET/PUT /api/admin/customers/:id` | `customers.view` / `customers.manage` (+ `customers.notes`) |
| Purchasing | `GET/POST /api/admin/suppliers`, `PUT …/:id`, `GET/POST /api/admin/purchase-orders`, `GET/PUT …/:id`, `POST …/:id/status` | `suppliers.view` / `purchasing.manage` |
| Reports | `GET /api/admin/reports/sales|profit|inventory|reconciliation`, `GET /api/admin/reports/export/sales|profit|reconciliation|stock|movements|inventory` (CSV) | `reports.sales` / `reports.financial` / `reports.inventory` |
| Settings & staff | `GET/PUT /api/admin/settings`, `GET/POST /api/admin/users`, `PUT …/:id`, `GET /api/admin/roles`, `PUT …/:id` | read: signed in · write: `settings.manage` / `users.manage` |
| Audit | `GET /api/admin/audit` (read-only; no edit/delete exists) | `audit.view` |
| Maintenance | `POST /api/admin/maintenance/expire-reservations` | `orders.cancel` |

Business rules behind these endpoints: [BUSINESS_RULES.md](BUSINESS_RULES.md).
