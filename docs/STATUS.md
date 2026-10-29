# Status (2026-10-29)

## Verification

| Check | Result |
| --- | --- |
| Migrations (`init`, `order_amount_returned`, `restore_trgm_indexes`) | Applied to the main and test databases; `prisma migrate dev` reports no drift |
| `vue-tsc --noEmit` (strict) | Passes, 0 errors |
| `eslint .` | Passes, 0 errors |
| `nuxt build` | Succeeds |
| `vitest run` | **43/43 passed** in 4 suites: money/rules (6), catalogue + inventory + import (15), POS/orders/payments/returns/shifts/concurrency (13), HTTP against the production build (9) |
| Rendering smoke test | Production build on the test DB, driven with headless Edge: storefront home/shop/product, admin login, dashboard, POS, products, inventory, orders, reports and roles all load with no server errors |

**What the tests cover:** duplicate SKUs (case-insensitive), category-specific attributes, archival, price-permission checks, opening stock and weighted-average cost, PO receiving (partial + damaged, idempotent), negative-stock prevention, idempotent movements, the append-only ledger, adjustment approval, stocktake deltas during live sales, CSV import validation and atomic commit, POS sale snapshots, double-submit idempotency, server-side discount/override permissions, partial/pending/unpaid balances, overpayment and duplicate-reference rejection, verify/reject/void, shift requirement, **three concurrent sales of the last unit (exactly one succeeds)**, one shared balance across website/manual/POS, reservations on complete/cancel/expiry, cancel refusal with payments, returns by condition, return quantity caps, refund caps, failed transactions leaving no partial rows, exchanges, cash-drawer reconciliation, 401/403 enforcement, CSRF, content-sniffed uploads, and order-page access keys.

**Not verified by automated tests:** UI interactions on each admin page (pages typecheck and render, but forms were not clicked through end to end), printing, mobile layouts beyond a single screenshot, accessibility audit with assistive technology.

## Implemented

Storefront (home, category listing with filters/sort/pagination, product page with variant selection and availability, cart with server revalidation, guest checkout, order confirmation page with payment instructions, policies, SEO metadata, JSON-LD) · Catalogue (category tree, per-category attributes, products, variants, SKU generation, barcodes, images) · Inventory (balances, ledger, adjustments with approval, receiving, stocktakes, low-stock, CSV import) · POS (tap or scan to add, one-tap "how they paid", optional discount/customer/code, cash change, optional shifts, receipts) · Orders (all channels, manual social orders, fulfilment state machine, payments, verification, voids, returns, exchanges, inspection) · Customers · Suppliers and purchase orders · Reports (dashboard, sales, profit/COGS, inventory valuation, reconciliation, CSV exports) · Staff, roles, permissions, settings, payment methods · Audit log.

## Known limitations

- **Object storage** uses local disk (`UPLOAD_DIR`). Needs persistent disk or an S3-compatible driver for multi-instance/ephemeral hosting. No image resizing; images are served at their uploaded size.
- **Email notifications** are not implemented (no provider configured).
- **Rate limiting** is per process.
- **Single stock location**; no transfers.
- The cost of units **returned damaged** is not reported as shrinkage (it simply leaves COGS).
- Returns are attributed to the period of the original sale in sales/profit reports.
- Stock received while the existing average cost is unknown takes the new receipt's cost as its average.
- Money columns are 32-bit integers (max ≈ 21.4M per single amount).
- Customer password reset by email is not available (staff can't reset customer passwords either); staff passwords are reset by an owner.
- No automated backups are configured by this repository — see DEPLOYMENT.md.
