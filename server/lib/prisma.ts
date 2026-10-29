import { PrismaClient, type Prisma } from '@prisma/client'

declare global {
  var __stylegrabPrisma: PrismaClient | undefined
}

export const prisma: PrismaClient = globalThis.__stylegrabPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})
if (process.env.NODE_ENV !== 'production') globalThis.__stylegrabPrisma = prisma

export type Tx = Prisma.TransactionClient

/**
 * Run `fn` in an interactive transaction. The remote database may be far away, so timeouts are generous.
 * Retries once on serialization/deadlock failures (P2034).
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, opts: { timeout?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 15_000, timeout: opts.timeout ?? 30_000 })
    }
    catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'P2034' && attempt < 2) continue
      throw e
    }
  }
}
