import { storeProduct } from '~~/server/services/storefront'

export default defineApi(event => storeProduct(param(event, 'slug')))
