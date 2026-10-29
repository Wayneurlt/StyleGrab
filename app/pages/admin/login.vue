<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Staff sign in' })

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const pending = ref(false)
const route = useRoute()
const { load } = useStaff()

async function submit() {
  error.value = null
  pending.value = true
  try {
    await apiFetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await load(true)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/admin') ? route.query.next : '/admin'
    await navigateTo(next)
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="sg-backdrop flex min-h-screen items-center justify-center p-4">
    <div class="glass-shell w-full max-w-md p-8 sm:p-10">
      <div class="mb-8 flex flex-col items-center text-center">
        <UiLogo variant="full" class="h-32" />
        <p class="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-accent-dark">Staff workspace</p>
      </div>
      <div class="gold-rule mb-8" />
      <h1 class="font-display text-3xl font-semibold text-ink">Welcome back</h1>
      <p class="mt-1 text-sm text-ink-soft">Sign in to manage sales, stock and orders.</p>
      <form class="mt-8 space-y-4" novalidate @submit.prevent="submit">
        <UiField id="email" label="Email">
          <input id="email" v-model="email" type="email" autocomplete="username" required class="field">
        </UiField>
        <UiField id="password" label="Password">
          <input id="password" v-model="password" type="password" autocomplete="current-password" required class="field">
        </UiField>
        <p v-if="error" class="rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative" role="alert">{{ error }}</p>
        <UiButton type="submit" block size="lg" :loading="pending" :disabled="!email || !password">Sign in</UiButton>
      </form>
    </div>
  </div>
</template>
