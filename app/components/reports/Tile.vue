<script setup lang="ts">
defineProps<{ label: string, value: string, hint?: string, accent?: boolean }>()
</script>

<template>
  <div :class="accent ? 'accent-card' : 'rounded-3xl border border-sand-200 bg-sand-50'" class="p-4">
    <p class="text-[13px]" :class="accent ? 'text-white/90' : 'text-ink-soft'">{{ label }}</p>
    <p class="num mt-3 text-xl font-semibold sm:text-2xl">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-[11px]" :class="accent ? 'text-white/80' : 'text-ink-muted'">{{ hint }}</p>
  </div>
</template>
