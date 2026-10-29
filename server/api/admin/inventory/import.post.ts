import { z } from 'zod'
import { commitImport, previewImport } from '~~/server/services/importer'

/** { csv, commit: false } previews; { csv, commit: true } re-validates and imports atomically. */
export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.import')
  const input = await body(event, z.object({ csv: z.string().min(1).max(2_000_000), commit: z.boolean().default(false) }))
  return input.commit ? commitImport(actor, input.csv) : previewImport(actor, input.csv)
})
