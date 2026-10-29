<script setup lang="ts">
import { Lock, Pencil, Plus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Payment methods' })

type MethodType = 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD_TERMINAL' | 'OTHER'
interface Method { id: string, code: string, name: string, type: string, requiresReference: boolean, requiresVerification: boolean, instructions: string | null, isActive: boolean, isSystem: boolean, sortOrder: number }

const TYPES: { value: MethodType, label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile money (M-Pesa)' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD_TERMINAL', label: 'Card (external terminal)' },
  { value: 'OTHER', label: 'Other' },
]
const typeLabel = (t: string) => TYPES.find(x => x.value === t)?.label ?? (t === 'EXCHANGE_CREDIT' ? 'Exchange credit' : t)

const { can } = useStaff()
const { pending, run } = useAction()
const { data, error, status, refresh } = useFetch<Method[]>('/api/admin/payment-methods', { server: false })

const open = ref(false)
const editingId = ref<string | null>(null)
const blank = () => ({ code: '', name: '', type: 'MOBILE_MONEY' as MethodType, requiresReference: true, requiresVerification: true, instructions: '', isActive: true, sortOrder: (data.value?.length ?? 0) })
const form = reactive(blank())
const formError = ref<string | null>(null)

function startCreate() {
  editingId.value = null
  Object.assign(form, blank())
  formError.value = null
  open.value = true
}
function startEdit(m: Method) {
  editingId.value = m.id
  Object.assign(form, { code: m.code, name: m.name, type: m.type as MethodType, requiresReference: m.requiresReference, requiresVerification: m.requiresVerification, instructions: m.instructions ?? '', isActive: m.isActive, sortOrder: m.sortOrder })
  formError.value = null
  open.value = true
}

async function save() {
  formError.value = null
  if (!form.name.trim()) return (formError.value = 'Name is required')
  if (!editingId.value && !/^[A-Za-z0-9_]{2,20}$/.test(form.code)) return (formError.value = 'Code must be 2–20 letters, numbers or underscores')
  const body = { ...form, instructions: form.instructions.trim() || null, sortOrder: Number(form.sortOrder) || 0 }
  const ok = await run(() => editingId.value
    ? apiFetch(`/api/admin/payment-methods/${editingId.value}`, { method: 'PUT', body: { ...body, code: undefined } })
    : apiFetch('/api/admin/payment-methods', { method: 'POST', body }), { success: 'Payment method saved' })
  if (ok) {
    open.value = false
    await refresh()
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Payment methods" subtitle="Ways customers pay outside StyleGrab. Nothing here charges a card or initiates M-Pesa — staff record what was received." :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Payment methods' }]">
      <UiButton v-if="can('settings.manage')" :icon="Plus" @click="startCreate">Add method</UiButton>
    </UiPageHeader>

    <UiCard>
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="5" />
      <UiEmpty v-else-if="!data?.length" title="No payment methods" />
      <div v-else class="overflow-x-auto">
        <table class="sg-table min-w-[760px]">
          <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Reference</th><th>Verification</th><th>Status</th><th><span class="sr-only">Edit</span></th></tr></thead>
          <tbody>
            <tr v-for="m in data" :key="m.id">
              <td><p class="font-medium">{{ m.name }}</p><p v-if="m.instructions" class="max-w-xs truncate text-xs text-ink-muted">{{ m.instructions }}</p></td>
              <td class="font-mono text-xs">{{ m.code }}</td>
              <td>{{ typeLabel(m.type) }}</td>
              <td>{{ m.requiresReference ? 'Required' : 'Optional' }}</td>
              <td><UiBadge :tone="m.requiresVerification ? 'warning' : 'neutral'">{{ m.requiresVerification ? 'Staff must verify' : 'Confirmed on entry' }}</UiBadge></td>
              <td><UiBadge :tone="m.isActive ? 'success' : 'neutral'" dot>{{ m.isActive ? 'Active' : 'Inactive' }}</UiBadge></td>
              <td class="text-right">
                <span v-if="m.isSystem" class="inline-flex items-center gap-1 text-xs text-ink-muted"><Lock class="size-3.5" />System</span>
                <UiIconButton v-else-if="can('settings.manage')" :icon="Pencil" :label="`Edit ${m.name}`" size="sm" @click="startEdit(m)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <UiModal v-model:open="open" :title="editingId ? 'Edit payment method' : 'Add payment method'" size="lg">
      <form id="pm-form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" novalidate @submit.prevent="save">
        <UiField id="pm-name" label="Name" required><input id="pm-name" v-model="form.name" class="field" maxlength="60" placeholder="e.g. M-Pesa Till"></UiField>
        <UiField id="pm-code" label="Code" required :hint="editingId ? 'Codes cannot change' : 'Short unique code, e.g. MPESA_TILL'">
          <input id="pm-code" v-model="form.code" class="field font-mono uppercase" maxlength="20" :disabled="!!editingId">
        </UiField>
        <UiField id="pm-type" label="Type">
          <select id="pm-type" v-model="form.type" class="field"><option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option></select>
        </UiField>
        <UiField id="pm-sort" label="Display order"><input id="pm-sort" v-model.number="form.sortOrder" type="number" min="0" max="1000" class="field num"></UiField>
        <UiField id="pm-instr" label="Customer instructions" hint="Shown at checkout and on order confirmations, e.g. Till number." class="sm:col-span-2">
          <textarea id="pm-instr" v-model="form.instructions" rows="2" class="field" maxlength="500" />
        </UiField>
        <label class="flex items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm"><input v-model="form.requiresReference" type="checkbox" class="size-4 accent-ink">Require a transaction reference</label>
        <label class="flex items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm"><input v-model="form.requiresVerification" type="checkbox" class="size-4 accent-ink">Payments need staff verification</label>
        <label class="flex items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm sm:col-span-2"><input v-model="form.isActive" type="checkbox" class="size-4 accent-ink">Active</label>
        <p v-if="formError" class="text-sm text-negative sm:col-span-2" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <UiButton variant="light" @click="open = false">Cancel</UiButton>
        <UiButton type="submit" form="pm-form" :loading="pending">Save</UiButton>
      </template>
    </UiModal>
  </div>
</template>
