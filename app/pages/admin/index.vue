<script setup lang="ts">
import { ArrowLeftRight, Banknote, Boxes, CircleDollarSign, CreditCard, Ellipsis, Landmark, Plus, Receipt, Smartphone, Wallet, Zap } from 'lucide-vue-next'
import { CHANNEL_LABELS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Overview' })

const { me, can } = useStaff()
const { money, date, today, currency } = useFormat()
const staffSettings = useState<{ timezone: string } | null>('staff-settings')

const monthStart = computed(() => `${today().slice(0, 7)}-01`)
const { data, error, status, refresh } = useFetch('/api/admin/dashboard', { query: { from: monthStart, to: computed(() => today()) }, server: false })

const greeting = computed(() => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: staffSettings.value?.timezone ?? 'Africa/Nairobi' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
})

// Month-over-month change from the real revenue series.
const thisMonth = computed(() => data.value?.months.at(-1)?.revenue ?? 0)
const lastMonth = computed(() => data.value?.months.at(-2)?.revenue ?? 0)
const mom = computed(() => (lastMonth.value > 0 ? ((thisMonth.value - lastMonth.value) / lastMonth.value) * 100 : null))
const collected = computed(() => data.value?.paymentMethods.reduce((s, m) => s + m.confirmed, 0) ?? 0)
const collectedPct = computed(() => (data.value?.salesPeriod.net ? Math.min(100, (collected.value / data.value.salesPeriod.net) * 100) : 0))
const methodIcon = (type: string) => ({ CASH: Banknote, MOBILE_MONEY: Smartphone, BANK_TRANSFER: Landmark, CARD_TERMINAL: CreditCard }[type] ?? Wallet)

// Recent activity table with live search and a status filter.
const activityQ = ref('')
const activityStatus = ref('')
const { data: activity, status: activityState } = useFetch('/api/admin/orders', {
  query: computed(() => ({ q: activityQ.value || undefined, status: activityStatus.value || undefined, pageSize: 6 })),
  server: false,
  immediate: can('orders.view'),
})
</script>

<template>
  <div>
    <header class="mb-7">
      <h1 class="font-display text-[2rem] font-semibold leading-tight text-ink sm:text-display">{{ greeting }}, {{ me?.name?.split(' ')[0] }}</h1>
      <p class="mt-2 text-sm text-ink-soft/80">Stay on top of your sales, monitor stock, and track order status.</p>
    </header>

    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <div v-else-if="status === 'pending' && !data" class="grid grid-cols-1 gap-5 lg:grid-cols-3"><UiSkeleton v-for="i in 3" :key="i" :rows="1" height="h-72" /></div>

    <div v-else-if="data" class="space-y-5">
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr_1fr]">
        <!-- Sales this month (reference: Total Balance + Wallets) -->
        <section class="glass-card flex flex-col p-5">
          <div class="flex items-start justify-between">
            <h2 class="text-[15px] font-medium">Sales this month</h2>
            <span class="rounded-full border border-sand-200 bg-white/70 px-2.5 py-1 text-xs font-medium">{{ currency }}</span>
          </div>
          <p class="num mt-2 text-[2rem] font-semibold tracking-tight">{{ money(thisMonth) }}</p>
          <p class="mt-1 flex items-center gap-2 text-xs text-ink-muted">
            <UiDelta :value="mom" />
            <span>{{ mom == null ? 'No sales recorded last month' : 'than last month' }}</span>
          </p>
          <div class="mt-5 grid grid-cols-2 gap-3">
            <UiButton v-if="can('pos.sell')" to="/admin/pos" :icon="Zap">New sale</UiButton>
            <UiButton v-if="can('orders.manage')" to="/admin/orders/new" variant="light" :icon="ArrowLeftRight">New order</UiButton>
          </div>
          <div class="glass-inner mt-5 flex-1 p-3">
            <p class="mb-3 text-[13px]"><span class="font-medium">Payments</span> <span class="text-ink-muted">| {{ data.paymentMethods.length }} methods · this month</span></p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div v-for="m in data.paymentMethods.slice(0, 3)" :key="m.id" class="rounded-xl border border-white bg-white/80 p-2.5 shadow-sm">
                <div class="flex items-center gap-1.5 text-xs font-medium">
                  <span class="flex size-5 items-center justify-center rounded-full bg-sand-100"><component :is="methodIcon(m.type)" class="size-3" /></span>{{ m.name }}
                </div>
                <p class="num mt-2 text-[13px] font-semibold">{{ money(m.confirmed, true) }}</p>
                <p class="mt-0.5 text-[10px] text-ink-muted">{{ m.pending ? `${money(m.pending, true)} awaiting` : `${m.count} records` }}</p>
                <p class="mt-1 text-[10px] font-medium" :class="m.isActive ? 'text-positive' : 'text-negative'">{{ m.isActive ? 'Active' : 'Inactive' }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 2×2 stat cards -->
        <section class="glass-card grid grid-cols-2 gap-3 p-3">
          <div class="accent-card flex flex-col justify-between p-4">
            <div class="flex items-start justify-between"><span class="text-[13px] text-white/90">Sales today</span><span class="flex size-7 items-center justify-center rounded-full bg-white/25"><Receipt class="size-3.5" /></span></div>
            <p class="num mt-6 text-[1.35rem] font-semibold sm:text-[1.7rem]">{{ money(data.salesToday.net, true) }}</p>
            <p class="mt-3 text-[11px] text-white/85"><span class="rounded-md bg-white/20 px-1.5 py-0.5 font-semibold">{{ data.salesToday.count }}</span> completed today</p>
          </div>
          <div class="rounded-3xl border border-sand-200 bg-sand-50 p-4">
            <div class="flex items-start justify-between"><span class="text-[13px] text-ink-soft">Orders</span><span class="flex size-7 items-center justify-center rounded-full bg-white shadow-lift"><Boxes class="size-3.5" /></span></div>
            <p class="num mt-6 text-[1.35rem] font-semibold sm:text-[1.7rem]">{{ data.ordersPeriod }}</p>
            <p class="mt-3 text-[11px] text-ink-muted"><span class="rounded-md bg-caution-tint px-1.5 py-0.5 font-semibold text-caution">{{ data.openOrders }}</span> open now</p>
          </div>
          <NuxtLink to="/admin/orders?paymentStatus=UNPAID" class="rounded-3xl border border-sand-200 bg-sand-50 p-4 transition hover:bg-sand-100">
            <div class="flex items-start justify-between"><span class="text-[13px] text-ink-soft">Outstanding</span><span class="flex size-7 items-center justify-center rounded-full bg-white shadow-lift"><CircleDollarSign class="size-3.5" /></span></div>
            <p class="num mt-6 text-[1.35rem] font-semibold sm:text-[1.7rem]">{{ money(data.outstanding.amount, true) }}</p>
            <p class="mt-3 text-[11px] text-ink-muted"><span class="rounded-md bg-negative-tint px-1.5 py-0.5 font-semibold text-negative">{{ data.outstanding.orders }}</span> orders with a balance</p>
          </NuxtLink>
          <NuxtLink to="/admin/payments?status=PENDING_CONFIRMATION" class="rounded-3xl border border-sand-200 bg-sand-50 p-4 transition hover:bg-sand-100">
            <div class="flex items-start justify-between"><span class="text-[13px] text-ink-soft">To verify</span><span class="flex size-7 items-center justify-center rounded-full bg-white shadow-lift"><Smartphone class="size-3.5" /></span></div>
            <p class="num mt-6 text-[1.35rem] font-semibold sm:text-[1.7rem]">{{ money(data.pendingPayments.amount, true) }}</p>
            <p class="mt-3 text-[11px] text-ink-muted"><span class="rounded-md bg-caution-tint px-1.5 py-0.5 font-semibold text-caution">{{ data.pendingPayments.count }}</span> payments awaiting</p>
          </NuxtLink>
        </section>

        <!-- Revenue vs COGS chart -->
        <section class="glass-card flex min-h-[300px] flex-col p-5">
          <h2 class="text-[15px] font-medium">Revenue</h2>
          <p class="mb-4 mt-0.5 text-xs text-ink-muted">Completed sales over the last eight months, net of returns</p>
          <AdminRevenueChart class="flex-1" :months="data.months" />
        </section>
      </div>

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_2fr]">
        <div class="space-y-5">
          <!-- Collection progress (reference: Monthly Spending Limit) -->
          <section class="glass-card p-5">
            <h2 class="text-[15px] font-medium">Payments collected this month</h2>
            <div class="mt-4 h-2.5 overflow-hidden rounded-full bg-sand-50" role="progressbar" :aria-valuenow="Math.round(collectedPct)" aria-valuemin="0" aria-valuemax="100" aria-label="Share of this month's sales collected">
              <div class="h-full rounded-full bg-accent" :style="{ width: `${collectedPct}%` }" />
            </div>
            <div class="mt-2 flex justify-between text-xs">
              <span><b class="num">{{ money(collected) }}</b> <span class="text-ink-muted">confirmed of</span></span>
              <b class="num">{{ money(data.salesPeriod.net) }}</b>
            </div>
            <p class="mt-2 text-[11px] text-ink-muted">Recorded by staff; external payments are not independently verified unless confirmed.</p>
          </section>

          <!-- Stock health (reference: My Cards) -->
          <section class="glass-card p-5">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="flex items-center gap-2 text-[15px] font-medium"><Boxes class="size-4" />Stock health</h2>
              <UiButton v-if="can('inventory.receive')" to="/admin/inventory/receiving/new" variant="light" size="sm" :icon="Plus">Receive</UiButton>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <NuxtLink to="/admin/inventory?filter=low" class="relative overflow-hidden rounded-2xl border border-accent/30 bg-accent-tint p-4 text-ink shadow-card">
                <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-accent-dark">Low</span>
                <p class="num mt-6 text-2xl font-semibold">{{ data.stock.low }}</p>
                <p class="text-[11px] text-ink-muted">variants at or below threshold</p>
                <div class="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-accent/10" />
              </NuxtLink>
              <NuxtLink to="/admin/inventory?filter=out" class="accent-card relative overflow-hidden p-4">
                <span class="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-semibold text-ink">Out</span>
                <p class="num mt-6 text-2xl font-semibold">{{ data.stock.out }}</p>
                <p class="text-[11px] text-white/80">variants unavailable</p>
              </NuxtLink>
            </div>
            <ul v-if="data.lowStock.length" class="mt-4 space-y-1.5">
              <li v-for="v in data.lowStock" :key="v.variantId" class="flex items-center justify-between rounded-xl bg-sand-50 px-3 py-2 text-[13px]">
                <span class="min-w-0 truncate">{{ v.name }} <span class="text-ink-muted">· {{ v.title }}</span></span>
                <UiBadge :tone="v.available <= 0 ? 'danger' : 'warning'">{{ v.available }} left</UiBadge>
              </li>
            </ul>
            <p v-if="data.stock.value != null" class="mt-3 text-xs text-ink-muted">Stock value at average cost: <b class="num text-ink">{{ money(data.stock.value) }}</b><template v-if="data.stock.missingCost"> · {{ data.stock.missingCost }} variants without a cost</template></p>
          </section>
        </div>

        <!-- Recent activities -->
        <section v-if="can('orders.view')" class="glass-card min-w-0 p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-[15px] font-medium">Recent activities</h2>
            <div class="flex flex-wrap items-center gap-2">
              <UiSearchInput v-model="activityQ" placeholder="Search" class="w-48" />
              <label class="sr-only" for="activity-filter">Filter by status</label>
              <select id="activity-filter" v-model="activityStatus" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
                <option value="">Filter</option>
                <option value="OPEN">Open</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="sg-table min-w-[640px]">
              <thead><tr><th>Order ID</th><th>Activity</th><th>Price</th><th>Status</th><th>Date</th><th><span class="sr-only">Open</span></th></tr></thead>
              <tbody>
                <tr v-for="o in activity?.items ?? []" :key="o.id">
                  <td class="font-medium">{{ o.number }}</td>
                  <td>
                    <span class="flex items-center gap-2">
                      <span class="flex size-6 items-center justify-center rounded-md bg-ink text-[10px] font-semibold text-white">{{ CHANNEL_LABELS[o.channel]?.[0] }}</span>
                      <span class="max-w-[220px] truncate">{{ o.firstItem }}<span v-if="o.itemCount > 1" class="text-ink-muted"> +{{ o.itemCount - 1 }}</span></span>
                    </span>
                  </td>
                  <td class="num">{{ money(o.total) }}</td>
                  <td><UiStatusBadge kind="order" :value="o.status" dot /></td>
                  <td class="whitespace-nowrap text-ink-soft">{{ date(o.placedAt) }}</td>
                  <td class="text-right"><UiIconButton :icon="Ellipsis" :to="`/admin/orders/${o.id}`" :label="`Open ${o.number}`" size="sm" /></td>
                </tr>
              </tbody>
            </table>
            <UiSkeleton v-if="activityState === 'pending' && !activity" :rows="4" />
            <UiEmpty v-else-if="!activity?.items.length" title="No orders yet" message="Sales from the POS, website and manual orders will appear here." />
          </div>
        </section>
      </div>

      <section v-if="data.bestSellers.length" class="glass-card p-5">
        <h2 class="mb-3 text-[15px] font-medium">Best sellers this month</h2>
        <ol class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <li v-for="(b, i) in data.bestSellers" :key="b.productId" class="rounded-2xl bg-sand-50 p-3">
            <p class="text-xs text-ink-muted">#{{ i + 1 }}</p>
            <p class="truncate font-medium">{{ b.name }}</p>
            <p class="num text-xs text-ink-soft">{{ b.qty }} sold · {{ money(b.revenue, true) }}</p>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>
