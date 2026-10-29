<script setup lang="ts">
/** In-page segmented control, styled like the reference's bottom pill tab bar. */
const model = defineModel<string>({ required: true })
defineProps<{ tabs: { value: string, label: string, count?: number }[], label?: string }>()
</script>

<template>
  <div class="glass-pill inline-flex max-w-full gap-1 overflow-x-auto p-1" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.value"
      type="button"
      role="tab"
      :aria-selected="model === t.value"
      class="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition"
      :class="model === t.value ? 'bg-white text-ink shadow-lift' : 'text-ink-soft hover:text-ink'"
      @click="model = t.value"
    >
      {{ t.label }}
      <span v-if="t.count" class="num rounded-full bg-ink/10 px-1.5 text-[11px]">{{ t.count }}</span>
    </button>
  </div>
</template>
