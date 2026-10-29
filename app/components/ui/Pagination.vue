<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const page = defineModel<number>('page', { required: true })
const props = defineProps<{ total: number, pageSize: number }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : (page.value - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.total, page.value * props.pageSize))
</script>

<template>
  <nav class="flex items-center justify-between gap-3 pt-3 text-[13px] text-ink-muted" aria-label="Pagination">
    <span class="num">{{ from }}–{{ to }} of {{ total }}</span>
    <div class="flex items-center gap-1">
      <UiIconButton :icon="ChevronLeft" label="Previous page" size="sm" :class="page <= 1 ? 'pointer-events-none opacity-40' : ''" @click="page > 1 && (page = page - 1)" />
      <span class="num px-2">{{ page }} / {{ pages }}</span>
      <UiIconButton :icon="ChevronRight" label="Next page" size="sm" :class="page >= pages ? 'pointer-events-none opacity-40' : ''" @click="page < pages && (page = page + 1)" />
    </div>
  </nav>
</template>
