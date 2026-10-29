/**
 * End-to-end HTTP tests against the production build (`npm run build` first). Boots .output/server on a free
 * port with the test database and exercises authentication, server-side authorization, CSRF, upload
 * validation and a full POS sale through the real endpoints. Skipped when no build exists.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashPassword } from '../server/services/auth'
import { createProduct } from '../server/services/catalog'
import { createAdjustment } from '../server/services/inventory'
import { actors, key, method, prisma, resetDb, shiftFor } from './helpers'

const BUILD = '.output/server/index.mjs'
const PORT = 3999
const BASE = `http://127.0.0.1:${PORT}`
const PASSWORD = 'correct-horse-42'

let server: ChildProcess | undefined
let variantId = ''

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/store/info`)
      if (r.ok) return
    }
    catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('server did not start')
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'origin': BASE }, body: JSON.stringify({ email, password: PASSWORD }) })
  expect(r.status).toBe(200)
  return r.headers.get('set-cookie')!.split(';')[0]!
}

const call = (path: string, cookie?: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', 'origin': BASE, ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } })

describe.skipIf(!existsSync(BUILD))('HTTP API (production build)', () => {
  const cookies: Record<string, string> = {}

  beforeAll(async () => {
    await resetDb()
    const A = await actors()
    const hash = await hashPassword(PASSWORD)
    await prisma.user.updateMany({ data: { passwordHash: hash } })
    const cat = await prisma.category.findUniqueOrThrow({ where: { code: 'SH' } })
    const p = await createProduct(A.owner, { name: 'HTTP Sneaker', categoryId: cat.id, price: 300000, costPrice: 100000, status: 'ACTIVE', variants: [{ attributes: { color: 'Red', size: '40' } }] })
    variantId = p.variants[0]!.id
    await createAdjustment(A.owner, { reason: 'OPENING_STOCK', items: [{ variantId, qtyChange: 3, unitCost: 100000 }] })
    await shiftFor(A.cashier, 0)

    server = spawn(process.execPath, [BUILD], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NITRO_PORT: String(PORT), NITRO_HOST: '127.0.0.1', RESERVATION_SWEEP: 'off', NODE_ENV: 'production' }, stdio: 'ignore' })
    await waitForServer()
    const users = await prisma.user.findMany({ include: { role: true } })
    for (const u of users) cookies[u.role.key] = await login(u.email)
  }, 240_000)

  afterAll(() => {
    server?.kill()
  })

  it('rejects unauthenticated access to admin APIs', async () => {
    expect((await call('/api/admin/orders')).status).toBe(401)
    expect((await call('/api/admin/dashboard')).status).toBe(401)
  })

  it('rejects wrong passwords without revealing which part was wrong', async () => {
    const r = await call('/api/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email: 'nobody@test.local', password: 'x' }) })
    expect(r.status).toBe(401)
    expect((await r.json()).message).toBe('Incorrect email or password')
  })

  it('enforces permissions on the server', async () => {
    expect((await call('/api/admin/reports/profit', cookies.cashier)).status).toBe(403)
    expect((await call('/api/admin/audit', cookies.cashier)).status).toBe(403)
    expect((await call('/api/admin/users', cookies.viewer, { method: 'POST', body: JSON.stringify({ email: 'a@b.co', name: 'x', roleId: 'x', password: 'abcdefghij1' }) })).status).toBe(403)
    expect((await call('/api/admin/inventory/adjustments', cookies.viewer, { method: 'POST', body: JSON.stringify({ reason: 'LOSS', notes: 'x', items: [{ variantId, qtyChange: -1 }] }) })).status).toBe(403)
    expect((await call('/api/admin/reports/profit', cookies.owner)).status).toBe(200)
  })

  it('blocks cross-site state-changing requests (CSRF)', async () => {
    const r = await fetch(`${BASE}/api/admin/pos/sale`, { method: 'POST', headers: { 'content-type': 'application/json', 'origin': 'https://evil.example', 'cookie': cookies.cashier! }, body: '{}' })
    expect(r.status).toBe(403)
  })

  it('validates input and returns actionable errors', async () => {
    const r = await call('/api/admin/pos/sale', cookies.cashier, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'short', lines: [] }) })
    expect(r.status).toBe(422)
  })

  it('rejects non-image uploads by content, not extension', async () => {
    const product = await prisma.product.findFirstOrThrow()
    const form = new FormData()
    form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png')
    const r = await fetch(`${BASE}/api/admin/products/${product.id}/images`, { method: 'POST', headers: { origin: BASE, cookie: cookies.manager! }, body: form })
    expect(r.status).toBe(415)
  })

  it('records a POS sale end to end with server-side pricing', async () => {
    const shift = await prisma.posShift.findFirstOrThrow({ where: { status: 'OPEN' } })
    const cash = await method('CASH')
    const k = key()
    const body = JSON.stringify({ idempotencyKey: k, shiftId: shift.id, lines: [{ variantId, quantity: 1 }], payments: [{ methodId: cash.id, amount: 300000, tendered: 500000 }] })
    const r = await call('/api/admin/pos/sale', cookies.cashier, { method: 'POST', body })
    expect(r.status).toBe(200)
    const sale = await r.json()
    expect(sale).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', total: 300000 })
    // Retried request (same key) returns the same sale and does not deduct again.
    const again = await (await call('/api/admin/pos/sale', cookies.cashier, { method: 'POST', body })).json()
    expect(again.id).toBe(sale.id)
    expect((await prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId } })).onHand).toBe(2)
  })

  it('places a guest website order that reserves the same stock', async () => {
    const r = await call('/api/store/checkout', undefined, { method: 'POST', body: JSON.stringify({ idempotencyKey: key(), lines: [{ variantId, quantity: 2 }], contact: { name: 'Guest Buyer', phone: '0711222333' }, fulfilmentType: 'PICKUP' }) })
    expect(r.status).toBe(200)
    const { number, accessKey } = await r.json()
    expect((await prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId } }))).toMatchObject({ onHand: 2, reserved: 2 })
    // The order page needs the access key — order numbers alone are not enough.
    expect((await call(`/api/store/orders/${number}`)).status).toBe(404)
    const view = await call(`/api/store/orders/${number}?key=${accessKey}`)
    expect(view.status).toBe(200)
    expect((await view.json()).paymentStatus).toBe('UNPAID')
    // Nothing left for the POS.
    const sale = await call('/api/admin/pos/sale', cookies.manager, { method: 'POST', body: JSON.stringify({ idempotencyKey: key(), lines: [{ variantId, quantity: 1 }] }) })
    expect(sale.status).toBe(409)
  })

  it('does not expose customer records publicly', async () => {
    expect((await call('/api/admin/customers')).status).toBe(401)
  })
})
