<script setup lang="ts">
import { ArrowDown, ArrowUp } from 'lucide-vue-next'

/** Small change pill (e.g. "↑ 7%") as used under the reference stat cards. */
defineProps<{ value: number | null, onDark?: boolean }>()
</script>

<template>
  <span
    v-if="value != null"
    class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
    :class="onDark ? 'bg-white/20 text-white' : value >= 0 ? 'bg-positive-tint text-positive' : 'bg-negative-tint text-negative'"
  >
    <component :is="value >= 0 ? ArrowUp : ArrowDown" class="size-3" aria-hidden="true" />{{ Math.abs(value).toFixed(0) }}%
  </span>
</template>
