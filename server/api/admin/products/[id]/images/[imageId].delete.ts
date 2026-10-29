import { removeProductImage } from '~~/server/services/catalog'
import { deleteObject } from '~~/server/utils/storage'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const key = await removeProductImage(actor, param(event, 'id'), param(event, 'imageId'))
  await deleteObject(key)
  return { ok: true }
})
