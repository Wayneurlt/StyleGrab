<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'My account' })

const { me } = useStaff()
const toast = useToast()
const { pending, run } = useAction()
const form = reactive({ current: '', next: '', confirm: '' })
const error = ref<string | null>(null)

async function submit() {
  error.value = null
  if (form.next.length < 10 || !/[a-zA-Z]/.test(form.next) || !/\d/.test(form.next)) return (error.value = 'New password must be at least 10 characters, with letters and numbers.')
  if (form.next !== form.confirm) return (error.value = 'The new passwords do not match.')
  const ok = await run(() => apiFetch('/api/auth/password', { method: 'POST', body: { current: form.current, next: form.next } }))
  if (ok) {
    toast.success('Password changed. Please sign in again.')
    me.value = null
    useState('staff-loaded').value = false
    await navigateTo('/admin/login')
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="My account" :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'My account' }]" />
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <UiCard title="Profile">
        <dl v-if="me" class="space-y-3 text-sm">
          <div class="flex justify-between gap-4"><dt class="text-ink-muted">Name</dt><dd class="font-medium">{{ me.name }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-ink-muted">Email</dt><dd class="font-medium">{{ me.email }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-ink-muted">Role</dt><dd class="font-medium">{{ me.role.name }}</dd></div>
        </dl>
        <p class="mt-4 text-xs text-ink-muted">Ask an owner to change your name or role.</p>
      </UiCard>
      <UiCard title="Change password" subtitle="You will be signed out of every device.">
        <form class="space-y-4" novalidate @submit.prevent="submit">
          <UiField id="pw-current" label="Current password" required><input id="pw-current" v-model="form.current" type="password" autocomplete="current-password" class="field"></UiField>
          <UiField id="pw-next" label="New password" required hint="At least 10 characters, with letters and numbers."><input id="pw-next" v-model="form.next" type="password" autocomplete="new-password" class="field"></UiField>
          <UiField id="pw-confirm" label="Confirm new password" required><input id="pw-confirm" v-model="form.confirm" type="password" autocomplete="new-password" class="field"></UiField>
          <p v-if="error" class="text-sm text-negative" role="alert">{{ error }}</p>
          <UiButton type="submit" :loading="pending" :disabled="!form.current || !form.next">Change password</UiButton>
        </form>
      </UiCard>
    </div>
  </div>
</template>
