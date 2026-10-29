<script setup lang="ts">
import type { Tone } from '#shared/labels'

withDefaults(defineProps<{ tone?: Tone, dot?: boolean }>(), { tone: 'neutral' })
</script>

<template>
  <span
    v-if="dot"
    class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium"
    :class="{ neutral: 'text-ink-muted', success: 'text-positive', warning: 'text-caution', danger: 'text-negative', info: 'text-info', accent: 'text-accent-dark' }[tone]"
  >
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    <span class="text-ink-soft"><slot /></span>
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
    :class="{ neutral: 'bg-white/70 text-ink-soft', success: 'bg-positive-tint text-positive', warning: 'bg-caution-tint text-caution', danger: 'bg-negative-tint text-negative', info: 'bg-info-tint text-info', accent: 'bg-accent-tint text-accent-dark' }[tone]"
  >
    <slot />
  </span>
</template>
