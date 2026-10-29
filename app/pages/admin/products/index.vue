<script setup lang="ts">
import { Plus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Products' })

const { can } = useStaff()
const { money, date } = useFormat()
const { run } = useAction()
const { confirm } = useConfirm()

const q = ref('')
const categoryId = ref('')
const status = ref('')
const stock = ref('')
const page = ref(1)
watch([q, categoryId, status, stock], () => (page.value = 1))

const { data: categories } = useFetch('/api/admin/categories', { server: false })
const { data, error, status: loadState, refresh } = useFetch('/api/admin/products', {
  server: false,
  query: computed(() => ({ q: q.value || undefined, categoryId: categoryId.value || undefined, status: status.value || undefined, stock: stock.value || undefined, page: page.value, pageSize: 25 })),
})

async function setStatus(id: string, name: string, s: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') {
  if (s === 'ARCHIVED' && !(await confirm({ title: `Archive ${name}?`, message: 'It will be hidden from the store and POS. History is kept.', confirmLabel: 'Archive', danger: true }))) return
  const ok = await run(() => apiFetch(`/api/admin/products/${id}/status`, { method: 'POST', body: { status: s } }), { success: s === 'ACTIVE' ? 'Published' : s === 'ARCHIVED' ? 'Archived' : 'Unpublished' })
  if (ok) refresh()
}
const statusTone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'ARCHIVED' ? 'danger' : 'neutral') as 'success' | 'danger' | 'neutral'
</script>

<template>
  <div>
    <UiPageHeader title="Products" subtitle="Your catalogue — every variant is tracked separately in inventory." :crumbs="[{ label: 'Catalogue' }, { label: 'Products' }]">
      <UiButton v-if="can('catalog.manage')" :icon="Plus" to="/admin/products/new">New product</UiButton>
    </UiPageHeader>

    <section class="glass-card p-5">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <UiSearchInput v-model="q" placeholder="Search name, SKU, barcode…" class="w-full sm:w-72" />
        <label class="sr-only" for="f-cat">Category</label>
        <select id="f-cat" v-model="categoryId" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All categories</option>
          <option v-for="c in categories ?? []" :key="c.id" :value="c.id">{{ c.parentId ? '— ' : '' }}{{ c.name }}</option>
        </select>
        <label class="sr-only" for="f-status">Status</label>
        <select id="f-status" v-model="status" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">Draft &amp; active</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <label class="sr-only" for="f-stock">Stock</label>
        <select id="f-stock" v-model="stock" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </div>

      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="loadState === 'pending' && !data" :rows="6" height="h-14" />
      <UiEmpty v-else-if="!data?.items.length" title="No products found" :message="q || categoryId || status || stock ? 'Try different filters.' : 'Create your first product to start selling.'">
        <UiButton v-if="can('catalog.manage') && !q" to="/admin/products/new" size="sm" :icon="Plus">New product</UiButton>
      </UiEmpty>
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[820px]">
            <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Variants</th><th>Available</th><th>Status</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <tr v-for="p in data.items" :key="p.id">
                <td>
                  <NuxtLink :to="`/admin/products/${p.id}`" class="flex items-center gap-3">
                    <UiProductImage :image-key="p.imageKey" :alt="p.name" class="size-11 shrink-0" rounded="rounded-xl" />
                    <span class="min-w-0">
                      <span class="block truncate font-medium hover:underline">{{ p.name }}</span>
                      <span class="block text-xs text-ink-muted">{{ p.code }}<template v-if="p.isFeatured"> · Featured</template></span>
                    </span>
                  </NuxtLink>
                </td>
                <td class="text-ink-soft">{{ p.category }}</td>
                <td class="num">{{ money(p.price) }}</td>
                <td class="num">{{ p.variantCount }}</td>
                <td><UiBadge :tone="p.available <= 0 ? 'danger' : p.available <= 3 ? 'warning' : 'success'">{{ p.available }} of {{ p.onHand }}</UiBadge></td>
                <td><UiBadge :tone="statusTone(p.status)">{{ p.status.toLowerCase() }}</UiBadge></td>
                <td class="whitespace-nowrap text-ink-soft">{{ date(p.updatedAt, false) }}</td>
                <td class="whitespace-nowrap text-right">
                  <template v-if="can('catalog.manage')">
                    <UiButton v-if="p.status !== 'ACTIVE'" size="sm" variant="light" @click="setStatus(p.id, p.name, 'ACTIVE')">Publish</UiButton>
                    <UiButton v-else size="sm" variant="ghost" @click="setStatus(p.id, p.name, 'DRAFT')">Unpublish</UiButton>
                    <UiButton v-if="p.status !== 'ARCHIVED'" size="sm" variant="ghost" @click="setStatus(p.id, p.name, 'ARCHIVED')">Archive</UiButton>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </section>
  </div>
</template>
