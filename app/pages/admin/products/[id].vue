<script setup lang="ts">
import { Archive, Boxes, Eye, Send } from 'lucide-vue-next'
import type { ProductFormValue } from '~/components/catalog/ProductForm.vue'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const id = computed(() => String(route.params.id))
interface ProductDetail {
  id: string
  code: string
  name: string
  slug: string
  description: string
  categoryId: string
  category: { name: string }
  brand: string | null
  price: number
  costPrice: number | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  isFeatured: boolean
  seoTitle: string | null
  seoDescription: string | null
  images: { id: string, key: string, alt: string, isPrimary: boolean, sortOrder: number }[]
  variants: { id: string, sku: string, barcode: string | null, title: string, price: number | null, costPrice: number | null, isArchived: boolean, attributes: { code: string, value: string }[], inventory: { onHand: number, reserved: number, lowStockThreshold: number } | null }[]
}
const { data: product, error, status, refresh } = useFetch<ProductDetail>(() => String(`/api/admin/products/${id.value}`), { server: false })
useHead({ title: computed(() => product.value?.name ?? 'Product') })
const { can } = useStaff()
const { money } = useFormat()
const { pending, run } = useAction()
const { confirm } = useConfirm()
const formKey = ref(0)

const initial = computed<ProductFormValue | null>(() => {
  const p = product.value
  if (!p) return null
  return {
    name: p.name, description: p.description, categoryId: p.categoryId, brand: p.brand ?? '', price: p.price, costPrice: p.costPrice,
    status: p.status, isFeatured: p.isFeatured, seoTitle: p.seoTitle ?? '', seoDescription: p.seoDescription ?? '',
    variants: p.variants.map(v => ({
      key: v.id, id: v.id, sku: v.sku, barcode: v.barcode ?? '', price: v.price, costPrice: v.costPrice, isArchived: v.isArchived,
      lowStockThreshold: v.inventory?.lowStockThreshold ?? null,
      attributes: Object.fromEntries(v.attributes.map(a => [a.code, a.value])),
    })),
  }
})

async function save(payload: Record<string, unknown>) {
  const ok = await run(() => apiFetch(`/api/admin/products/${id.value}`, { method: 'PUT', body: payload }), { success: 'Product saved' })
  if (ok) {
    await refresh()
    formKey.value++
  }
}

async function setStatus(status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') {
  if (status === 'ARCHIVED' && !(await confirm({ title: 'Archive this product?', message: 'It will be hidden from the store and POS. Sales history is kept and you can restore it later.', confirmLabel: 'Archive', danger: true }))) return
  const ok = await run(() => apiFetch(`/api/admin/products/${id.value}/status`, { method: 'POST', body: { status } }), { success: status === 'ACTIVE' ? 'Published' : status === 'ARCHIVED' ? 'Archived' : 'Moved to draft' })
  if (ok) {
    await refresh()
    formKey.value++
  }
}
</script>

<template>
  <div>
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !product" :rows="6" height="h-24" />
    <template v-else-if="product && initial">
      <UiPageHeader :title="product.name" :subtitle="`${product.code} · ${product.category.name}`" :crumbs="[{ label: 'Products', to: '/admin/products' }, { label: product.code }]">
        <UiBadge :tone="product.status === 'ACTIVE' ? 'success' : product.status === 'ARCHIVED' ? 'danger' : 'neutral'">{{ product.status.toLowerCase() }}</UiBadge>
        <UiButton v-if="product.status === 'ACTIVE'" variant="light" size="sm" :icon="Eye" :to="`/products/${product.slug}`">View in store</UiButton>
        <template v-if="can('catalog.manage')">
          <UiButton v-if="product.status !== 'ACTIVE'" size="sm" :icon="Send" :loading="pending" @click="setStatus('ACTIVE')">Publish</UiButton>
          <UiButton v-else variant="light" size="sm" :loading="pending" @click="setStatus('DRAFT')">Unpublish</UiButton>
          <UiButton v-if="product.status !== 'ARCHIVED'" variant="light" size="sm" :icon="Archive" @click="setStatus('ARCHIVED')">Archive</UiButton>
        </template>
      </UiPageHeader>

      <div class="space-y-5">
        <CatalogImageManager v-if="can('catalog.manage')" :product-id="product.id" :images="product.images" @changed="refresh()" />

        <UiCard title="Stock by variant">
          <template #actions>
            <UiButton v-if="can('inventory.adjust')" variant="light" size="sm" :icon="Boxes" to="/admin/inventory/adjustments?new=1">Adjust stock</UiButton>
          </template>
          <div class="overflow-x-auto">
            <table class="sg-table min-w-[560px]">
              <thead><tr><th>Variant</th><th>SKU</th><th>Price</th><th>On hand</th><th>Reserved</th><th>Available</th><th /></tr></thead>
              <tbody>
                <tr v-for="v in product.variants.filter(x => !x.isArchived)" :key="v.id">
                  <td class="font-medium">{{ v.title }}</td>
                  <td class="font-mono text-xs">{{ v.sku }}</td>
                  <td class="num">{{ money(v.price ?? product.price) }}</td>
                  <td class="num">{{ v.inventory?.onHand ?? 0 }}</td>
                  <td class="num">{{ v.inventory?.reserved ?? 0 }}</td>
                  <td class="num font-medium">{{ (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) }}</td>
                  <td class="text-right"><NuxtLink :to="`/admin/inventory/movements?variantId=${v.id}`" class="text-[13px] text-ink-soft underline-offset-2 hover:underline">History</NuxtLink></td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>

        <CatalogProductForm v-if="can('catalog.manage')" :key="formKey" :initial="initial" :product-id="product.id" :saving="pending" @submit="save" />
      </div>
    </template>
  </div>
</template>
