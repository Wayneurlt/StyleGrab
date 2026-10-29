<script setup lang="ts">
import type { ProductFormValue } from '~/components/catalog/ProductForm.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: 'New product' })

const { pending, run } = useAction()
const initial: ProductFormValue = {
  name: '', description: '', categoryId: '', brand: '', price: 0, costPrice: null, status: 'DRAFT', isFeatured: false, seoTitle: '', seoDescription: '',
  variants: [{ key: 'n0', sku: '', barcode: '', attributes: {}, price: null, costPrice: null, lowStockThreshold: null, isArchived: false }],
}

async function create(payload: Record<string, unknown>) {
  const p = await run(() => apiFetch<{ id: string }>('/api/admin/products', { method: 'POST', body: payload }), { success: 'Product created — add images and opening stock next' })
  if (p) await navigateTo(`/admin/products/${p.id}`)
}
</script>

<template>
  <div>
    <UiPageHeader title="New product" :crumbs="[{ label: 'Products', to: '/admin/products' }, { label: 'New' }]" />
    <CatalogProductForm :initial="initial" :saving="pending" @submit="create" />
  </div>
</template>
