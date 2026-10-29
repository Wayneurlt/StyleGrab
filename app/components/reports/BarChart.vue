<script setup lang="ts">
/** Simple hatched-bar chart in the dashboard's visual language. Values are minor units. */
const props = defineProps<{ points: { label: string, value: number, hint?: string }[] }>()
const { money } = useFormat()
const max = computed(() => Math.max(1, ...props.points.map(p => p.value)))
const step = computed(() => Math.max(1, Math.ceil(props.points.length / 12)))
</script>

<template>
  <div class="glass-inner p-4">
    <div class="flex h-48 items-end gap-1">
      <div v-for="(p, i) in points" :key="p.label" class="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
        <div class="hatch w-full max-w-[28px] rounded-md" :style="{ height: `${(p.value / max) * 100}%`, minHeight: p.value ? '3px' : '0' }" />
        <div class="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white shadow-lift group-hover:block">
          {{ p.label }}: {{ money(p.value) }}<template v-if="p.hint"> · {{ p.hint }}</template>
        </div>
        <span class="mt-1 h-4 truncate text-[10px] text-ink-muted">{{ i % step === 0 ? p.label : '' }}</span>
      </div>
    </div>
    <p class="sr-only"><span v-for="p in points" :key="p.label">{{ p.label }}: {{ money(p.value) }}; </span></p>
  </div>
</template>
