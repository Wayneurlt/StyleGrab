<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import type { Component } from 'vue'

defineProps<{ title: string, message?: string, icon?: Component }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-white/70 text-ink-muted shadow-lift">
      <component :is="icon ?? Inbox" class="size-5" aria-hidden="true" />
    </div>
    <p class="font-medium text-ink">{{ title }}</p>
    <p v-if="message" class="mt-1 max-w-sm text-sm text-ink-muted">{{ message }}</p>
    <div v-if="$slots.default" class="mt-4"><slot /></div>
  </div>
</template>
