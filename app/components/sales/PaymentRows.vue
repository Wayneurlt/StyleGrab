<script lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
export interface MethodOption {
  id: string
  name: string
  type: string
  requiresReference: boolean
  requiresVerification: boolean
  isActive: boolean
  instructions?: string | null
}

export interface PaymentPayload {
  methodId: string
  amount: number
  tendered?: number | null
  reference?: string | null
}
</script>

<script setup lang="ts">
/**
 * Split-tender payment entry. Cash rows take the amount handed over and apply at most the remaining balance
 * (change is shown). Other rows default to the remaining balance until edited.
 */
const props = withDefaults(defineProps<{ methods: MethodOption[], due: number, startEmpty?: boolean }>(), { startEmpty: false })
const payments = defineModel<PaymentPayload[]>('payments', { required: true })
const { money } = useFormat()

interface Row { key: string, methodId: string, amount: number | null, auto: boolean, tendered: number | null, reference: string }
const usable = computed(() => props.methods.filter(m => m.isActive && m.type !== 'EXCHANGE_CREDIT'))
const rows = ref<Row[]>([])

const computedRows = computed(() => {
  let remaining = Math.max(0, props.due)
  return rows.value.map((r) => {
    const method = usable.value.find(m => m.id === r.methodId)
    const isCash = method?.type === 'CASH'
    let applied: number
    let change = 0
    if (isCash) {
      const t = r.tendered ?? 0
      applied = Math.min(t, remaining)
      change = Math.max(0, t - applied)
    }
    else applied = r.auto ? remaining : (r.amount ?? 0)
    remaining = Math.max(0, remaining - applied)
    return { row: r, method, isCash, applied, change }
  })
})

watch(computedRows, (list) => {
  payments.value = list.filter(x => x.applied > 0 && x.method).map(x => ({
    methodId: x.row.methodId,
    amount: x.applied,
    tendered: x.isCash ? x.row.tendered : undefined,
    reference: x.row.reference.trim() || undefined,
  }))
}, { immediate: true, deep: true })

function addRow() {
  const used = new Set(rows.value.map(r => r.methodId))
  const method = usable.value.find(m => !used.has(m.id)) ?? usable.value[0]
  rows.value.push({ key: crypto.randomUUID(), methodId: method?.id ?? '', amount: null, auto: true, tendered: null, reference: '' })
}

watch(usable, (u) => {
  if (u.length && !rows.value.length && !props.startEmpty) addRow()
}, { immediate: true })

const totalChange = computed(() => computedRows.value.reduce((s, x) => s + x.change, 0))
const missingRef = computed(() => computedRows.value.some(x => x.applied > 0 && x.method?.requiresReference && !x.row.reference.trim()))
defineExpose({ missingRef, totalChange })
</script>

<template>
  <div class="space-y-2">
    <div v-for="x in computedRows" :key="x.row.key" class="rounded-2xl border border-sand-200 bg-sand-50 p-3">
      <div class="flex items-start gap-2">
        <div class="grid grid-cols-1 flex-1 gap-2 sm:grid-cols-2">
          <div>
            <label :for="`pm-${x.row.key}`" class="sr-only">Payment method</label>
            <select :id="`pm-${x.row.key}`" v-model="x.row.methodId" class="field">
              <option v-for="m in usable" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>
          <div v-if="x.isCash">
            <label :for="`tend-${x.row.key}`" class="sr-only">Cash received</label>
            <UiMoneyInput :id="`tend-${x.row.key}`" v-model="x.row.tendered" nullable placeholder="Cash received" />
          </div>
          <div v-else>
            <label :for="`amt-${x.row.key}`" class="sr-only">Amount</label>
            <UiMoneyInput :id="`amt-${x.row.key}`" :model-value="x.row.auto ? x.applied : x.row.amount" @update:model-value="(v) => { x.row.amount = v; x.row.auto = false }" />
          </div>
          <div v-if="x.method?.requiresReference" class="sm:col-span-2">
            <label :for="`ref-${x.row.key}`" class="sr-only">Transaction reference</label>
            <input :id="`ref-${x.row.key}`" v-model="x.row.reference" class="field uppercase" :placeholder="`${x.method.name} reference (required)`" autocomplete="off" :aria-invalid="x.applied > 0 && !x.row.reference.trim() || undefined">
          </div>
        </div>
        <UiIconButton :icon="Trash2" label="Remove payment" size="sm" @click="rows = rows.filter(r => r.key !== x.row.key)" />
      </div>
      <div class="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
        <span>Applied <b class="num text-ink">{{ money(x.applied) }}</b><template v-if="x.isCash && x.change > 0"> · Change <b class="num text-accent-dark">{{ money(x.change) }}</b></template></span>
        <span v-if="x.method?.requiresVerification" class="text-caution">Recorded as awaiting confirmation until verified</span>
      </div>
    </div>
    <UiButton variant="light" size="sm" :icon="Plus" :disabled="!usable.length" @click="addRow">Add payment</UiButton>
  </div>
</template>
