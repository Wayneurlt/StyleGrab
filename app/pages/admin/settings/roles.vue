<script setup lang="ts">
import { Lock } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Roles' })

const { confirm } = useConfirm()
const { pending, run } = useAction()
const { data, error, status, refresh } = useFetch('/api/admin/roles', { server: false })

const GROUP_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', catalog: 'Catalogue', inventory: 'Inventory', pos: 'Point of sale', shifts: 'Cash shifts', orders: 'Orders', payments: 'Payments',
  returns: 'Returns', customers: 'Customers', suppliers: 'Suppliers', purchasing: 'Purchasing', reports: 'Reports', users: 'Staff', settings: 'Settings', audit: 'Audit',
}
const groups = computed(() => {
  const g: Record<string, { key: string, description: string }[]> = {}
  for (const [key, description] of Object.entries(data.value?.permissions ?? {})) {
    const prefix = key.split('.')[0]!
    ;(g[prefix] ??= []).push({ key, description: description as string })
  }
  return Object.entries(g)
})

const drafts = ref<Record<string, string[]>>({})
watch(data, (d) => {
  drafts.value = Object.fromEntries((d?.roles ?? []).map(r => [r.id, [...r.permissions]]))
}, { immediate: true })

function toggle(roleId: string, perm: string) {
  const list = drafts.value[roleId] ?? []
  drafts.value[roleId] = list.includes(perm) ? list.filter(p => p !== perm) : [...list, perm]
}
function dirty(roleId: string, original: string[]) {
  const d = drafts.value[roleId] ?? []
  return d.length !== original.length || d.some(p => !original.includes(p))
}

async function save(role: { id: string, name: string }) {
  if (!(await confirm({ title: `Update ${role.name} permissions?`, message: 'Changes apply immediately to everyone with this role.', confirmLabel: 'Save permissions' }))) return
  const ok = await run(() => apiFetch(`/api/admin/roles/${role.id}`, { method: 'PUT', body: { permissions: drafts.value[role.id] ?? [] } }), { success: `${role.name} updated` })
  if (ok) await refresh()
}
</script>

<template>
  <div>
    <UiPageHeader title="Roles" subtitle="What each role may do. Permissions are enforced by the server on every request." :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Roles' }]" />
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !data" :rows="4" height="h-40" />
    <div v-else-if="data" class="space-y-5">
      <UiCard v-for="role in data.roles" :key="role.id" :title="role.name" :subtitle="`${role.description ?? ''} · ${role._count.users} staff`">
        <template #actions>
          <span v-if="role.key === 'owner'" class="inline-flex items-center gap-1 text-xs text-ink-muted"><Lock class="size-3.5" />Always full access</span>
          <UiButton v-else size="sm" :disabled="!dirty(role.id, role.permissions)" :loading="pending" @click="save(role)">Save</UiButton>
        </template>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <fieldset v-for="[prefix, perms] in groups" :key="prefix" class="rounded-2xl bg-sand-50 p-3" :disabled="role.key === 'owner'">
            <legend class="sr-only">{{ GROUP_LABELS[prefix] ?? prefix }}</legend>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted" aria-hidden="true">{{ GROUP_LABELS[prefix] ?? prefix }}</p>
            <label v-for="p in perms" :key="p.key" class="flex items-start gap-2 py-1 text-[13px]">
              <input type="checkbox" class="mt-0.5 size-4 accent-ink" :checked="role.key === 'owner' || (drafts[role.id] ?? []).includes(p.key)" @change="toggle(role.id, p.key)">
              <span>{{ p.description }}</span>
            </label>
          </fieldset>
        </div>
      </UiCard>
    </div>
  </div>
</template>
