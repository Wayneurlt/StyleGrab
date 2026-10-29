import type { Tx } from './prisma'

const FORMATS: Record<string, { prefix: string, pad: number, start: number }> = {
  order: { prefix: 'SG-', pad: 5, start: 10000 },
  return: { prefix: 'RTN-', pad: 5, start: 0 },
  purchase_order: { prefix: 'PO-', pad: 5, start: 0 },
  goods_receipt: { prefix: 'GRN-', pad: 5, start: 0 },
  adjustment: { prefix: 'ADJ-', pad: 5, start: 0 },
  stocktake: { prefix: 'STK-', pad: 4, start: 0 },
}

/**
 * Allocate the next document number. The UPSERT takes a row lock on the counter, so concurrent
 * transactions serialise here and numbers are unique (they are also protected by unique constraints).
 */
export async function nextNumber(tx: Tx, key: keyof typeof FORMATS): Promise<string> {
  const fmt = FORMATS[key]!
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, ${fmt.start + 1})
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`
  return fmt.prefix + String(rows[0]!.value).padStart(fmt.pad, '0')
}
