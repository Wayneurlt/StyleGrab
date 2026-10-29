import { IMPORT_TEMPLATE } from '~~/server/services/importer'

export default defineApi(async (event) => {
  await requireStaff(event, 'inventory.import')
  setResponseHeaders(event, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="stylegrab-import-template.csv"' })
  return IMPORT_TEMPLATE
})
