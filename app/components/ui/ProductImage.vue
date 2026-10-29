<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'

/** Uploaded product image with a neutral fallback when none exists yet (no stock photography). */
withDefaults(defineProps<{ imageKey?: string | null, alt: string, rounded?: string, aspect?: string, eager?: boolean }>(), { rounded: 'rounded-2xl', aspect: 'aspect-square' })
</script>

<template>
  <div class="relative overflow-hidden bg-gradient-to-br from-sand-100 to-sand-200" :class="[rounded, aspect]">
    <img v-if="imageKey" :src="`/media/${imageKey}`" :alt="alt" :loading="eager ? 'eager' : 'lazy'" decoding="async" class="absolute inset-0 size-full object-cover">
    <div v-else class="absolute inset-0 flex items-center justify-center text-sand-400" role="img" :aria-label="`${alt} — no image yet`">
      <ImageOff class="size-1/4 max-h-8 max-w-8" aria-hidden="true" />
    </div>
  </div>
</template>
