<script setup lang="ts">
import type { MethodOption } from './PaymentRows.vue'

/** Record one payment received outside StyleGrab against an order. */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ orderId: string, orderNumber: string, balance: number, methods: MethodOption[] }>()
const emit = defineEmits<{ recorded: [] }>()
const { money } = useFormat()
const { canAny } = useStaff()

const usable = computed(() => props.methods.filter(m => m.isActive && m.type !== 'EXCHANGE_CREDIT'))
const form = reactive({ methodId: '', amount: 0 as number | null, tendered: null as number | null, reference: '', notes: '' })
const key = ref(newKey())
const shiftId = ref<string | null>(null)
const method = computed(() => usable.value.find(m => m.id === form.methodId))
const isCash = computed(() => method.value?.type === 'CASH')
const applied = computed(() => (isCash.value ? Math.min(form.tendered ?? 0, props.balance) : form.amount ?? 0))
const change = computed(() => (isCash.value ? Math.max(0, (form.tendered ?? 0) - applied.value) : 0))

watch(open, async (v) => {
  if (!v) return
  key.value = newKey()
  Object.assign(form, { methodId: usable.value[0]?.id ?? '', amount: props.balance, tendered: null, reference: '', notes: '' })
  shiftId.value = null
  if (canAny('pos.sell', 'shifts.manage')) {
    const s = await apiFetch<{ shift: { id: string } } | null>('/api/admin/shifts/current').catch(() => null)
    shiftId.value = s?.shift.id ?? null
  }
})

const { pending, run } = useAction()
async function submit() {
  const r = await run(() => apiFetch(`/api/admin/orders/${props.orderId}/payments`, {
    method: 'POST',
    body: {
      methodId: form.methodId,
      amount: applied.value,
      tendered: isCash.value ? form.tendered : null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
      idempotencyKey: key.value,
      shiftId: isCash.value ? shiftId.value : null,
    },
  }), { success: 'Payment recorded' })
  if (r) {
    open.value = false
    emit('recorded')
  }
}
const valid = computed(() => !!method.value && applied.value > 0 && applied.value <= props.balance && (!method.value.requiresReference || !!form.reference.trim()))
</script>

<template>
  <UiModal v-model:open="open" :title="`Record payment · ${orderNumber}`" :description="`Outstanding balance ${money(balance)}`" size="sm">
    <form id="pay-form" class="space-y-3" @submit.prevent="valid && submit()">
      <UiField id="pd-method" label="Method" required>
        <select id="pd-method" v-model="form.methodId" class="field">
          <option v-for="m in usable" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </UiField>
      <UiField v-if="isCash" id="pd-tendered" label="Cash received" required :hint="change ? `Change due ${money(change)}` : undefined">
        <UiMoneyInput id="pd-tendered" v-model="form.tendered" nullable />
      </UiField>
      <UiField v-else id="pd-amount" label="Amount" required :error="(form.amount ?? 0) > balance ? 'More than the outstanding balance' : null">
        <UiMoneyInput id="pd-amount" v-model="form.amount" />
      </UiField>
      <UiField v-if="method?.requiresReference || !isCash" id="pd-ref" :label="method?.requiresReference ? 'Transaction reference' : 'Reference (optional)'" :required="method?.requiresReference">
        <input id="pd-ref" v-model="form.reference" class="field uppercase" maxlength="60" autocomplete="off">
      </UiField>
      <UiField id="pd-notes" label="Notes"><input id="pd-notes" v-model="form.notes" class="field" maxlength="500"></UiField>
      <p v-if="method?.requiresVerification" class="rounded-xl bg-caution-tint px-3 py-2 text-xs text-caution">{{ method.name }} payments are saved as “awaiting confirmation” until someone with permission verifies them against the statement.</p>
      <p v-if="isCash && !shiftId" class="text-xs text-ink-muted">No open shift of yours — this cash will not be counted in a drawer reconciliation.</p>
    </form>
    <template #footer>
      <UiButton variant="light" @click="open = false">Cancel</UiButton>
      <UiButton type="submit" form="pay-form" :loading="pending" :disabled="!valid">Record {{ money(applied) }}</UiButton>
    </template>
  </UiModal>
</template>
