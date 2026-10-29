<script setup lang="ts">
import { Plus, Sparkles, Trash2, Undo2 } from 'lucide-vue-next'

export interface AttrDef { code: string, name: string, options: string[], isRequired: boolean }
export interface VariantRow {
  key: string
  id?: string
  sku: string
  barcode: string
  attributes: Record<string, string>
  price: number | null
  costPrice: number | null
  lowStockThreshold: number | null
  isArchived: boolean
  skuStatus?: 'checking' | 'ok' | 'taken' | null
}
export interface ProductFormValue {
  name: string
  description: string
  categoryId: string
  brand: string
  price: number
  costPrice: number | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  isFeatured: boolean
  seoTitle: string
  seoDescription: string
  variants: VariantRow[]
}

const props = defineProps<{ initial: ProductFormValue, productId?: string, saving: boolean }>()
const emit = defineEmits<{ submit: [payload: Record<string, unknown>] }>()
const { can } = useStaff()
const canPrice = computed(() => can('catalog.price'))
const isEdit = computed(() => !!props.productId)

const form = reactive<ProductFormValue>(JSON.parse(JSON.stringify(props.initial)))
const errors = ref<string | null>(null)

const { data: categories } = useFetch('/api/admin/categories', { server: false })
const categoryOptions = computed(() => {
  const list = categories.value ?? []
  const byParent = (pid: string | null): { id: string, label: string }[] =>
    list.filter(c => c.parentId === pid).flatMap(c => [{ id: c.id, label: pid ? `— ${c.name}` : c.name }, ...byParent(c.id).map(x => ({ ...x, label: `  ${x.label}` }))])
  return byParent(null)
})

const attrs = ref<AttrDef[]>([])
const attrsLoading = ref(false)
watch(() => form.categoryId, async (id) => {
  if (!id) {
    attrs.value = []
    return
  }
  attrsLoading.value = true
  try {
    attrs.value = await apiFetch<AttrDef[]>(`/api/admin/categories/${id}/attributes`)
  }
  catch (e) {
    useToast().error(apiError(e))
  }
  finally {
    attrsLoading.value = false
  }
}, { immediate: true })

let seq = 0
function newRow(attributes: Record<string, string> = {}): VariantRow {
  return { key: `n${++seq}`, sku: '', barcode: '', attributes, price: null, costPrice: null, lowStockThreshold: null, isArchived: false }
}
function addVariant() {
  form.variants.push(newRow())
}
function removeVariant(v: VariantRow) {
  if (v.id) v.isArchived = !v.isArchived
  else form.variants = form.variants.filter(x => x.key !== v.key)
}

/** Fill in every combination of attributes that have predefined options, skipping existing ones. */
function generateCombinations() {
  const withOptions = attrs.value.filter(a => a.options.length)
  if (!withOptions.length) {
    useToast().info('No attribute in this category has predefined options to combine.')
    return
  }
  let combos: Record<string, string>[] = [{}]
  for (const a of withOptions) combos = combos.flatMap(c => a.options.map(o => ({ ...c, [a.code]: o })))
  if (combos.length > 200) {
    useToast().error(`That would create ${combos.length} variants — narrow the options first.`)
    return
  }
  const sig = (r: Record<string, string>) => withOptions.map(a => r[a.code] ?? '').join('|')
  const existing = new Set(form.variants.filter(v => !v.isArchived).map(v => sig(v.attributes)))
  // Reuse a single blank row if that's all there is.
  if (form.variants.length === 1 && !form.variants[0]!.id && !Object.values(form.variants[0]!.attributes).some(Boolean)) form.variants = []
  let added = 0
  for (const c of combos) {
    if (existing.has(sig(c))) continue
    form.variants.push(newRow({ ...c }))
    added++
  }
  useToast().success(added ? `Added ${added} variant${added === 1 ? '' : 's'}` : 'All combinations already exist')
}

const skuTimers = new Map<string, ReturnType<typeof setTimeout>>()
function checkSku(v: VariantRow) {
  clearTimeout(skuTimers.get(v.key))
  const sku = v.sku.trim()
  if (!sku) {
    v.skuStatus = null
    return
  }
  v.skuStatus = 'checking'
  skuTimers.set(v.key, setTimeout(async () => {
    const dupInForm = form.variants.some(o => o.key !== v.key && o.sku.trim().toUpperCase() === sku.toUpperCase())
    try {
      const r = await apiFetch<{ available: boolean }>('/api/admin/products/sku-check', { query: { sku, exclude: v.id } })
      v.skuStatus = r.available && !dupInForm ? 'ok' : 'taken'
    }
    catch {
      v.skuStatus = null
    }
  }, 350))
}

function validate(): string | null {
  if (!form.name.trim()) return 'Product name is required'
  if (!form.categoryId) return 'Choose a category'
  const active = form.variants.filter(v => !v.isArchived)
  if (!active.length) return 'A product needs at least one active variant'
  for (const v of active) {
    for (const a of attrs.value) if (a.isRequired && !v.attributes[a.code]?.trim()) return `${a.name} is required for every variant`
  }
  if (form.variants.some(v => v.skuStatus === 'taken')) return 'One or more SKUs are already in use'
  return null
}

function submit() {
  errors.value = validate()
  if (errors.value) return
  const allowed = new Set(attrs.value.map(a => a.code))
  emit('submit', {
    name: form.name.trim(),
    description: form.description,
    categoryId: form.categoryId,
    brand: form.brand.trim() || null,
    price: form.price,
    costPrice: canPrice.value ? form.costPrice : (props.initial.costPrice ?? null),
    status: form.status,
    isFeatured: form.isFeatured,
    seoTitle: form.seoTitle.trim() || null,
    seoDescription: form.seoDescription.trim() || null,
    variants: form.variants.map(v => ({
      ...(v.id ? { id: v.id } : {}),
      sku: v.sku.trim() || null,
      barcode: v.barcode.trim() || null,
      attributes: Object.fromEntries(Object.entries(v.attributes).filter(([k, val]) => allowed.has(k) && val?.trim())),
      price: v.price,
      costPrice: v.costPrice,
      isArchived: v.isArchived,
      lowStockThreshold: v.lowStockThreshold,
    })),
  })
}
</script>

<template>
  <form class="space-y-5" novalidate @submit.prevent="submit">
    <div class="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <UiCard title="Details">
        <div class="grid gap-4 sm:grid-cols-2">
          <UiField id="p-name" label="Product name" required class="sm:col-span-2">
            <input id="p-name" v-model="form.name" class="field" maxlength="150" required>
          </UiField>
          <UiField id="p-category" label="Category" required>
            <select id="p-category" v-model="form.categoryId" class="field">
              <option value="" disabled>Choose a category</option>
              <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </UiField>
          <UiField id="p-brand" label="Brand">
            <input id="p-brand" v-model="form.brand" class="field" maxlength="80">
          </UiField>
          <UiField id="p-desc" label="Description" class="sm:col-span-2">
            <textarea id="p-desc" v-model="form.description" rows="5" class="field" maxlength="10000" />
          </UiField>
        </div>
      </UiCard>

      <div class="space-y-5">
        <UiCard title="Pricing">
          <div class="space-y-4">
            <UiField id="p-price" label="Selling price" :hint="!canPrice && isEdit ? 'You need price permission to change prices' : 'Variants inherit this unless overridden'">
              <UiMoneyInput id="p-price" :model-value="form.price" :disabled="!canPrice && isEdit" @update:model-value="(v: number | null) => (form.price = v ?? 0)" />
            </UiField>
            <UiField v-if="canPrice" id="p-cost" label="Unit cost (estimate)" hint="Used as the opening average cost until stock is received">
              <UiMoneyInput id="p-cost" v-model="form.costPrice" nullable />
            </UiField>
          </div>
        </UiCard>
        <UiCard title="Visibility">
          <div class="space-y-4">
            <UiField id="p-status" label="Status">
              <select id="p-status" v-model="form.status" class="field">
                <option value="DRAFT">Draft — hidden from store and POS</option>
                <option value="ACTIVE">Active — on sale</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </UiField>
            <label class="flex items-center gap-2 text-sm"><input v-model="form.isFeatured" type="checkbox" class="size-4 accent-ink">Feature on the storefront home page</label>
          </div>
        </UiCard>
      </div>
    </div>

    <UiCard title="Variants" subtitle="Each variant is stocked and sold separately. Leave SKU blank to generate one.">
      <template #actions>
        <UiButton variant="light" size="sm" :icon="Sparkles" :disabled="!attrs.length" @click="generateCombinations">Generate combinations</UiButton>
        <UiButton variant="light" size="sm" :icon="Plus" @click="addVariant">Add variant</UiButton>
      </template>
      <p v-if="!form.categoryId" class="text-sm text-ink-muted">Choose a category to see its variant attributes.</p>
      <p v-else-if="attrsLoading" class="text-sm text-ink-muted">Loading attributes…</p>
      <div v-else class="overflow-x-auto">
        <table class="sg-table min-w-[900px]">
          <thead>
            <tr>
              <th v-for="a in attrs" :key="a.code">{{ a.name }}<span v-if="a.isRequired" class="text-negative"> *</span></th>
              <th>SKU</th>
              <th>Barcode</th>
              <th v-if="canPrice">Price override</th>
              <th v-if="canPrice">Cost</th>
              <th>Low at</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, i) in form.variants" :key="v.key" :class="v.isArchived ? 'opacity-50' : ''">
              <td v-for="a in attrs" :key="a.code" class="min-w-[120px]">
                <label :for="`v${i}-${a.code}`" class="sr-only">{{ a.name }} for variant {{ i + 1 }}</label>
                <select v-if="a.options.length" :id="`v${i}-${a.code}`" v-model="v.attributes[a.code]" class="field h-9" :disabled="v.isArchived">
                  <option :value="undefined">—</option>
                  <option v-for="o in a.options" :key="o" :value="o">{{ o }}</option>
                  <option v-if="v.attributes[a.code] && !a.options.includes(v.attributes[a.code]!)" :value="v.attributes[a.code]">{{ v.attributes[a.code] }} (legacy)</option>
                </select>
                <input v-else :id="`v${i}-${a.code}`" v-model="v.attributes[a.code]" class="field h-9" maxlength="60" :disabled="v.isArchived">
              </td>
              <td class="min-w-[170px]">
                <label :for="`v${i}-sku`" class="sr-only">SKU for variant {{ i + 1 }}</label>
                <input :id="`v${i}-sku`" v-model="v.sku" class="field h-9 font-mono text-xs uppercase" placeholder="Auto" maxlength="60" :disabled="v.isArchived" @input="checkSku(v)">
                <p v-if="v.skuStatus === 'taken'" class="mt-1 text-[11px] text-negative">Already in use</p>
                <p v-else-if="v.skuStatus === 'checking'" class="mt-1 text-[11px] text-ink-muted">Checking…</p>
              </td>
              <td class="min-w-[130px]">
                <label :for="`v${i}-bc`" class="sr-only">Barcode for variant {{ i + 1 }}</label>
                <input :id="`v${i}-bc`" v-model="v.barcode" class="field h-9" maxlength="60" :disabled="v.isArchived">
              </td>
              <td v-if="canPrice" class="min-w-[150px]"><UiMoneyInput :id="`v${i}-price`" v-model="v.price" nullable placeholder="Inherit" :disabled="v.isArchived" /></td>
              <td v-if="canPrice" class="min-w-[150px]"><UiMoneyInput :id="`v${i}-cost`" v-model="v.costPrice" nullable placeholder="—" :disabled="v.isArchived" /></td>
              <td class="w-24">
                <label :for="`v${i}-low`" class="sr-only">Low stock threshold for variant {{ i + 1 }}</label>
                <input :id="`v${i}-low`" v-model.number="v.lowStockThreshold" type="number" min="0" class="field h-9" placeholder="3" :disabled="v.isArchived">
              </td>
              <td class="text-right">
                <UiIconButton :icon="v.isArchived ? Undo2 : Trash2" :label="v.isArchived ? 'Restore variant' : v.id ? 'Archive variant' : 'Remove variant'" size="sm" @click="removeVariant(v)" />
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="form.variants.some(v => v.isArchived)" class="mt-2 text-xs text-ink-muted">Archived variants keep their sales history and are hidden from the store and POS.</p>
      </div>
    </UiCard>

    <UiCard title="Search engine listing">
      <div class="grid gap-4 sm:grid-cols-2">
        <UiField id="p-seo-title" label="Page title" :hint="`${form.seoTitle.length}/70`">
          <input id="p-seo-title" v-model="form.seoTitle" class="field" maxlength="70" :placeholder="form.name">
        </UiField>
        <UiField id="p-seo-desc" label="Meta description" :hint="`${form.seoDescription.length}/170`">
          <input id="p-seo-desc" v-model="form.seoDescription" class="field" maxlength="170">
        </UiField>
      </div>
    </UiCard>

    <div class="flex flex-wrap items-center justify-end gap-3">
      <p v-if="errors" class="mr-auto text-sm font-medium text-negative" role="alert">{{ errors }}</p>
      <UiButton variant="light" to="/admin/products">Cancel</UiButton>
      <UiButton type="submit" :loading="saving">{{ isEdit ? 'Save changes' : 'Create product' }}</UiButton>
    </div>
  </form>
</template>
