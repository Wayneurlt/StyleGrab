<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { CHANNEL_LABELS, ORDER_STATUS, PAYMENT_STATUS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Orders' })

const route = useRoute()
const router = useRouter()
const { money, date } = useFormat()
const { can } = useStaff()

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const filters = reactive({
  q: str(route.query.q),
  channel: str(route.query.channel),
  status: str(route.query.status),
  paymentStatus: str(route.query.paymentStatus),
  from: str(route.query.from),
  to: str(route.query.to),
  sort: str(route.query.sort) || 'newest',
})
const page = ref(Number(route.query.page) || 1)

const query = computed(() => {
  const q: Record<string, string | number> = { page: page.value, pageSize: 25 }
  for (const [k, v] of Object.entries(filters)) if (v) q[k] = v
  return q
})
watch(() => ({ ...filters }), () => (page.value = 1))
watch(query, q => router.replace({ query: Object.fromEntries(Object.entries(q).filter(([k, v]) => k !== 'pageSize' && !(k === 'page' && v === 1)).map(([k, v]) => [k, String(v)])) }))

const { data, status, error, refresh } = useFetch('/api/admin/orders', { query, server: false })
const statusTabs = [{ value: '', label: 'All' }, { value: 'OPEN', label: 'Open' }, { value: 'PENDING', label: 'Pending' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }]
const statusTab = computed({ get: () => filters.status, set: (v: string) => (filters.status = v) })
function clear() {
  Object.assign(filters, { q: '', channel: '', status: '', paymentStatus: '', from: '', to: '', sort: 'newest' })
}
</script>

<template>
  <div>
    <UiPageHeader title="Orders" subtitle="Every sale and order across the POS, website and social channels." :crumbs="[{ label: 'Overview', to: '/admin' }, { label: 'Orders' }]">
      <UiButton v-if="can('orders.manage')" to="/admin/orders/new" :icon="Plus">Manual order</UiButton>
    </UiPageHeader>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <UiTabs v-model="statusTab" :tabs="statusTabs.concat(ORDER_STATUS[filters.status] && !statusTabs.some(t => t.value === filters.status) ? [{ value: filters.status, label: ORDER_STATUS[filters.status]!.label }] : [])" label="Order status" />
    </div>

    <UiCard :padded="false">
      <div class="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        <UiSearchInput v-model="filters.q" placeholder="Order #, customer, phone, SKU" class="lg:col-span-2" />
        <select v-model="filters.channel" class="field h-10 rounded-full" aria-label="Channel">
          <option value="">All channels</option>
          <option v-for="(label, k) in CHANNEL_LABELS" :key="k" :value="k">{{ label }}</option>
        </select>
        <select v-model="filters.paymentStatus" class="field h-10 rounded-full" aria-label="Payment status">
          <option value="">Any payment status</option>
          <option v-for="(s, k) in PAYMENT_STATUS" :key="k" :value="k">{{ s.label }}</option>
        </select>
        <div class="flex gap-2 lg:col-span-2">
          <input v-model="filters.from" type="date" class="field h-10 rounded-full" aria-label="Placed from">
          <input v-model="filters.to" type="date" class="field h-10 rounded-full" aria-label="Placed to">
        </div>
        <select v-model="filters.sort" class="field h-10 rounded-full" aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total_desc">Highest total</option>
          <option value="total_asc">Lowest total</option>
        </select>
        <UiButton variant="ghost" size="sm" class="justify-self-start" @click="clear">Clear filters</UiButton>
      </div>
      <div class="px-3 pb-3">
        <UiErrorState v-if="error" :error="error" @retry="refresh()" />
        <UiSkeleton v-else-if="status === 'pending' && !data" :rows="6" />
        <UiEmpty v-else-if="!data?.items.length" title="No orders match" message="Try adjusting the filters." />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[900px]">
            <thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Date</th><th>Items</th><th class="text-right">Total</th><th class="text-right">Balance</th><th>Payment</th><th>Fulfilment</th></tr></thead>
            <tbody>
              <tr v-for="o in data.items" :key="o.id" class="cursor-pointer" @click="navigateTo(`/admin/orders/${o.id}`)">
                <td class="font-medium"><NuxtLink :to="`/admin/orders/${o.id}`" class="hover:underline" @click.stop>{{ o.number }}</NuxtLink></td>
                <td>{{ o.customerName }}<span v-if="o.assignedTo" class="block text-xs text-ink-muted">→ {{ o.assignedTo }}</span></td>
                <td>{{ CHANNEL_LABELS[o.channel] }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ date(o.placedAt) }}</td>
                <td class="max-w-[200px] truncate">{{ o.firstItem }}<span v-if="o.itemCount > 1" class="text-ink-muted"> +{{ o.itemCount - 1 }}</span></td>
                <td class="num text-right font-medium">{{ money(o.total) }}</td>
                <td class="num text-right" :class="o.balance > 0 ? 'font-medium text-negative' : 'text-ink-muted'">{{ o.balance > 0 ? money(o.balance) : '—' }}</td>
                <td><UiStatusBadge kind="payment" :value="o.paymentStatus" /></td>
                <td><UiStatusBadge kind="order" :value="o.status" dot /></td>
              </tr>
            </tbody>
          </table>
          <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
        </div>
      </div>
    </UiCard>
  </div>
</template>
