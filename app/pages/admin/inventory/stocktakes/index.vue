<script setup lang="ts">
import { ClipboardList } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Stocktakes' })

const { can } = useStaff()
const { date, today } = useFormat()
const { pending, run } = useAction()
const { data, error, status, refresh } = useFetch('/api/admin/inventory/stocktakes', { server: false })
const { data: categories } = useFetch('/api/admin/categories', { server: false })

const open = ref(false)
const form = reactive({ name: '', categoryId: '', notes: '' })
function start() {
  Object.assign(form, { name: `Stock count ${today()}`, categoryId: '', notes: '' })
  open.value = true
}
async function create() {
  const st = await run(() => apiFetch<{ id: string }>('/api/admin/inventory/stocktakes', { method: 'POST', body: { name: form.name, categoryId: form.categoryId || null, notes: form.notes || null } }), { success: 'Stocktake started — expected quantities captured' })
  if (st) await navigateTo(`/admin/inventory/stocktakes/${st.id}`)
}
const tone = (s: string) => (({ IN_PROGRESS: 'info', SUBMITTED: 'warning', FINALIZED: 'success', CANCELLED: 'neutral' }) as const)[s as 'IN_PROGRESS'] ?? 'neutral'
const label = (s: string) => ({ IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted for review', FINALIZED: 'Finalized', CANCELLED: 'Cancelled' } as Record<string, string>)[s] ?? s
</script>

<template>
  <div>
    <UiPageHeader title="Stocktakes" subtitle="Count physical stock, review discrepancies, and post approved corrections to the ledger." :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Stocktakes' }]">
      <UiButton v-if="can('inventory.stocktake')" :icon="ClipboardList" @click="start">Start a count</UiButton>
    </UiPageHeader>
    <section class="glass-card p-5">
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="5" />
      <UiEmpty v-else-if="!data?.length" title="No stocktakes yet" message="Start a count for the whole store or a single category." />
      <div v-else class="overflow-x-auto">
        <table class="sg-table min-w-[720px]">
          <thead><tr><th>Count</th><th>Status</th><th>Started</th><th class="text-right">Counted</th><th class="text-right">Discrepancies</th><th>Finalized</th></tr></thead>
          <tbody>
            <tr v-for="s in data" :key="s.id">
              <td><NuxtLink :to="`/admin/inventory/stocktakes/${s.id}`" class="font-medium hover:underline">{{ s.number }} · {{ s.name }}</NuxtLink></td>
              <td><UiBadge :tone="tone(s.status)">{{ label(s.status) }}</UiBadge></td>
              <td class="whitespace-nowrap text-ink-soft">{{ date(s.startedAt) }}</td>
              <td class="num text-right">{{ s.counted }} / {{ s.lines }}</td>
              <td class="num text-right" :class="s.discrepancies ? 'font-medium text-caution' : 'text-ink-muted'">{{ s.discrepancies }}</td>
              <td class="whitespace-nowrap text-ink-soft">{{ s.finalizedAt ? date(s.finalizedAt) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <UiModal v-model:open="open" title="Start a stocktake" description="Expected quantities are captured now. Sales made during the count are preserved: only the difference you count is posted.">
      <form id="st-form" class="space-y-4" @submit.prevent="create">
        <UiField id="st-name" label="Name" required><input id="st-name" v-model="form.name" class="field" maxlength="120" required></UiField>
        <UiField id="st-cat" label="Scope">
          <select id="st-cat" v-model="form.categoryId" class="field">
            <option value="">All active products</option>
            <option v-for="c in categories ?? []" :key="c.id" :value="c.id">{{ c.parentId ? '— ' : '' }}{{ c.name }}</option>
          </select>
        </UiField>
        <UiField id="st-notes" label="Notes"><textarea id="st-notes" v-model="form.notes" rows="2" class="field" maxlength="1000" /></UiField>
      </form>
      <template #footer>
        <UiButton variant="light" @click="open = false">Cancel</UiButton>
        <UiButton type="submit" form="st-form" :loading="pending" :disabled="!form.name.trim()">Start count</UiButton>
      </template>
    </UiModal>
  </div>
</template>
