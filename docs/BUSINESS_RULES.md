# Business rules: inventory, orders, payments, returns

## Inventory

Each variant has one balance: **on hand** (physically present), **reserved** (held for open orders) and **available = on hand − reserved**.

All changes go through `applyMovement` (`server/services/inventory.ts`), which in one transaction:

1. returns early if the movement's `dedupeKey` already exists (idempotency),
2. locks the balance row and applies a **conditional UPDATE** — it only succeeds if on-hand stays ≥ 0 and reserved stays within 0…on-hand,
3. blends the weighted-average cost when stock enters at a known cost,
4. appends an `InventoryMovement` with the resulting balances, user, reason and reference.

Concurrent sales of the last unit serialise on the row lock; the second sees insufficient stock and its whole transaction rolls back (covered by a test that fires three simultaneous sales at one unit).

| Movement | Effect | Created by |
| --- | --- | --- |
| `OPENING_STOCK` | +on hand | Opening-stock adjustment, CSV import |
| `PURCHASE_RECEIPT` | +on hand (accepted qty only) at purchase cost | Goods receipt |
| `RESERVATION` | +reserved | Website / manual order placed |
| `RESERVATION_RELEASE` | −reserved | Order cancelled or reservation expired |
| `SALE` | −on hand (and −reserved if it was reserved) | POS sale; order completed |
| `RETURN_TO_STOCK` | +on hand at the original line cost | Return marked saleable / passed inspection |
| `DAMAGE`, `LOSS`, `ADJUSTMENT` | ± on hand | Stock adjustment |
| `COUNT_ADJUSTMENT` | ± on hand | Finalized stocktake |

Corrections are always new, compensating movements; the ledger cannot be edited (DB trigger).

### Adjustments
Require a reason and a note (except opening stock). Applied immediately when the total absolute quantity is within **Settings → adjustment approval threshold** or the user holds `inventory.adjust.approve`; otherwise they wait as *pending approval* and change nothing until a manager approves. Damage/loss must reduce stock; opening stock must increase it. Negative adjustments are valued at the current average cost (shown as shrinkage in the profit report).

### Receiving
Recorded per delivery (optionally against a purchase order). For each line: received, accepted, damaged. **Only accepted units become sellable.** The purchase order's received quantities advance and its status becomes partially received / received. Each receipt carries an idempotency key, so a resubmitted form cannot add stock twice.

### Stocktakes
Starting a count snapshots the expected on-hand of every active variant in scope. Staff record counts; submit; a user with `inventory.stocktake.finalize` finalizes. Finalizing posts `counted − expected` for counted lines only. Because the delta is relative to the snapshot, sales during the count are not overwritten. A count that would push on-hand below what is reserved is rejected.

### Low stock
Each variant has a threshold (default from settings). Low = 0 < available ≤ threshold; out = available ≤ 0. Shown on the dashboard, inventory list and notification bell.

## Orders and channels

Every sale is an `Order` with a `channel`: `POS`, `WEBSITE`, `WHATSAPP`, `INSTAGRAM`, `FACEBOOK`, `PHONE`, `OTHER`.

| Created via | Initial status | Stock |
| --- | --- | --- |
| POS | `COMPLETED` | deducted immediately |
| Manual (staff, social channels) | `CONFIRMED` | reserved |
| Website checkout | `PENDING` | reserved, expires after *reservation hours* if not confirmed and nothing is recorded as paid |

Fulfilment transitions (`shared/labels.ts → ORDER_TRANSITIONS`):

```
PENDING → CONFIRMED | CANCELLED
CONFIRMED → PROCESSING | READY | COMPLETED | CANCELLED
PROCESSING → READY | COMPLETED | CANCELLED
READY → COMPLETED | CANCELLED
COMPLETED, CANCELLED → (terminal; changes after completion go through returns)
```

- **Completing** converts each line's reservation into a `SALE` deduction (exactly once per line) and snapshots the unit cost.
- **Cancelling** releases reservations. It is refused while the order has recorded payments — void/reject pending ones and refund confirmed ones first.
- **Fulfilment status never changes payment status**, and vice versa.

Pricing is always computed on the server from the catalogue: website checkouts cannot carry discounts or price overrides; staff discounts need `pos.discount` and, above the configured percentage, `pos.discount.override`; price overrides need `pos.price.override`. Order-level discounts are allocated to lines (largest-remainder) so line totals always sum to the order total. Each order line stores product name, variant, SKU, list price, unit price, discounts, line total and cost — receipts never read current catalogue rows.

Every create endpoint takes an **idempotency key** (generated once per checkout/cart in the browser); a retried or double-clicked submission returns the original order and performs no second stock movement.

## Payments (recorded, not processed)

StyleGrab does not take payments. Staff record money received elsewhere.

- Payment methods are configurable (Cash, M-Pesa, Bank transfer, Card terminal, …). Each defines whether a **reference is required** and whether records **need verification**.
- **At the counter (POS)** the cashier sees the money (cash, M-Pesa message, card slip), so the payment is recorded as **confirmed** immediately and a transaction code is optional.
- **Remote orders** (website, WhatsApp, Instagram, phone): records for methods that need verification start as **awaiting confirmation**; a user with `payments.verify` confirms (money seen on the statement) or rejects them. A code entered remotely is never treated as proof.
- A recorded amount may not exceed what is still due (pending records count). Cash can record a larger *tendered* amount; change is computed.
- The same reference cannot be active twice for the same method (DB partial unique index); a rejected or voided reference can be re-entered.
- **Void** is for entries made in error (`payments.void`, reason required) — it is not a refund.
- Cash shifts are optional. If the cashier has a shift open, cash sales are counted in it automatically; a manager can make an open shift mandatory in Settings.

Order payment status is derived from the records:

```
due     = total − returned goods value
netPaid = confirmed − refunded
REFUNDED / PARTIALLY_REFUNDED   if any refund (netPaid ≤ 0 → REFUNDED)
PAID                            netPaid ≥ due
AWAITING_CONFIRMATION           netPaid + pending ≥ due
PARTIALLY_PAID                  netPaid + pending > 0
UNPAID                          otherwise
```

## Returns, refunds and exchanges

- Only completed orders can be returned; the original order is never deleted or rewritten.
- Return quantity per line ≤ purchased − already returned (enforced with a conditional update, safe under concurrency).
- Credit per returned unit is the line's net total share, computed cumulatively so repeated partial returns never exceed the line total.
- Condition per item: **Saleable** (restocked at the original cost), **Damaged** (not restocked), **Needs inspection** (not restocked until someone resolves it as restock or write-off).
- Refund amount ≤ credit and ≤ what the customer actually paid beyond what they still owe. Cash refunds are tied to the open shift.
- **Exchange**: the returned credit is moved to a new POS order (recorded as a refund on the original with the system *Exchange credit* method and a matching payment on the new order); the customer pays any difference with normal payment records, or any remainder can be refunded.

## Cash shifts

`expected cash = opening float + confirmed cash payments + pay-ins − cash refunds − pay-outs`. Closing records counted cash and the difference; a note is required when they differ. Non-cash payments are listed separately and never affect the drawer.

## Costing and profit

- Method: **weighted average cost** per variant. Receipts (and returns, at their original cost) blend into the average; sales snapshot the average on each order line.
- Revenue is recognised when an order is completed, at line totals net of discounts. Returns reduce revenue in the period of the original sale.
- COGS = (sold − returned) × snapshot cost. Returned units of any condition leave COGS. Damage/loss **adjustments** are reported separately as shrinkage; the cost of units returned *damaged* (never restocked) is currently not included in shrinkage — a known limitation listed in STATUS.md.
- Lines without a known cost are **excluded from margin** and listed as a limitation — margins are never estimated.
- Stock with unknown cost: if stock is received at a cost while the existing average is unknown, the new average equals the received cost (documented approximation).

## Business invariants (and where they are enforced)

| # | Invariant | Enforcement |
| --- | --- | --- |
| 1 | Unique SKU | DB unique + case-insensitive index; service pre-check |
| 2 | Available stock never negative | Conditional UPDATE + DB CHECK constraints |
| 3 | A sale deducts once | `SALE:<orderItemId>` dedupe key + order idempotency key |
| 4 | A receipt adds once | Receipt idempotency key + `GRN:<itemId>` dedupe key |
| 5 | Released/expired reservations free stock | `RESERVATION_RELEASE` on cancel/expiry |
| 6 | Returns ≤ purchased | Conditional update on `returnedQty` + DB CHECK |
| 7 | Damaged returns not sellable | Only `SALEABLE` / passed inspection restock |
| 8 | Recorded payments ≤ due | Service check + DB CHECK `amountPaid + amountPending <= total` |
| 9 | No duplicate references | Partial unique index on active `(method, reference)` |
| 10 | Fulfilment ≠ payment | Separate columns; transitions never touch payment status |
| 11 | Unique sale number | `Counter` row lock + unique `Order.number` |
| 12 | History immutable | Snapshots on order lines; append-only ledger/audit |
| 13–14 | Prices, stock and permissions checked on the server | Services + `requireStaff` on every admin endpoint |
| 15 | All-or-nothing | Every mutating service runs in one transaction (tested: failed sale/return leaves no partial rows) |

Deliberate exception: none — negative stock is never permitted.
