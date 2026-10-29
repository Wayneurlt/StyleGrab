<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(defineProps<{ icon: Component, label: string, active?: boolean, size?: 'sm' | 'md', to?: string, variant?: 'white' | 'glass' | 'dark' }>(), { size: 'md', variant: 'glass' })
</script>

<template>
  <component
    :is="to ? resolveComponent('NuxtLink') : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    :aria-label="label"
    :title="label"
    class="inline-flex shrink-0 items-center justify-center rounded-full transition"
    :class="[
      size === 'sm' ? 'size-8' : 'size-10',
      active || variant === 'white' ? 'bg-white text-ink shadow-lift' : variant === 'dark' ? 'bg-ink text-white hover:bg-ink-soft' : 'text-ink-soft hover:bg-sand-100 hover:text-ink',
    ]"
  >
    <component :is="icon" :class="size === 'sm' ? 'size-4' : 'size-[18px]'" aria-hidden="true" />
  </component>
</template>
