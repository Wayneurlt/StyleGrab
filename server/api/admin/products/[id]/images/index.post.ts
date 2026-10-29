import { addProductImage } from '~~/server/services/catalog'
import { deleteObject, putImage } from '~~/server/utils/storage'

/** Multipart upload (field "file"). Validated by magic bytes and size before anything is stored. */
export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const parts = await readMultipartFormData(event)
  const files = (parts ?? []).filter(p => p.name === 'file' && p.data?.length)
  if (!files.length) throw createError({ statusCode: 422, statusMessage: 'no_file', message: 'Choose at least one image' })
  if (files.length > 6) throw createError({ statusCode: 422, statusMessage: 'too_many', message: 'Upload at most 6 images at a time' })
  const max = useRuntimeConfig().uploadMaxBytes
  const created = []
  for (const f of files) {
    const stored = await putImage(f.data, max)
    try {
      created.push(await addProductImage(actor, param(event, 'id'), stored))
    }
    catch (e) {
      await deleteObject(stored.key)
      throw e
    }
  }
  return created
})
