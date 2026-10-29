<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: notFound.value ? 'Not found' : 'Something went wrong' })
const route = useRoute()
const home = computed(() => (route.path.startsWith('/admin') ? '/admin' : '/'))
</script>

<template>
  <div class="sg-backdrop flex min-h-screen items-center justify-center p-4">
    <div class="glass-shell max-w-md p-10 text-center">
      <UiLogo variant="mark" class="mx-auto mb-6 h-12" />
      <p class="num font-display text-6xl font-semibold">{{ error.statusCode }}</p>
      <h1 class="mt-3 text-xl font-semibold">{{ notFound ? 'We couldn’t find that page' : 'Something went wrong' }}</h1>
      <p class="mt-2 text-sm text-ink-soft">{{ notFound ? 'It may have moved or is no longer available.' : 'Please try again in a moment.' }}</p>
      <UiButton class="mt-6" @click="clearError({ redirect: home })">Go back home</UiButton>
    </div>
  </div>
</template>
