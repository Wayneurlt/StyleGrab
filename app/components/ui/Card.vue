<script setup lang="ts">
withDefaults(defineProps<{ title?: string, subtitle?: string, padded?: boolean, tag?: string }>(), { padded: true, tag: 'section' })
</script>

<template>
  <component :is="tag" class="glass-card" :class="padded ? 'p-5' : ''">
    <header v-if="title || $slots.actions" class="mb-4 flex flex-wrap items-start justify-between gap-3" :class="padded ? '' : 'px-5 pt-5'">
      <div>
        <h2 v-if="title" class="text-[15px] font-medium text-ink">{{ title }}</h2>
        <p v-if="subtitle" class="mt-0.5 text-[13px] text-ink-muted">{{ subtitle }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
    </header>
    <slot />
  </component>
</template>
