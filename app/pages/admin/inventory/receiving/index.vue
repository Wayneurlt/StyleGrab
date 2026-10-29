<script setup lang="ts">
import { PackagePlus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Receiving' })

const { can, canAny } = useStaff()
const { money, date } = useFormat()
const q = ref('')
const page = ref(1)
watch(q, () => (page.value = 1))
const { data, error, status, refresh } = useFetch('/api/admin/inventory/receipts', { server: false, query: computed(() => ({ q: q.value || undefined, page: page.value, pageSize: 25 })) })
const showValue = computed(() => canAny('reports.inventory', 'purchasing.manage'))
</script>

<template>
  <div>
    <UiPageHeader title="Receiving" subtitle="Goods received from suppliers. Only accepted units enter sellable stock." :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Receiving' }]">
      <UiButton v-if="can('inventory.receive')" :icon="PackagePlus" to="/admin/inventory/receiving/new">Receive stock</UiButton>
    </UiPageHeader>
    <section class="glass-card p-5">
      <UiSearchInput v-model="q" placeholder="Search receipt number or reference" class="mb-4 w-full sm:w-72" />
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="6" />
      <UiEmpty v-else-if="!data?.items.length" title="No deliveries recorded" message="Record goods as they arrive to increase stock and update average costs.">
        <UiButton v-if="can('inventory.receive')" size="sm" to="/admin/inventory/receiving/new">Receive stock</UiButton>
      </UiEmpty>
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[760px]">
            <thead><tr><th>Receipt</th><th>Received</th><th>Supplier</th><th>Purchase order</th><th>Reference</th><th class="text-right">Accepted</th><th class="text-right">Damaged</th><th v-if="showValue" class="text-right">Value</th></tr></thead>
            <tbody>
              <tr v-for="r in data.items" :key="r.id">
                <td class="font-medium">{{ r.number }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ date(r.receivedAt, false) }}</td>
                <td>{{ r.supplier?.name ?? '—' }}</td>
                <td>
                  <NuxtLink v-if="r.purchaseOrderId" :to="`/admin/purchasing/${r.purchaseOrderId}`" class="underline-offset-2 hover:underline">{{ r.purchaseOrder?.number }}</NuxtLink>
                  <span v-else class="text-ink-muted">—</span>
                </td>
                <td class="text-ink-soft">{{ r.reference ?? '—' }}</td>
                <td class="num text-right">{{ r.units }}</td>
                <td class="num text-right" :class="r.damaged ? 'text-negative' : 'text-ink-muted'">{{ r.damaged }}</td>
                <td v-if="showValue" class="num text-right">{{ money(r.value) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </section>
  </div>
</template>
