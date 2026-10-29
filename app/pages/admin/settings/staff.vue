<script setup lang="ts">
import { KeyRound, Pencil, UserPlus } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Staff' })

interface StaffUser { id: string, name: string, email: string, isActive: boolean, role: { id: string, key: string, name: string }, lastLoginAt: string | null, createdAt: string }
interface RoleRow { id: string, key: string, name: string }

const { me } = useStaff()
const { date } = useFormat()
const { confirm } = useConfirm()
const { pending, run } = useAction()
const { data: users, error, status, refresh } = useFetch('/api/admin/users', { server: false, transform: d => d as unknown as StaffUser[] })
const { data: rolesData } = useFetch('/api/admin/roles', { server: false })
const roles = computed<RoleRow[]>(() => rolesData.value?.roles ?? [])

const passwordHint = 'At least 10 characters, with letters and numbers.'
const strong = (p: string) => p.length >= 10 && /[a-zA-Z]/.test(p) && /\d/.test(p)

// Create
const createOpen = ref(false)
const create = reactive({ name: '', email: '', roleId: '', password: '' })
const createError = ref<string | null>(null)
function startCreate() {
  Object.assign(create, { name: '', email: '', roleId: roles.value.find(r => r.key === 'cashier')?.id ?? '', password: '' })
  createError.value = null
  createOpen.value = true
}
async function submitCreate() {
  createError.value = null
  if (!create.name.trim() || !create.email.trim() || !create.roleId) return (createError.value = 'Name, email and role are required')
  if (!strong(create.password)) return (createError.value = passwordHint)
  const ok = await run(() => apiFetch('/api/admin/users', { method: 'POST', body: create }), { success: 'Staff account created' })
  if (ok) {
    createOpen.value = false
    await refresh()
  }
}

// Edit
const editOpen = ref(false)
const edit = reactive({ id: '', name: '', roleId: '' })
function startEdit(u: StaffUser) {
  Object.assign(edit, { id: u.id, name: u.name, roleId: u.role.id })
  editOpen.value = true
}
async function submitEdit() {
  const self = edit.id === me.value?.id
  const before = users.value?.find(u => u.id === edit.id)
  const body: Record<string, string> = { name: edit.name }
  if (!self && before && edit.roleId !== before.role.id) {
    if (!(await confirm({ title: 'Change role?', message: 'This changes what the person can access immediately.', confirmLabel: 'Change role' }))) return
    body.roleId = edit.roleId
  }
  const ok = await run(() => apiFetch(`/api/admin/users/${edit.id}`, { method: 'PUT', body }), { success: 'Staff account updated' })
  if (ok) {
    editOpen.value = false
    await refresh()
  }
}

// Reset password
const resetOpen = ref(false)
const reset = reactive({ id: '', name: '', password: '' })
const resetError = ref<string | null>(null)
function startReset(u: StaffUser) {
  Object.assign(reset, { id: u.id, name: u.name, password: '' })
  resetError.value = null
  resetOpen.value = true
}
async function submitReset() {
  resetError.value = null
  if (!strong(reset.password)) return (resetError.value = passwordHint)
  const ok = await run(() => apiFetch(`/api/admin/users/${reset.id}`, { method: 'PUT', body: { password: reset.password } }), { success: 'Password reset. Their sessions were signed out.' })
  if (ok) resetOpen.value = false
}

async function toggleActive(u: StaffUser) {
  if (!(await confirm({ title: u.isActive ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`, message: u.isActive ? 'They will be signed out and unable to sign in. Their history is kept.' : undefined, confirmLabel: u.isActive ? 'Deactivate' : 'Reactivate', danger: u.isActive }))) return
  const ok = await run(() => apiFetch(`/api/admin/users/${u.id}`, { method: 'PUT', body: { isActive: !u.isActive } }), { success: u.isActive ? 'Account deactivated' : 'Account reactivated' })
  if (ok) await refresh()
}
</script>

<template>
  <div>
    <UiPageHeader title="Staff" subtitle="Who can sign in and what role they have." :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Staff' }]">
      <UiButton :icon="UserPlus" :disabled="!roles.length" @click="startCreate">Add staff</UiButton>
    </UiPageHeader>

    <UiCard>
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !users" :rows="5" />
      <UiEmpty v-else-if="!users?.length" title="No staff accounts" />
      <div v-else class="overflow-x-auto">
        <table class="sg-table min-w-[760px]">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td><p class="font-medium">{{ u.name }}<span v-if="u.id === me?.id" class="text-ink-muted"> (you)</span></p><p class="text-xs text-ink-muted">{{ u.email }}</p></td>
              <td>{{ u.role.name }}</td>
              <td><UiBadge :tone="u.isActive ? 'success' : 'neutral'" dot>{{ u.isActive ? 'Active' : 'Deactivated' }}</UiBadge></td>
              <td class="whitespace-nowrap text-ink-soft">{{ u.lastLoginAt ? date(u.lastLoginAt) : 'Never' }}</td>
              <td>
                <div class="flex justify-end gap-1">
                  <UiIconButton :icon="Pencil" :label="`Edit ${u.name}`" size="sm" @click="startEdit(u)" />
                  <UiIconButton :icon="KeyRound" :label="`Reset password for ${u.name}`" size="sm" @click="startReset(u)" />
                  <UiButton size="sm" variant="ghost" :disabled="u.id === me?.id" @click="toggleActive(u)">{{ u.isActive ? 'Deactivate' : 'Reactivate' }}</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <UiModal v-model:open="createOpen" title="Add staff member">
      <form id="create-user" class="space-y-4" novalidate @submit.prevent="submitCreate">
        <UiField id="cu-name" label="Name" required><input id="cu-name" v-model="create.name" class="field" maxlength="120"></UiField>
        <UiField id="cu-email" label="Email" required><input id="cu-email" v-model="create.email" type="email" autocomplete="off" class="field" maxlength="120"></UiField>
        <UiField id="cu-role" label="Role" required>
          <select id="cu-role" v-model="create.roleId" class="field"><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option></select>
        </UiField>
        <UiField id="cu-pass" label="Initial password" required :hint="passwordHint">
          <input id="cu-pass" v-model="create.password" type="password" autocomplete="new-password" class="field">
        </UiField>
        <p v-if="createError" class="text-sm text-negative" role="alert">{{ createError }}</p>
      </form>
      <template #footer>
        <UiButton variant="light" @click="createOpen = false">Cancel</UiButton>
        <UiButton type="submit" form="create-user" :loading="pending">Create account</UiButton>
      </template>
    </UiModal>

    <UiModal v-model:open="editOpen" title="Edit staff member">
      <form id="edit-user" class="space-y-4" novalidate @submit.prevent="submitEdit">
        <UiField id="eu-name" label="Name" required><input id="eu-name" v-model="edit.name" class="field" maxlength="120"></UiField>
        <UiField id="eu-role" label="Role" :hint="edit.id === me?.id ? 'You cannot change your own role.' : undefined">
          <select id="eu-role" v-model="edit.roleId" class="field" :disabled="edit.id === me?.id"><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option></select>
        </UiField>
      </form>
      <template #footer>
        <UiButton variant="light" @click="editOpen = false">Cancel</UiButton>
        <UiButton type="submit" form="edit-user" :loading="pending" :disabled="!edit.name.trim()">Save</UiButton>
      </template>
    </UiModal>

    <UiModal v-model:open="resetOpen" :title="`Reset password for ${reset.name}`" description="They will be signed out everywhere and must use the new password.">
      <form id="reset-user" class="space-y-4" novalidate @submit.prevent="submitReset">
        <UiField id="ru-pass" label="New password" required :hint="passwordHint">
          <input id="ru-pass" v-model="reset.password" type="password" autocomplete="new-password" class="field">
        </UiField>
        <p v-if="resetError" class="text-sm text-negative" role="alert">{{ resetError }}</p>
      </form>
      <template #footer>
        <UiButton variant="light" @click="resetOpen = false">Cancel</UiButton>
        <UiButton type="submit" form="reset-user" :loading="pending">Reset password</UiButton>
      </template>
    </UiModal>
  </div>
</template>
