<script setup lang="ts">
import { UserPlus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Customers' })

const route = useRoute()
const router = useRouter()
const { money, date } = useFormat()
const { can } = useStaff()

const q = ref('')
const statusFilter = ref<'' | 'active' | 'inactive'>('active')
const withBalance = ref(false)
const page = ref(1)
watch([q, statusFilter, withBalance], () => (page.value = 1))
const { data, status, error, refresh } = useFetch('/api/admin/customers', {
  query: computed(() => ({ q: q.value || undefined, status: statusFilter.value || undefined, balance: withBalance.value ? '1' : undefined, page: page.value, pageSize: 25 })),
  server: false,
})

const creating = ref(false)
const form = reactive({ name: '', phone: '', email: '', notes: '' })
watch(() => route.query.new, (v) => {
  if (v === '1' && can('customers.manage')) {
    Object.assign(form, { name: '', phone: '', email: '', notes: '' })
    creating.value = true
  }
}, { immediate: true })
watch(creating, (v) => {
  if (!v && route.query.new) router.replace({ query: {} })
})
const { pending, run } = useAction()
async function create() {
  const c = await run(() => apiFetch<{ id: string }>('/api/admin/customers', { method: 'POST', body: { name: form.name, phone: form.phone || null, email: form.email || null, notes: can('customers.notes') ? form.notes || null : undefined } }), { success: 'Customer created' })
  if (c) {
    creating.value = false
    await navigateTo(`/admin/customers/${c.id}`)
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Customers" subtitle="Everyone who has bought in store, online or through social channels." :crumbs="[{ label: 'Overview', to: '/admin' }, { label: 'Customers' }]">
      <UiButton v-if="can('customers.manage')" :icon="UserPlus" @click="creating = true">New customer</UiButton>
    </UiPageHeader>

    <UiCard :padded="false">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiSearchInput v-model="q" placeholder="Name, phone or email" class="min-w-[220px] flex-1" />
        <select v-model="statusFilter" class="field h-10 w-auto rounded-full" aria-label="Account status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="">All</option>
        </select>
        <label class="flex items-center gap-2 text-sm"><input v-model="withBalance" type="checkbox" class="size-4 accent-ink">With outstanding balance</label>
      </div>
      <div class="px-3 pb-3">
        <UiErrorState v-if="error" :error="error" @retry="refresh()" />
        <UiSkeleton v-else-if="status === 'pending' && !data" />
        <UiEmpty v-else-if="!data?.items.length" title="No customers found" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[820px]">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th class="text-right">Orders</th><th class="text-right">Purchases</th><th class="text-right">Outstanding</th><th>Last order</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="c in data.items" :key="c.id" class="cursor-pointer" @click="navigateTo(`/admin/customers/${c.id}`)">
                <td class="font-medium"><NuxtLink :to="`/admin/customers/${c.id}`" class="hover:underline" @click.stop>{{ c.name }}</NuxtLink><UiBadge v-if="c.hasAccount" tone="info" class="ml-2">Account</UiBadge></td>
                <td>{{ c.phone ?? '—' }}</td>
                <td class="max-w-[200px] truncate">{{ c.email ?? '—' }}</td>
                <td class="num text-right">{{ c.orderCount }}</td>
                <td class="num text-right">{{ money(c.totalPurchases) }}</td>
                <td class="num text-right" :class="c.outstanding > 0 ? 'font-medium text-negative' : 'text-ink-muted'">{{ c.outstanding > 0 ? money(c.outstanding) : '—' }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ c.lastOrderAt ? date(c.lastOrderAt, false) : '—' }}</td>
                <td><UiBadge :tone="c.isActive ? 'success' : 'neutral'" dot>{{ c.isActive ? 'Active' : 'Inactive' }}</UiBadge></td>
              </tr>
            </tbody>
          </table>
          <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
        </div>
      </div>
    </UiCard>

    <UiModal v-model:open="creating" title="New customer" size="sm">
      <form id="cust-form" class="space-y-3" @submit.prevent="create">
        <UiField id="cu-name" label="Name" required><input id="cu-name" v-model="form.name" class="field" required maxlength="120"></UiField>
        <UiField id="cu-phone" label="Phone"><input id="cu-phone" v-model="form.phone" class="field" type="tel" maxlength="30"></UiField>
        <UiField id="cu-email" label="Email"><input id="cu-email" v-model="form.email" class="field" type="email" maxlength="120"></UiField>
        <UiField v-if="can('customers.notes')" id="cu-notes" label="Private notes" hint="Visible only to staff with notes access"><textarea id="cu-notes" v-model="form.notes" rows="3" class="field" maxlength="2000" /></UiField>
      </form>
      <template #footer>
        <UiButton variant="light" @click="creating = false">Cancel</UiButton>
        <UiButton type="submit" form="cust-form" :loading="pending" :disabled="!form.name.trim()">Create customer</UiButton>
      </template>
    </UiModal>
  </div>
</template>
