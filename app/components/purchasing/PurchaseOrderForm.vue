<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'

export interface PoLine { variantId: string, label: string, sku: string, orderedQty: number, unitCost: number | null }
export interface PoFormValue { supplierId: string, expectedAt: string, notes: string, items: PoLine[] }

const props = defineProps<{ initial?: PoFormValue, submitLabel: string, pending?: boolean }>()
const emit = defineEmits<{ submit: [payload: { supplierId: string, expectedAt: string | null, notes: string | null, items: { variantId: string, orderedQty: number, unitCost: number }[] }] }>()
const { money, currency } = useFormat()

const form = reactive<PoFormValue>(props.initial ? structuredClone(toRaw(props.initial)) : { supplierId: '', expectedAt: '', notes: '', items: [] })
const error = ref<string | null>(null)

const { data: suppliers } = useFetch('/api/admin/suppliers', { query: { pageSize: 100 }, server: false })
const activeSuppliers = computed(() => (suppliers.value?.items ?? []).filter(s => s.isActive || s.id === form.supplierId))

function add(v: PickedVariant) {
  const existing = form.items.find(i => i.variantId === v.variantId)
  if (existing) {
    existing.orderedQty += 1
    return
  }
  form.items.push({ variantId: v.variantId, label: `${v.productName} · ${v.title}`, sku: v.sku, orderedQty: 1, unitCost: null })
}

const total = computed(() => form.items.reduce((s, i) => s + i.orderedQty * (i.unitCost ?? 0), 0))

function submit() {
  error.value = null
  if (!form.supplierId) return (error.value = 'Choose a supplier')
  if (!form.items.length) return (error.value = 'Add at least one item')
  if (form.items.some(i => !Number.isInteger(i.orderedQty) || i.orderedQty < 1)) return (error.value = 'Ordered quantities must be whole numbers of at least 1')
  if (form.items.some(i => i.unitCost == null)) return (error.value = 'Enter a unit cost for every line')
  emit('submit', {
    supplierId: form.supplierId,
    expectedAt: form.expectedAt || null,
    notes: form.notes.trim() || null,
    items: form.items.map(i => ({ variantId: i.variantId, orderedQty: i.orderedQty, unitCost: i.unitCost! })),
  })
}
</script>

<template>
  <form class="space-y-5" novalidate @submit.prevent="submit">
    <UiCard title="Details">
      <div class="grid gap-4 md:grid-cols-3">
        <UiField id="po-supplier" label="Supplier" required>
          <select id="po-supplier" v-model="form.supplierId" class="field">
            <option value="" disabled>Choose a supplier</option>
            <option v-for="s in activeSuppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </UiField>
        <UiField id="po-expected" label="Expected delivery">
          <input id="po-expected" v-model="form.expectedAt" type="date" class="field">
        </UiField>
        <UiField id="po-notes" label="Notes" class="md:col-span-1">
          <input id="po-notes" v-model="form.notes" type="text" maxlength="2000" class="field" placeholder="Optional">
        </UiField>
      </div>
      <p v-if="suppliers && !activeSuppliers.length" class="mt-3 text-sm text-ink-muted">
        No active suppliers yet. <NuxtLink to="/admin/purchasing/suppliers" class="font-medium underline">Add a supplier</NuxtLink> first.
      </p>
    </UiCard>

    <UiCard title="Items" :subtitle="`${form.items.length} lines · ${money(total)}`">
      <AdminVariantPicker include-draft :show-stock="false" placeholder="Add a product by name, SKU or barcode" @select="add" />
      <div v-if="form.items.length" class="mt-4 overflow-x-auto">
        <table class="sg-table min-w-[620px]">
          <thead><tr><th>Item</th><th class="w-28">Quantity</th><th class="w-48">Unit cost</th><th class="text-right">Line total</th><th><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in form.items" :key="l.variantId">
              <td><p class="font-medium">{{ l.label }}</p><p class="text-xs text-ink-muted">{{ l.sku }}</p></td>
              <td>
                <label :for="`po-qty-${i}`" class="sr-only">Quantity for {{ l.label }}</label>
                <input :id="`po-qty-${i}`" v-model.number="l.orderedQty" type="number" min="1" step="1" class="field num h-10">
              </td>
              <td>
                <label :for="`po-cost-${i}`" class="sr-only">Unit cost for {{ l.label }}</label>
                <UiMoneyInput :id="`po-cost-${i}`" v-model="l.unitCost" nullable :currency="currency" />
              </td>
              <td class="num text-right">{{ money(l.orderedQty * (l.unitCost ?? 0)) }}</td>
              <td class="text-right"><UiIconButton :icon="Trash2" :label="`Remove ${l.label}`" size="sm" @click="form.items.splice(i, 1)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiEmpty v-else title="No items yet" message="Search above to add the variants you are ordering." />
    </UiCard>

    <p v-if="error" class="rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative" role="alert">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <UiButton variant="light" to="/admin/purchasing">Cancel</UiButton>
      <UiButton type="submit" :loading="pending">{{ submitLabel }}</UiButton>
    </div>
  </form>
</template>
