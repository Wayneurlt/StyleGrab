# Deployment, backups and restore

## Requirements

- Node.js 20+ (22 LTS recommended)
- PostgreSQL 14+ with the `pg_trgm` extension available (created by the first migration)
- Persistent disk for `UPLOAD_DIR`, **or** replace `server/utils/storage.ts` with an S3-compatible driver
- HTTPS termination (cookies are `Secure` when `NODE_ENV=production`)

## Release procedure

```bash
npm ci
npm run db:deploy        # applies prisma/migrations — never edit the production schema by hand
npm run build
NODE_ENV=production node .output/server/index.mjs   # honours PORT / HOST
```

First install only: `SEED_OWNER_EMAIL=… npm run db:seed` (reference data + first owner). Never set `SEED_DEMO_DATA=true` in production; the seed refuses when `NODE_ENV=production`.

Environment variables are documented in `.env.example`. With a connection pooler (e.g. Neon `-pooler` host or PgBouncer) point `DATABASE_URL` at the pooler and `DIRECT_DATABASE_URL` at the direct host (migrations need a direct connection).

Behind a reverse proxy set `TRUST_PROXY=true` so client IPs (rate limiting, audit) and the host (CSRF origin check) are read from forwarded headers. Make sure the proxy overwrites those headers.

### Background work
The server sweeps expired website reservations every 5 minutes. With several instances this is safe (each order is locked and re-checked), or disable it with `RESERVATION_SWEEP=off` and call `POST /api/admin/maintenance/expire-reservations` from a scheduler with an authorised session.

### Scaling notes
- The login/checkout rate limiter is per process. Behind a load balancer, move it to a shared store.
- Uploaded images on local disk are per instance — use object storage when running more than one instance.

## Logging and monitoring
API requests and unhandled errors are written to stdout as JSON lines (no secrets, tokens or passwords; audit payloads scrub password/token/secret/hash keys). Ship stdout to your log platform and alert on `"level":"error"`. Unhandled errors return a generic message to clients; stack traces are never sent. No external error-monitoring service is configured yet.

## Backups

**Nothing is backed up automatically by this repository.** Configure one of:

1. **Managed provider backups / point-in-time restore** (recommended). On Neon, history retention provides PITR — confirm the retention window on your plan and test a restore to a branch.
2. **Scheduled logical dumps** (in addition, for off-site copies):

```bash
# nightly, keep 30 days, store off-site (encrypted)
pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --file="stylegrab-$(date +%F).dump"
```

Back up `UPLOAD_DIR` (product images) on the same schedule, e.g. `tar czf uploads-$(date +%F).tgz storage/uploads` or bucket versioning. `storage/uploads/` is also committed to git, so images uploaded before a commit are restored by a fresh clone — but images uploaded on a live server afterwards are only on that server until they are backed up (or committed).

## Restore

```bash
# 1. Restore into a NEW empty database first and verify before switching traffic.
createdb stylegrab_restore
pg_restore --no-owner --dbname="postgresql://…/stylegrab_restore" stylegrab-YYYY-MM-DD.dump

# 2. Check migration state and sanity
DATABASE_URL=… DIRECT_DATABASE_URL=… npx prisma migrate status
psql "postgresql://…/stylegrab_restore" -c 'SELECT count(*) FROM "Order"; SELECT count(*) FROM "InventoryMovement";'

# 3. Point DATABASE_URL / DIRECT_DATABASE_URL at the restored database and restart the app.
# 4. Restore the matching uploads archive into UPLOAD_DIR.
```

Note: `pg_restore` recreates the append-only triggers; restoring data with them in place is fine because it inserts rather than updates.

Practise a restore at least quarterly.
