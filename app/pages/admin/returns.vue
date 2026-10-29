<script setup lang="ts">
import { CONDITION_LABELS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Returns' })

const { money, date } = useFormat()
const q = ref('')
const page = ref(1)
watch(q, () => (page.value = 1))
const { data, status, error, refresh } = useFetch('/api/admin/returns', { query: computed(() => ({ q: q.value || undefined, page: page.value, pageSize: 25 })), server: false })
const resolutionLabel: Record<string, string> = { REFUND: 'Refund', EXCHANGE: 'Exchange', NO_REFUND: 'No refund' }
</script>

<template>
  <div>
    <UiPageHeader title="Returns" subtitle="Returns and exchanges are processed from the original order." :crumbs="[{ label: 'Orders', to: '/admin/orders' }, { label: 'Returns' }]" />
    <UiCard :padded="false">
      <div class="p-4"><UiSearchInput v-model="q" placeholder="Return or order number" class="max-w-sm" /></div>
      <div class="px-3 pb-3">
        <UiErrorState v-if="error" :error="error" @retry="refresh()" />
        <UiSkeleton v-else-if="status === 'pending' && !data" />
        <UiEmpty v-else-if="!data?.items.length" title="No returns" message="Open a completed order and choose “Process return”." />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[860px]">
            <thead><tr><th>Return</th><th>Order</th><th>Date</th><th>Items</th><th>Resolution</th><th class="text-right">Credit</th><th class="text-right">Refunded</th></tr></thead>
            <tbody>
              <tr v-for="r in data.items" :key="r.id">
                <td class="font-medium">{{ r.number }}<span class="block max-w-[180px] truncate text-xs font-normal text-ink-muted">{{ r.reason }}</span></td>
                <td><NuxtLink :to="`/admin/orders/${r.order.id}`" class="font-medium hover:underline">{{ r.order.number }}</NuxtLink></td>
                <td class="whitespace-nowrap">{{ date(r.createdAt) }}</td>
                <td>
                  <p v-for="i in r.items" :key="i.id" class="text-xs">
                    {{ i.quantity }} × {{ i.orderItem.productName }} <span class="text-ink-muted">({{ i.orderItem.variantTitle }}) — {{ CONDITION_LABELS[i.condition] }}<template v-if="i.condition === 'NEEDS_INSPECTION'">{{ i.resolvedAt ? (i.restocked ? ', restocked' : ', written off') : ', pending' }}</template></span>
                  </p>
                </td>
                <td><UiBadge :tone="r.resolution === 'EXCHANGE' ? 'accent' : r.resolution === 'REFUND' ? 'info' : 'neutral'">{{ resolutionLabel[r.resolution] }}</UiBadge></td>
                <td class="num text-right">{{ money(r.creditAmount) }}</td>
                <td class="num text-right">
                  <template v-if="r.refunds.length"><span v-for="f in r.refunds" :key="f.id" class="block">{{ money(f.amount) }} <span class="text-xs text-ink-muted">{{ f.method.name }}</span></span></template>
                  <span v-else class="text-ink-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
        </div>
      </div>
    </UiCard>
  </div>
</template>
