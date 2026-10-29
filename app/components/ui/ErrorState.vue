<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

defineProps<{ error: unknown }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-10 text-center" role="alert">
    <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-negative-tint text-negative"><AlertTriangle class="size-5" /></div>
    <p class="font-medium">Couldn't load this</p>
    <p class="mt-1 max-w-sm text-sm text-ink-muted">{{ apiError(error) }}</p>
    <UiButton class="mt-4" variant="light" size="sm" @click="$emit('retry')">Try again</UiButton>
  </div>
</template>
