<script setup lang="ts">
import { Lock, Printer } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Shift' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { money, date } = useFormat()
const { can } = useStaff()
const { data, status, error, refresh } = useFetch(() => `/api/admin/shifts/${id.value}`, { server: false })
const isOpen = computed(() => data.value?.shift.status === 'OPEN')
const users = computed<Record<string, string>>(() => (data.value && 'users' in data.value ? data.value.users : {}))

const cash = reactive({ type: 'PAY_OUT' as 'PAY_IN' | 'PAY_OUT', amount: 0 as number | null, reason: '' })
const { pending: cashPending, run: runCash } = useAction()
async function addCash() {
  const r = await runCash(() => apiFetch(`/api/admin/shifts/${id.value}/cash`, { method: 'POST', body: { type: cash.type, amount: cash.amount ?? 0, reason: cash.reason } }), { success: cash.type === 'PAY_IN' ? 'Cash pay-in recorded' : 'Cash pay-out recorded' })
  if (r) {
    cash.amount = 0
    cash.reason = ''
    refresh()
  }
}

const closing = ref(false)
const counted = ref<number | null>(null)
const closeNotes = ref('')
const difference = computed(() => (counted.value == null || !data.value ? null : counted.value - data.value.expectedCash))
const { pending: closePending, run: runClose } = useAction()
const { confirm } = useConfirm()
function printPage() {
  window.print()
}
async function closeShift() {
  if (counted.value == null) return
  const ok = await confirm({ title: 'Close this shift?', message: `Counted ${money(counted.value)} against ${money(data.value!.expectedCash)} expected. A closed shift cannot be reopened.`, confirmLabel: 'Close shift' })
  if (!ok) return
  const r = await runClose(() => apiFetch(`/api/admin/shifts/${id.value}/close`, { method: 'POST', body: { countedCash: counted.value!, notes: closeNotes.value.trim() || null } }), { success: 'Shift closed' })
  if (r) {
    closing.value = false
    refresh()
  }
}
</script>

<template>
  <div>
    <UiPageHeader :title="data ? `${data.shift.register.name} shift` : 'Shift'" :subtitle="data ? `Opened ${date(data.shift.openedAt)} by ${users[data.shift.openedById] ?? '—'}` : undefined" :crumbs="[{ label: 'POS', to: '/admin/pos' }, { label: 'Shifts', to: '/admin/pos/shifts' }, { label: 'Shift' }]">
      <UiButton variant="light" :icon="Printer" class="no-print" @click="printPage">Print</UiButton>
      <UiButton v-if="isOpen && can('shifts.manage')" :icon="Lock" class="no-print" @click="closing = true">Close shift</UiButton>
    </UiPageHeader>

    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !data" :rows="3" height="h-32" />
    <div v-else-if="data" class="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div class="space-y-5">
        <section class="glass-card p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-[15px] font-medium">Cash drawer</h2>
            <UiBadge :tone="isOpen ? 'accent' : 'neutral'">{{ isOpen ? 'Open' : `Closed ${date(data.shift.closedAt)}` }}</UiBadge>
          </div>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-ink-soft">Opening float</dt><dd class="num">{{ money(data.shift.openingCash) }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-soft">+ Cash sales (confirmed)</dt><dd class="num">{{ money(data.cashSales) }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-soft">+ Pay-ins</dt><dd class="num">{{ money(data.payIns) }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-soft">− Cash refunds</dt><dd class="num">{{ money(data.cashRefunds) }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-soft">− Pay-outs</dt><dd class="num">{{ money(data.payOuts) }}</dd></div>
            <div class="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold"><dt>Expected in drawer</dt><dd class="num">{{ money(data.expectedCash) }}</dd></div>
            <template v-if="!isOpen">
              <div class="flex justify-between"><dt class="text-ink-soft">Counted</dt><dd class="num">{{ money(data.shift.countedCash) }}</dd></div>
              <div class="flex justify-between font-medium" :class="(data.shift.difference ?? 0) < 0 ? 'text-negative' : (data.shift.difference ?? 0) > 0 ? 'text-caution' : 'text-positive'"><dt>Difference</dt><dd class="num">{{ money(data.shift.difference) }}</dd></div>
              <p v-if="data.shift.closingNotes" class="rounded-xl bg-sand-50 p-3 text-ink-soft">{{ data.shift.closingNotes }}</p>
              <p class="text-xs text-ink-muted">Closed by {{ users[data.shift.closedById ?? ''] ?? '—' }}. Expected figure frozen at close: {{ money(data.shift.expectedCash) }}.</p>
            </template>
          </dl>
          <p class="mt-3 text-xs text-ink-muted">{{ data.salesCount }} completed sales linked to this shift.</p>
        </section>

        <section class="glass-card p-5">
          <h2 class="mb-1 text-[15px] font-medium">Non-cash payments</h2>
          <p class="mb-3 text-xs text-ink-muted">Recorded during this shift. These never affect the cash drawer.</p>
          <UiEmpty v-if="!data.byMethod.filter(m => m.type !== 'CASH').length" title="None recorded" />
          <table v-else class="sg-table">
            <thead><tr><th>Method</th><th class="text-right">Confirmed</th><th class="text-right">Awaiting</th><th class="text-right">Refunded</th></tr></thead>
            <tbody>
              <tr v-for="m in data.byMethod.filter(x => x.type !== 'CASH')" :key="m.methodId">
                <td>{{ m.name }}</td><td class="num text-right">{{ money(m.confirmed) }}</td><td class="num text-right">{{ money(m.pending) }}</td><td class="num text-right">{{ money(m.refunded) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="space-y-5">
        <section v-if="isOpen && can('shifts.manage')" class="glass-card no-print p-5">
          <h2 class="mb-3 text-[15px] font-medium">Cash in / out</h2>
          <form class="space-y-3" @submit.prevent="addCash">
            <UiTabs v-model="cash.type" :tabs="[{ value: 'PAY_OUT', label: 'Pay out' }, { value: 'PAY_IN', label: 'Pay in' }]" label="Movement type" />
            <UiField id="cm-amount" label="Amount" required><UiMoneyInput id="cm-amount" v-model="cash.amount" /></UiField>
            <UiField id="cm-reason" label="Reason" required><input id="cm-reason" v-model="cash.reason" class="field" maxlength="300" placeholder="e.g. Float top-up, courier fee"></UiField>
            <UiButton type="submit" :loading="cashPending" :disabled="!cash.amount || cash.reason.trim().length < 2">Record</UiButton>
          </form>
        </section>
        <section class="glass-card p-5">
          <h2 class="mb-3 text-[15px] font-medium">Cash movements</h2>
          <UiEmpty v-if="!data.shift.cashMovements.length" title="No pay-ins or pay-outs" />
          <ul v-else class="space-y-2">
            <li v-for="m in data.shift.cashMovements" :key="m.id" class="flex justify-between gap-3 rounded-xl bg-sand-50 px-3 py-2 text-sm">
              <span><b>{{ m.type === 'PAY_IN' ? 'Pay in' : 'Pay out' }}</b> · {{ m.reason }}<br><span class="text-xs text-ink-muted">{{ date(m.createdAt) }} · {{ users[m.recordedById] ?? '—' }}</span></span>
              <span class="num font-medium" :class="m.type === 'PAY_OUT' ? 'text-negative' : 'text-positive'">{{ m.type === 'PAY_OUT' ? '−' : '+' }}{{ money(m.amount) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <UiModal v-model:open="closing" title="Close shift" description="Count the cash in the drawer and enter the total." size="sm">
      <div v-if="data" class="space-y-3">
        <p class="text-sm">Expected in drawer: <b class="num">{{ money(data.expectedCash) }}</b></p>
        <UiField id="counted" label="Counted cash" required><UiMoneyInput id="counted" v-model="counted" nullable /></UiField>
        <p v-if="difference != null" class="text-sm font-medium" :class="difference < 0 ? 'text-negative' : difference > 0 ? 'text-caution' : 'text-positive'">
          {{ difference === 0 ? 'Drawer balances' : difference < 0 ? `Short by ${money(-difference)}` : `Over by ${money(difference)}` }}
        </p>
        <UiField id="close-notes" label="Closing notes" :required="difference != null && difference !== 0" :hint="difference ? 'Required — explain the difference' : undefined">
          <textarea id="close-notes" v-model="closeNotes" rows="3" class="field" maxlength="1000" />
        </UiField>
      </div>
      <template #footer>
        <UiButton variant="light" @click="closing = false">Cancel</UiButton>
        <UiButton :loading="closePending" :disabled="counted == null || (!!difference && !closeNotes.trim())" @click="closeShift">Close shift</UiButton>
      </template>
    </UiModal>
  </div>
</template>
