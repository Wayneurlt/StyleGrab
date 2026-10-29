<script setup lang="ts">
import type { salesReport } from '~~/server/services/reports'
import { Download } from 'lucide-vue-next'
import { CHANNEL_LABELS, PAYMENT_STATUS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Sales report' })

const { money, date, today } = useFormat()
const from = ref(`${today().slice(0, 7)}-01`)
const to = ref(today())
const channel = ref('')
const categoryId = ref('')
const staffId = ref('')
const methodId = ref('')
const paymentStatus = ref('')
const page = ref(1)

const filters = computed(() => Object.fromEntries(Object.entries({
  from: from.value, to: to.value, channel: channel.value, categoryId: categoryId.value, staffId: staffId.value, methodId: methodId.value, paymentStatus: paymentStatus.value,
}).filter(([, v]) => v)))
watch(filters, () => (page.value = 1))

const { data: categories } = useFetch('/api/admin/categories', { server: false })
const { data: users } = useFetch('/api/admin/users', { server: false })
const { data: methods } = useFetch('/api/admin/payment-methods', { server: false })
const { data, error, status, refresh } = useFetch<Awaited<ReturnType<typeof salesReport>>>('/api/admin/reports/sales', { query: computed(() => ({ ...filters.value, page: page.value })), server: false })

const exportUrl = computed(() => `/api/admin/reports/export/sales?${new URLSearchParams(filters.value as Record<string, string>).toString()}`)
const points = computed(() => (data.value?.byDay ?? []).map(d => ({ label: d.day.slice(5), value: d.net, hint: `${d.orders} orders` })))
</script>

<template>
  <div>
    <UiPageHeader title="Sales" subtitle="Completed sales across every channel, net of discounts and returns." :crumbs="[{ label: 'Reports' }, { label: 'Sales' }]">
      <UiButton variant="light" :icon="Download" :to="exportUrl" external>Export CSV</UiButton>
    </UiPageHeader>

    <div class="mb-5 flex flex-col gap-3">
      <ReportsRangePicker v-model:from="from" v-model:to="to" />
      <div class="flex flex-wrap gap-2">
        <select v-model="channel" aria-label="Channel" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All channels</option>
          <option v-for="(l, k) in CHANNEL_LABELS" :key="k" :value="k">{{ l }}</option>
        </select>
        <select v-model="categoryId" aria-label="Category" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All categories</option>
          <option v-for="c in categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="staffId" aria-label="Staff member" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All staff</option>
          <option v-for="u in users ?? []" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
        <select v-model="methodId" aria-label="Payment method" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All payment methods</option>
          <option v-for="m in methods ?? []" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <select v-model="paymentStatus" aria-label="Payment status" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">Any payment status</option>
          <option v-for="(s, k) in PAYMENT_STATUS" :key="k" :value="k">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !data" :rows="4" height="h-24" />
    <div v-else-if="data" class="space-y-5">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <ReportsTile accent label="Net sales" :value="money(data.summary.net)" :hint="`${data.range.from} → ${data.range.to}`" />
        <ReportsTile label="Orders" :value="String(data.summary.orders)" />
        <ReportsTile label="Gross (list)" :value="money(data.summary.gross)" />
        <ReportsTile label="Discounts" :value="money(data.summary.discounts)" />
        <ReportsTile label="Returns" :value="money(data.summary.returns)" />
        <ReportsTile label="Net paid" :value="money(data.summary.paid)" hint="Confirmed payments minus refunds" />
      </div>

      <UiCard title="Net sales by day">
        <ReportsBarChart v-if="points.length" :points="points" />
        <UiEmpty v-else title="No sales in this range" />
      </UiCard>

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_3fr]">
        <UiCard title="Top products">
          <UiEmpty v-if="!data.byProduct.length" title="No products sold" />
          <div v-else class="overflow-x-auto">
            <table class="sg-table">
              <thead><tr><th>Product</th><th class="text-right">Units</th><th class="text-right">Revenue</th></tr></thead>
              <tbody>
                <tr v-for="p in data.byProduct" :key="p.productId">
                  <td><p class="font-medium">{{ p.name }}</p><p class="text-xs text-ink-muted">{{ p.category }}</p></td>
                  <td class="num text-right">{{ p.qty }}</td>
                  <td class="num text-right">{{ money(p.revenue) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>

        <UiCard title="Orders" :subtitle="`${data.total} completed`">
          <UiEmpty v-if="!data.orders.length" title="No orders match these filters" />
          <template v-else>
            <div class="overflow-x-auto">
              <table class="sg-table min-w-[680px]">
                <thead><tr><th>Order</th><th>Channel</th><th>Customer</th><th>Staff</th><th class="text-right">Net</th><th>Payment</th><th>Completed</th></tr></thead>
                <tbody>
                  <tr v-for="o in data.orders" :key="o.id">
                    <td class="font-medium"><NuxtLink :to="`/admin/orders/${o.id}`">{{ o.number }}</NuxtLink></td>
                    <td>{{ CHANNEL_LABELS[o.channel] }}</td>
                    <td class="max-w-[140px] truncate">{{ o.customerName }}</td>
                    <td>{{ o.staff }}</td>
                    <td class="num text-right">{{ money(o.total - o.amountReturned) }}</td>
                    <td><UiStatusBadge kind="payment" :value="o.paymentStatus" /></td>
                    <td class="whitespace-nowrap text-ink-soft">{{ date(o.completedAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
          </template>
        </UiCard>
      </div>
    </div>
  </div>
</template>
