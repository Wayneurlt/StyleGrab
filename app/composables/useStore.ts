export interface StoreInfo { name: string, phone: string, email: string, address: string, returnPolicy: string, currency: string }

export interface ProductCard {
  id: string
  name: string
  slug: string
  brand: string | null
  category: { name: string, slug: string }
  priceFrom: number
  priceTo: number
  images: { key: string, alt: string }[]
  inStock: boolean
  lowStock: boolean
  isNew: boolean
}

/** Shared storefront data (business info + category tree), fetched once per request/session. */
export async function useStoreInfo() {
  const business = useState<StoreInfo | null>('store-business', () => null)
  const { data } = await useFetch<StoreInfo>('/api/store/info', { key: 'store-info', dedupe: 'defer' })
  watchEffect(() => {
    if (data.value) business.value = data.value
  })
  return business
}

export function useCart() {
  const cart = useCartStore()
  onMounted(() => cart.hydrate())
  return cart
}
