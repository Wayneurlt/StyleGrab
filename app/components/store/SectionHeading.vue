<script setup lang="ts">
withDefaults(defineProps<{ eyebrow?: string, title: string, subtitle?: string, align?: 'center' | 'left' }>(), { align: 'center' })
</script>

<template>
  <div :class="align === 'center' ? 'mx-auto max-w-2xl text-center' : ''" data-aos="fade-up">
    <p v-if="eyebrow" class="text-[15px] font-semibold text-accent-dark">{{ eyebrow }}</p>
    <h2 class="mt-1 text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-5xl">{{ title }}</h2>
    <p v-if="subtitle" class="mt-4 text-[19px] leading-relaxed text-ink-muted">{{ subtitle }}</p>
  </div>
</template>
