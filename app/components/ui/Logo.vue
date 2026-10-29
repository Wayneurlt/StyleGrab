<script setup lang="ts">
/** Brand logo that switches to the light artwork in dark mode. */
withDefaults(defineProps<{ variant?: 'lockup' | 'mark' | 'full', alt?: string }>(), { variant: 'lockup', alt: 'StyleGrab' })
</script>

<template>
  <span class="inline-flex">
    <img :src="variant === 'mark' ? '/logo-mark.png' : variant === 'full' ? '/logo.png' : '/logo-lockup.png'" :alt="alt" class="h-full w-auto dark:hidden" v-bind="$attrs">
    <img :src="variant === 'mark' ? '/logo-mark-light.png' : '/logo-lockup-light.png'" :alt="alt" class="hidden h-full w-auto dark:block" v-bind="$attrs">
  </span>
</template>
