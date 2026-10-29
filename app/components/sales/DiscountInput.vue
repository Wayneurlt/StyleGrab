<script setup lang="ts">
import type { Discount } from './CartLines.vue'

/** Fixed amount or percentage (entered as %, stored as basis points). */
const model = defineModel<Discount | null>({ required: true })
defineProps<{ id: string }>()
const type = computed({
  get: () => model.value?.type ?? 'FIXED',
  set: (t: 'FIXED' | 'PERCENT') => (model.value = { type: t, value: 0 }),
})
function setPercent(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  model.value = { type: 'PERCENT', value: Number.isFinite(n) ? Math.max(0, Math.min(10_000, Math.round(n * 100))) : 0 }
}
</script>

<template>
  <div class="flex gap-2">
    <select v-model="type" class="field w-24" aria-label="Discount type">
      <option value="FIXED">Amount</option>
      <option value="PERCENT">%</option>
    </select>
    <input v-if="type === 'PERCENT'" :id="id" :value="(model?.value ?? 0) / 100" type="number" min="0" max="100" step="0.5" class="field num" @input="setPercent">
    <UiMoneyInput v-else :id="id" :model-value="model?.value ?? 0" @update:model-value="(v) => (model = v ? { type: 'FIXED', value: v } : null)" />
  </div>
</template>
