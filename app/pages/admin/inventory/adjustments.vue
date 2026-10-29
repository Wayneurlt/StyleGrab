<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { ADJUSTMENT_REASON_LABELS } from '#shared/labels'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Stock adjustments' })

const route = useRoute()
const router = useRouter()
const { can, settings } = useStaff()
const { date, money } = useFormat()
const { pending, run } = useAction()
const { confirm } = useConfirm()

const statusFilter = ref(['PENDING_APPROVAL', 'APPLIED', 'REJECTED'].includes(String(route.query.status)) ? String(route.query.status) : 'all')
const page = ref(1)
watch(statusFilter, (s) => {
  page.value = 1
  router.replace({ query: { status: s === 'all' ? undefined : s } })
})
const { data, error, status, refresh } = useFetch('/api/admin/inventory/adjustments', {
  server: false,
  query: computed(() => ({ status: statusFilter.value === 'all' ? undefined : statusFilter.value, page: page.value, pageSize: 25 })),
})

// ---- create ----
interface Line { variantId: string, label: string, sku: string, available: number, qtyChange: number, unitCost: number | null }
const open = ref(route.query.new === '1')
const reason = ref<keyof typeof ADJUSTMENT_REASON_LABELS>('COUNT_DISCREPANCY')
const notes = ref('')
const lines = ref<Line[]>([])
const formError = ref<string | null>(null)
const threshold = computed(() => settings.value?.adjustmentApprovalThreshold ?? 0)
const totalAbs = computed(() => lines.value.reduce((s, l) => s + Math.abs(l.qtyChange || 0), 0))
const needsApproval = computed(() => !can('inventory.adjust.approve') && totalAbs.value > threshold.value)
const direction = computed(() => (reason.value === 'DAMAGE' || reason.value === 'LOSS' ? -1 : reason.value === 'OPENING_STOCK' ? 1 : 0))

function reset() {
  reason.value = 'COUNT_DISCREPANCY'
  notes.value = ''
  lines.value = []
  formError.value = null
}
function add(v: PickedVariant) {
  if (lines.value.some(l => l.variantId === v.variantId)) return
  lines.value.push({ variantId: v.variantId, label: `${v.productName} · ${v.title}`, sku: v.sku, available: v.available, qtyChange: direction.value === 1 ? 1 : -1, unitCost: null })
}
watch(direction, (d) => {
  if (d) for (const l of lines.value) l.qtyChange = d * Math.abs(l.qtyChange || 1)
})

async function submit() {
  formError.value = null
  if (!lines.value.length) return (formError.value = 'Add at least one item')
  if (lines.value.some(l => !Number.isInteger(l.qtyChange) || l.qtyChange === 0)) return (formError.value = 'Each line needs a non-zero whole-number change')
  if (reason.value !== 'OPENING_STOCK' && notes.value.trim().length < 3) return (formError.value = 'Explain the reason for this adjustment')
  const r = await run(() => apiFetch<{ number: string, status: string }>('/api/admin/inventory/adjustments', {
    method: 'POST',
    body: { reason: reason.value, notes: notes.value || null, items: lines.value.map(l => ({ variantId: l.variantId, qtyChange: l.qtyChange, unitCost: l.qtyChange > 0 ? l.unitCost : null })) },
  }))
  if (r) {
    useToast().success(r.status === 'APPLIED' ? `${r.number} applied` : `${r.number} submitted for approval`)
    open.value = false
    reset()
    refresh()
  }
}

async function decide(id: string, number: string, approve: boolean) {
  const res = await confirm(approve
    ? { title: `Approve ${number}?`, message: 'Stock will change immediately and the ledger will record it.', confirmLabel: 'Approve' }
    : { title: `Reject ${number}?`, requireReason: 'Reason for rejecting', confirmLabel: 'Reject', danger: true })
  if (!res) return
  if (await run(() => apiFetch(`/api/admin/inventory/adjustments/${id}/decide`, { method: 'POST', body: { approve, note: typeof res === 'string' ? res : undefined } }), { success: approve ? 'Adjustment applied' : 'Adjustment rejected' })) refresh()
}
const tone = (s: string) => (s === 'APPLIED' ? 'success' : s === 'REJECTED' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning'
</script>

<template>
  <div>
    <UiPageHeader title="Stock adjustments" subtitle="Controlled corrections for damage, loss, counts and data errors. Every change needs a reason." :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Adjustments' }]">
      <UiButton v-if="can('inventory.adjust')" :icon="Plus" @click="reset(); open = true">New adjustment</UiButton>
    </UiPageHeader>

    <section class="glass-card p-5">
      <UiTabs v-model="statusFilter" class="mb-4" label="Status" :tabs="[{ value: 'all', label: 'All' }, { value: 'PENDING_APPROVAL', label: 'Awaiting approval' }, { value: 'APPLIED', label: 'Applied' }, { value: 'REJECTED', label: 'Rejected' }]" />
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="5" height="h-16" />
      <UiEmpty v-else-if="!data?.items.length" title="No adjustments" />
      <template v-else>
        <ul class="space-y-2">
          <li v-for="a in data.items" :key="a.id" class="rounded-2xl bg-sand-50 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-medium">{{ a.number }} · {{ ADJUSTMENT_REASON_LABELS[a.reason] }} <UiBadge class="ml-1" :tone="tone(a.status)">{{ a.status === 'PENDING_APPROVAL' ? 'Awaiting approval' : a.status.toLowerCase() }}</UiBadge></p>
                <p class="mt-0.5 text-xs text-ink-muted">{{ date(a.createdAt) }} by {{ a.createdBy }}<template v-if="a.approvedBy && a.status !== 'PENDING_APPROVAL'"> · {{ a.status === 'REJECTED' ? 'rejected' : 'approved' }} by {{ a.approvedBy }}</template></p>
                <p v-if="a.notes" class="mt-1 text-sm text-ink-soft">{{ a.notes }}</p>
                <p v-if="a.decisionNote" class="mt-1 text-sm text-ink-soft">Decision: {{ a.decisionNote }}</p>
              </div>
              <div v-if="a.status === 'PENDING_APPROVAL' && can('inventory.adjust.approve')" class="flex gap-2">
                <UiButton size="sm" variant="light" @click="decide(a.id, a.number, false)">Reject</UiButton>
                <UiButton size="sm" @click="decide(a.id, a.number, true)">Approve</UiButton>
              </div>
            </div>
            <ul class="mt-3 flex flex-wrap gap-2">
              <li v-for="i in a.items" :key="i.id" class="rounded-xl bg-white/70 px-2.5 py-1 text-xs">
                {{ i.variant?.product.name }} · {{ i.variant?.title }} <b class="num" :class="i.qtyChange > 0 ? 'text-positive' : 'text-negative'">{{ i.qtyChange > 0 ? '+' : '' }}{{ i.qtyChange }}</b>
              </li>
            </ul>
          </li>
        </ul>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </section>

    <UiModal v-model:open="open" title="New stock adjustment" size="lg">
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UiField id="adj-reason" label="Reason" required>
            <select id="adj-reason" v-model="reason" class="field">
              <option v-for="(label, key) in ADJUSTMENT_REASON_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </UiField>
          <UiField id="adj-notes" label="Explanation" :required="reason !== 'OPENING_STOCK'"><input id="adj-notes" v-model="notes" class="field" maxlength="1000" placeholder="What happened?"></UiField>
        </div>
        <AdminVariantPicker include-draft placeholder="Add a product: search or scan" @select="add" />
        <div v-if="lines.length" class="overflow-x-auto">
          <table class="sg-table min-w-[560px]">
            <thead><tr><th>Item</th><th class="text-right">Available</th><th>Change (±)</th><th v-if="lines.some(l => l.qtyChange > 0)">Unit cost (for added units)</th><th /></tr></thead>
            <tbody>
              <tr v-for="(l, i) in lines" :key="l.variantId">
                <td><span class="block font-medium">{{ l.label }}</span><span class="font-mono text-xs text-ink-muted">{{ l.sku }}</span></td>
                <td class="num text-right">{{ l.available }}</td>
                <td class="w-28"><label :for="`q-${i}`" class="sr-only">Quantity change</label><input :id="`q-${i}`" v-model.number="l.qtyChange" type="number" class="field h-9" :min="direction === 1 ? 1 : undefined" :max="direction === -1 ? -1 : undefined"></td>
                <td v-if="lines.some(x => x.qtyChange > 0)" class="min-w-[150px]"><UiMoneyInput v-if="l.qtyChange > 0" :id="`c-${i}`" v-model="l.unitCost" nullable placeholder="Optional" /></td>
                <td class="text-right"><UiIconButton :icon="Trash2" label="Remove line" size="sm" @click="lines.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="rounded-xl px-3 py-2 text-sm" :class="needsApproval ? 'bg-caution-tint text-caution' : 'bg-sand-50 text-ink-soft'">
          <template v-if="can('inventory.adjust.approve')">You can approve adjustments, so this will apply immediately.</template>
          <template v-else-if="needsApproval">Total change of {{ totalAbs }} units exceeds {{ threshold }} — a manager must approve before stock changes.</template>
          <template v-else>Changes up to {{ threshold }} units in total apply immediately.</template>
        </p>
        <p v-if="lines.some(l => l.qtyChange > 0 && l.unitCost != null)" class="text-xs text-ink-muted">Added units with a cost are blended into the weighted average cost ({{ money(lines.reduce((s, l) => s + (l.qtyChange > 0 ? l.qtyChange * (l.unitCost ?? 0) : 0), 0)) }}).</p>
        <p v-if="formError" class="text-sm font-medium text-negative" role="alert">{{ formError }}</p>
      </div>
      <template #footer>
        <UiButton variant="light" @click="open = false">Cancel</UiButton>
        <UiButton :loading="pending" :disabled="!lines.length" @click="submit">{{ needsApproval ? 'Submit for approval' : 'Apply adjustment' }}</UiButton>
      </template>
    </UiModal>
  </div>
</template>
