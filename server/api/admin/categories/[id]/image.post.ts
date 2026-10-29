import { updateCategory } from '~~/server/services/catalog'
import { putImage } from '~~/server/utils/storage'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.data)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'no_file', message: 'Choose an image to upload' })
  const stored = await putImage(file.data, useRuntimeConfig().uploadMaxBytes)
  return updateCategory(actor, param(event, 'id'), { imageKey: stored.key })
})
