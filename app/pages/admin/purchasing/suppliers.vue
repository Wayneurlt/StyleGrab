<script setup lang="ts">
import { Pencil, Plus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Suppliers' })

interface Supplier { id: string, name: string, contactPerson: string | null, phone: string | null, email: string | null, address: string | null, notes: string | null, isActive: boolean }

const { can } = useStaff()
const { confirm } = useConfirm()
const { pending, run } = useAction()
const page = ref(1)
const q = ref('')
watch(q, () => (page.value = 1))
const { data, error, status, refresh } = useFetch('/api/admin/suppliers', { query: computed(() => ({ page: page.value, pageSize: 25, q: q.value || undefined })), server: false })

const open = ref(false)
const editingId = ref<string | null>(null)
const blank = () => ({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' })
const form = reactive(blank())
const formError = ref<string | null>(null)

function startCreate() {
  editingId.value = null
  Object.assign(form, blank())
  formError.value = null
  open.value = true
}
function startEdit(s: Supplier) {
  editingId.value = s.id
  Object.assign(form, { name: s.name, contactPerson: s.contactPerson ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '' })
  formError.value = null
  open.value = true
}

async function save() {
  formError.value = null
  if (!form.name.trim()) return (formError.value = 'Supplier name is required')
  const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || (k === 'name' ? v : null)]))
  const ok = await run(() => editingId.value
    ? apiFetch(`/api/admin/suppliers/${editingId.value}`, { method: 'PUT', body })
    : apiFetch('/api/admin/suppliers', { method: 'POST', body }), { success: editingId.value ? 'Supplier updated' : 'Supplier added' })
  if (ok) {
    open.value = false
    await refresh()
  }
}

async function toggle(s: Supplier) {
  if (!(await confirm({ title: s.isActive ? `Deactivate ${s.name}?` : `Reactivate ${s.name}?`, message: s.isActive ? 'Inactive suppliers cannot receive new purchase orders. History is kept.' : undefined, confirmLabel: s.isActive ? 'Deactivate' : 'Reactivate', danger: s.isActive }))) return
  const ok = await run(() => apiFetch(`/api/admin/suppliers/${s.id}`, { method: 'PUT', body: { isActive: !s.isActive } }), { success: s.isActive ? 'Supplier deactivated' : 'Supplier reactivated' })
  if (ok) await refresh()
}
</script>

<template>
  <div>
    <UiPageHeader title="Suppliers" subtitle="Who you buy stock from." :crumbs="[{ label: 'Purchasing', to: '/admin/purchasing' }, { label: 'Suppliers' }]">
      <UiButton v-if="can('purchasing.manage')" :icon="Plus" @click="startCreate">Add supplier</UiButton>
    </UiPageHeader>

    <UiCard>
      <UiSearchInput v-model="q" placeholder="Search suppliers" class="mb-4 w-full sm:w-72" />
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="5" />
      <UiEmpty v-else-if="!data?.items.length" title="No suppliers yet" message="Add the businesses you buy stock from." />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[720px]">
            <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th class="text-right">POs</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <tr v-for="s in data.items" :key="s.id">
                <td class="font-medium">{{ s.name }}</td>
                <td>{{ s.contactPerson ?? '—' }}</td>
                <td>{{ s.phone ?? '—' }}</td>
                <td>{{ s.email ?? '—' }}</td>
                <td class="num text-right">{{ s._count.purchaseOrders }}</td>
                <td><UiBadge :tone="s.isActive ? 'success' : 'neutral'" dot>{{ s.isActive ? 'Active' : 'Inactive' }}</UiBadge></td>
                <td class="text-right">
                  <div v-if="can('purchasing.manage')" class="flex justify-end gap-1">
                    <UiIconButton :icon="Pencil" :label="`Edit ${s.name}`" size="sm" @click="startEdit(s)" />
                    <UiButton size="sm" variant="ghost" @click="toggle(s)">{{ s.isActive ? 'Deactivate' : 'Reactivate' }}</UiButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </UiCard>

    <UiModal v-model:open="open" :title="editingId ? 'Edit supplier' : 'Add supplier'" size="lg">
      <form id="supplier-form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" novalidate @submit.prevent="save">
        <UiField id="sup-name" label="Name" required class="sm:col-span-2"><input id="sup-name" v-model="form.name" class="field" maxlength="120"></UiField>
        <UiField id="sup-contact" label="Contact person"><input id="sup-contact" v-model="form.contactPerson" class="field" maxlength="120"></UiField>
        <UiField id="sup-phone" label="Phone"><input id="sup-phone" v-model="form.phone" type="tel" class="field" maxlength="30"></UiField>
        <UiField id="sup-email" label="Email" class="sm:col-span-2"><input id="sup-email" v-model="form.email" type="email" class="field" maxlength="120"></UiField>
        <UiField id="sup-address" label="Address" class="sm:col-span-2"><textarea id="sup-address" v-model="form.address" rows="2" class="field" maxlength="500" /></UiField>
        <UiField id="sup-notes" label="Notes" class="sm:col-span-2"><textarea id="sup-notes" v-model="form.notes" rows="2" class="field" maxlength="2000" /></UiField>
        <p v-if="formError" class="text-sm text-negative sm:col-span-2" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <UiButton variant="light" @click="open = false">Cancel</UiButton>
        <UiButton type="submit" form="supplier-form" :loading="pending">Save</UiButton>
      </template>
    </UiModal>
  </div>
</template>
