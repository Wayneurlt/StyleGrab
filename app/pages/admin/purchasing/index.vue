<script setup lang="ts">
import { Plus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Purchase orders' })

const { can } = useStaff()
const { money, date } = useFormat()
const page = ref(1)
const q = ref('')
const status = ref('')
const supplierId = ref('')
watch([q, status, supplierId], () => (page.value = 1))

const { data: suppliers } = useFetch('/api/admin/suppliers', { query: { pageSize: 100 }, server: false })
const { data, error, status: state, refresh } = useFetch('/api/admin/purchase-orders', {
  query: computed(() => ({ page: page.value, pageSize: 25, q: q.value || undefined, status: status.value || undefined, supplierId: supplierId.value || undefined })),
  server: false,
})
</script>

<template>
  <div>
    <UiPageHeader title="Purchase orders" subtitle="What you've ordered from suppliers and what has arrived." :crumbs="[{ label: 'Purchasing' }]">
      <UiButton v-if="can('purchasing.manage')" to="/admin/purchasing/new" :icon="Plus">New purchase order</UiButton>
    </UiPageHeader>

    <UiCard>
      <div class="mb-4 flex flex-wrap gap-2">
        <UiSearchInput v-model="q" placeholder="Search PO number" class="w-full sm:w-64" />
        <label class="sr-only" for="po-status">Status</label>
        <select id="po-status" v-model="status" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All statuses</option>
          <option value="OPEN">Open (awaiting goods)</option>
          <option value="DRAFT">Draft</option>
          <option value="ORDERED">Ordered</option>
          <option value="PARTIALLY_RECEIVED">Partially received</option>
          <option value="RECEIVED">Received</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <label class="sr-only" for="po-supplier-filter">Supplier</label>
        <select id="po-supplier-filter" v-model="supplierId" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All suppliers</option>
          <option v-for="s in suppliers?.items ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="state === 'pending' && !data" :rows="6" />
      <UiEmpty v-else-if="!data?.items.length" title="No purchase orders" message="Create a purchase order to track stock you've ordered from a supplier." />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[760px]">
            <thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Expected</th><th class="text-right">Received / ordered</th><th class="text-right">Value</th><th>Created</th></tr></thead>
            <tbody>
              <tr v-for="po in data.items" :key="po.id" class="cursor-pointer" @click="navigateTo(`/admin/purchasing/${po.id}`)">
                <td class="font-medium"><NuxtLink :to="`/admin/purchasing/${po.id}`" @click.stop>{{ po.number }}</NuxtLink></td>
                <td>{{ po.supplier.name }}</td>
                <td><UiStatusBadge kind="po" :value="po.status" /></td>
                <td class="text-ink-soft">{{ po.expectedAt ? date(po.expectedAt, false) : '—' }}</td>
                <td class="num text-right">{{ po.receivedUnits }} / {{ po.orderedUnits }}</td>
                <td class="num text-right">{{ money(po.value) }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ date(po.createdAt, false) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </UiCard>
  </div>
</template>
