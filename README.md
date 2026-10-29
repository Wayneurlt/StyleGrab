# StyleGrab

Retail platform for StyleGrab (scarves, belts, bags, shoes): a customer storefront, a point-of-sale register, manual WhatsApp/Instagram order entry, inventory, purchasing, customers, reports, staff permissions and an audit trail. Every channel shares **one catalogue and one inventory ledger** in PostgreSQL.

| Area | URL |
| --- | --- |
| Storefront | `/` |
| Staff workspace (dashboard, POS, inventory, …) | `/admin` |

## Stack

Nuxt 3 (Vue 3, TypeScript strict) · Nitro server routes · Prisma 6 · PostgreSQL · Tailwind CSS · Zod · Vitest. A modular monolith: business rules live in `server/services/*`, API routes are thin.

## Quick start

Requirements: Node.js 20+ (22 recommended), a PostgreSQL 14+ database.

```bash
npm install
cp .env.example .env            # then fill in DATABASE_URL / DIRECT_DATABASE_URL
npm run db:deploy               # apply migrations
SEED_OWNER_EMAIL=you@example.com npm run db:seed   # roles, payment methods, categories, first owner
npm run dev                     # http://localhost:3000  (staff: /admin)
```

The seed prints a generated owner password if `SEED_OWNER_PASSWORD` is empty. For a development catalogue add `SEED_DEMO_DATA=true` (refused when `NODE_ENV=production`).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / run (`node .output/server/index.mjs`) |
| `npm run typecheck` | `vue-tsc` strict type checking |
| `npm run lint` | ESLint |
| `npm test` | Vitest (needs `.env.test`, see below) |
| `npm run db:migrate` | Create a new migration in development |
| `npm run db:deploy` | Apply migrations (CI / production) |
| `npm run db:seed` | Reference data + first owner (+ demo data in dev) |

## Tests

Tests run against a **separate database** configured in `.env.test` (same variables as `.env`). The harness refuses to start unless the URL points at a database named `stylegrab_test` (or localhost), truncates it between suites, and applies migrations automatically.

```bash
# .env.test
DATABASE_URL="postgresql://…/stylegrab_test?sslmode=require"
DIRECT_DATABASE_URL="postgresql://…/stylegrab_test?sslmode=require"
npm test
```

`tests/http.test.ts` boots the production build and is skipped unless `npm run build` has been run.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data model, key decisions
- [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) — inventory, orders, payments, returns, costing, invariants
- [docs/API.md](docs/API.md) — endpoints and conventions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment, backups and restore
- [docs/STATUS.md](docs/STATUS.md) — implemented features, verification status, known limitations

## Scope boundaries (deliberate)

No payment gateway, M-Pesa STK push or card processing — payments are *recorded* by staff and M-Pesa/bank references require separate verification. No delivery pricing, courier integration, multi-location stock, offline POS or social-media API ingestion. The data model leaves room for each of these.
