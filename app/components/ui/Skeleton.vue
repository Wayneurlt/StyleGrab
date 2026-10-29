<script setup lang="ts">
withDefaults(defineProps<{ rows?: number, height?: string }>(), { rows: 4, height: 'h-11' })
</script>

<template>
  <div class="space-y-2" aria-hidden="true">
    <div v-for="i in rows" :key="i" class="animate-pulse rounded-xl bg-sand-50" :class="height" />
  </div>
  <span class="sr-only">Loading…</span>
</template>
