<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import type { Component } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'dark' | 'light' | 'accent' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  icon?: Component
  to?: string
  block?: boolean
}>(), { variant: 'dark', size: 'md', type: 'button' })

const classes = computed(() => [
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  props.block ? 'w-full' : '',
  { sm: 'h-9 px-4 text-[13px]', md: 'h-11 px-5 text-sm', lg: 'h-12 px-7 text-[15px]' }[props.size],
  {
    dark: 'bg-ink text-white shadow-pill hover:bg-ink-soft',
    light: 'border border-sand-200 bg-white text-ink shadow-lift hover:border-accent/60',
    accent: 'bg-accent-light text-ink shadow-pill hover:bg-accent',
    ghost: 'text-ink hover:bg-sand-100',
    danger: 'bg-negative text-white shadow-pill hover:brightness-95',
  }[props.variant],
])
</script>

<template>
  <NuxtLink v-if="to && !disabled" :to="to" :class="classes">
    <component :is="icon" v-if="icon" class="size-4" aria-hidden="true" />
    <slot />
  </NuxtLink>
  <button v-else :type="type" :class="classes" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <Loader2 v-if="loading" class="size-4 animate-spin" aria-hidden="true" />
    <component :is="icon" v-else-if="icon" class="size-4" aria-hidden="true" />
    <slot />
  </button>
</template>
