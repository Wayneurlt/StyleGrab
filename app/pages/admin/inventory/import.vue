<script setup lang="ts">
import { Download, FileUp } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Import products' })

interface Preview {
  rowCount: number
  errors: { row: number, message: string }[]
  products: { name: string, category: string, price: number, status: string, variants: { row: number, sku: string, attributes: Record<string, string>, openingQty: number }[] }[]
}

const { money } = useFormat()
const { pending, run } = useAction()
const { confirm } = useConfirm()
const toast = useToast()

const fileName = ref('')
const csv = ref('')
const preview = ref<Preview | null>(null)
const result = ref<{ products: number, variants: number, adjustmentNumber: string | null } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (file.size > 2_000_000) {
    toast.error('The file is larger than 2 MB. Split it into smaller imports.')
    return
  }
  fileName.value = file.name
  csv.value = await file.text()
  result.value = null
  preview.value = await run(() => apiFetch<Preview>('/api/admin/inventory/import', { method: 'POST', body: { csv: csv.value, commit: false } })) ?? null
}

const totals = computed(() => ({
  products: preview.value?.products.length ?? 0,
  variants: preview.value?.products.reduce((s, p) => s + p.variants.length, 0) ?? 0,
  units: preview.value?.products.reduce((s, p) => s + p.variants.reduce((a, v) => a + v.openingQty, 0), 0) ?? 0,
}))

async function commit() {
  if (!(await confirm({ title: 'Import these products?', message: `${totals.value.products} products, ${totals.value.variants} variants and ${totals.value.units} units of opening stock will be created in one step. If anything fails, nothing is imported.`, confirmLabel: 'Import' }))) return
  const r = await run(() => apiFetch<{ products: number, variants: number, adjustmentNumber: string | null }>('/api/admin/inventory/import', { method: 'POST', body: { csv: csv.value, commit: true } }, ), { success: 'Import complete' })
  if (r) {
    result.value = r
    preview.value = null
    csv.value = ''
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Import products" subtitle="Bring in an existing catalogue with opening stock from a CSV file." :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Import' }]">
      <a class="inline-flex h-11 items-center gap-2 rounded-full border border-sand-200 bg-white/90 px-5 text-sm font-medium text-ink shadow-lift hover:bg-white" href="/api/admin/inventory/import-template" download><Download class="size-4" aria-hidden="true" />Template</a>
    </UiPageHeader>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_2fr]">
      <UiCard title="How it works">
        <ol class="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
          <li>One row per variant. Rows with the same <code>category_code</code> and <code>product_name</code> become one product.</li>
          <li>Required columns: <code>category_code</code>, <code>product_name</code>, <code>price</code>. Prices and costs are in major units, e.g. <code>1500.00</code>.</li>
          <li>Variant attributes go in <code>attr_&lt;code&gt;</code> columns (e.g. <code>attr_color</code>, <code>attr_size</code>) and must match the category's attributes.</li>
          <li>Leave <code>sku</code> blank to generate one. <code>opening_qty</code> is posted as an opening-stock adjustment at <code>cost_price</code>.</li>
          <li>You'll see a preview with every problem before anything is saved. Up to 1,000 rows per file.</li>
        </ol>
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="sr-only" aria-label="Choose CSV file" @change="onFile">
        <UiButton class="mt-5" block :icon="FileUp" :loading="pending && !preview" @click="fileInput?.click()">{{ fileName ? 'Choose another file' : 'Choose CSV file' }}</UiButton>
        <p v-if="fileName" class="mt-2 text-center text-xs text-ink-muted">{{ fileName }}</p>
      </UiCard>

      <section class="glass-card p-5">
        <div v-if="result" class="rounded-2xl bg-positive-tint p-5 text-positive">
          <p class="text-lg font-semibold">Imported {{ result.products }} products and {{ result.variants }} variants.</p>
          <p v-if="result.adjustmentNumber" class="mt-1 text-sm">Opening stock was recorded as adjustment {{ result.adjustmentNumber }}.</p>
          <div class="mt-4 flex gap-2">
            <UiButton size="sm" to="/admin/products">View products</UiButton>
            <UiButton size="sm" variant="light" to="/admin/inventory">View stock</UiButton>
          </div>
        </div>
        <UiEmpty v-else-if="!preview" title="No file loaded" message="Download the template, fill it in, then choose the file to preview it." />
        <template v-else>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm">{{ preview.rowCount }} rows · {{ totals.products }} products · {{ totals.variants }} variants · {{ totals.units }} opening units</p>
            <UiButton :disabled="preview.errors.length > 0" :loading="pending" @click="commit">Import</UiButton>
          </div>
          <div v-if="preview.errors.length" class="mb-4 rounded-2xl bg-negative-tint p-4" role="alert">
            <p class="font-medium text-negative">{{ preview.errors.length }} problem{{ preview.errors.length === 1 ? '' : 's' }} to fix before importing</p>
            <ul class="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm text-ink-soft">
              <li v-for="(e, i) in preview.errors" :key="i"><b>Row {{ e.row }}:</b> {{ e.message }}</li>
            </ul>
          </div>
          <ul class="space-y-2">
            <li v-for="p in preview.products" :key="`${p.category}-${p.name}`" class="rounded-2xl bg-sand-50 p-3">
              <p class="font-medium">{{ p.name }} <span class="text-xs text-ink-muted">· {{ p.category }} · {{ money(p.price) }} · {{ p.status.toLowerCase() }}</span></p>
              <ul class="mt-2 flex flex-wrap gap-2">
                <li v-for="v in p.variants" :key="v.row" class="rounded-xl bg-white/80 px-2.5 py-1 text-xs">
                  <span class="text-ink-muted">#{{ v.row }}</span> {{ Object.values(v.attributes).join(' / ') || 'Default' }} · <span class="font-mono">{{ v.sku }}</span> · <b>{{ v.openingQty }}</b> units
                </li>
              </ul>
            </li>
          </ul>
        </template>
      </section>
    </div>
  </div>
</template>
