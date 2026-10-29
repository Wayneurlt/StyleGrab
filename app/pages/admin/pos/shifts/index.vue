<script setup lang="ts">
import { LockOpen } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Cash shifts' })

const { money, date } = useFormat()
const { can } = useStaff()
const page = ref(1)
const { data, status, error, refresh } = useFetch('/api/admin/shifts', { query: computed(() => ({ page: page.value, pageSize: 25 })), server: false })
const { data: registers } = useFetch('/api/admin/pos/registers', { server: false })

const openForm = ref(false)
const registerId = ref('')
const openingCash = ref<number | null>(0)
watch(registers, (r) => {
  const free = r?.find(x => !x.shifts.length)
  if (free && !registerId.value) registerId.value = free.id
}, { immediate: true })
const { pending, run } = useAction()
async function open() {
  const s = await run(() => apiFetch<{ id: string }>('/api/admin/shifts', { method: 'POST', body: { registerId: registerId.value, openingCash: openingCash.value ?? 0 } }), { success: 'Shift opened' })
  if (s) {
    openForm.value = false
    await navigateTo(`/admin/pos/shifts/${s.id}`)
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Cash shifts" subtitle="Opening float, cash taken, and the counted drawer at close." :crumbs="[{ label: 'POS', to: '/admin/pos' }, { label: 'Shifts' }]">
      <UiButton v-if="can('shifts.manage')" :icon="LockOpen" @click="openForm = true">Open shift</UiButton>
    </UiPageHeader>

    <UiCard :padded="false">
      <div class="p-3">
        <UiErrorState v-if="error" :error="error" @retry="refresh()" />
        <UiSkeleton v-else-if="status === 'pending' && !data" />
        <UiEmpty v-else-if="!data?.items.length" title="No shifts yet" message="Open a shift before taking cash at the register." />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[760px]">
            <thead><tr><th>Register</th><th>Opened</th><th>Cashier</th><th>Status</th><th class="text-right">Opening</th><th class="text-right">Expected</th><th class="text-right">Counted</th><th class="text-right">Difference</th></tr></thead>
            <tbody>
              <tr v-for="s in data.items" :key="s.id" class="cursor-pointer" @click="navigateTo(`/admin/pos/shifts/${s.id}`)">
                <td class="font-medium"><NuxtLink :to="`/admin/pos/shifts/${s.id}`" class="hover:underline">{{ s.register.name }}</NuxtLink></td>
                <td class="whitespace-nowrap">{{ date(s.openedAt) }}</td>
                <td>{{ s.openedBy }}</td>
                <td><UiBadge :tone="s.status === 'OPEN' ? 'accent' : 'neutral'">{{ s.status === 'OPEN' ? 'Open' : 'Closed' }}</UiBadge></td>
                <td class="num text-right">{{ money(s.openingCash) }}</td>
                <td class="num text-right">{{ s.expectedCash == null ? '—' : money(s.expectedCash) }}</td>
                <td class="num text-right">{{ s.countedCash == null ? '—' : money(s.countedCash) }}</td>
                <td class="num text-right" :class="(s.difference ?? 0) < 0 ? 'text-negative' : (s.difference ?? 0) > 0 ? 'text-caution' : ''">{{ s.difference == null ? '—' : money(s.difference) }}</td>
              </tr>
            </tbody>
          </table>
          <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
        </div>
      </div>
    </UiCard>

    <UiModal v-model:open="openForm" title="Open a cash shift" size="sm">
      <div class="space-y-3">
        <UiField id="sh-register" label="Register">
          <select id="sh-register" v-model="registerId" class="field">
            <option v-for="r in registers ?? []" :key="r.id" :value="r.id" :disabled="r.shifts.length > 0">{{ r.name }}{{ r.shifts.length ? ' — already open' : '' }}</option>
          </select>
        </UiField>
        <UiField id="sh-float" label="Opening float" hint="Cash in the drawer before the first sale"><UiMoneyInput id="sh-float" v-model="openingCash" /></UiField>
      </div>
      <template #footer>
        <UiButton variant="light" @click="openForm = false">Cancel</UiButton>
        <UiButton :loading="pending" :disabled="!registerId" @click="open">Open shift</UiButton>
      </template>
    </UiModal>
  </div>
</template>
