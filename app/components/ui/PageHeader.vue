<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

defineProps<{ title: string, subtitle?: string, crumbs?: { label: string, to?: string }[] }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <nav v-if="crumbs?.length" aria-label="Breadcrumb" class="mb-2">
        <ol class="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
          <li v-for="(c, i) in crumbs" :key="i" class="flex items-center gap-1">
            <NuxtLink v-if="c.to" :to="c.to" class="hover:text-ink">{{ c.label }}</NuxtLink>
            <span v-else aria-current="page" class="text-ink-soft">{{ c.label }}</span>
            <ChevronRight v-if="i < crumbs.length - 1" class="size-3.5" aria-hidden="true" />
          </li>
        </ol>
      </nav>
      <h1 class="break-words font-display text-[1.75rem] sm:truncate sm:text-[1.9rem] font-semibold leading-tight text-ink md:text-display">{{ title }}</h1>
      <p v-if="subtitle" class="mt-2 text-sm text-ink-soft/80">{{ subtitle }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2"><slot /></div>
  </div>
</template>
