<script setup lang="ts">
import { parseMoney, toMajorString } from '#shared/money'

/** Major-unit text input bound to a minor-unit integer model. Never uses floating-point maths. */
const model = defineModel<number | null>({ required: true })
const props = defineProps<{ id?: string, placeholder?: string, disabled?: boolean, nullable?: boolean, currency?: string }>()
const text = ref(toMajorString(model.value))
const invalid = ref(false)

watch(model, (v) => {
  if (v !== safeParse(text.value)) text.value = toMajorString(v)
})

function safeParse(s: string): number | null {
  if (!s.trim()) return null
  try {
    const v = parseMoney(s)
    return v < 0 ? null : v
  }
  catch {
    return null
  }
}

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  const v = safeParse(text.value)
  invalid.value = !!text.value.trim() && v == null
  if (!invalid.value) model.value = v ?? (props.nullable ? null : 0)
}
</script>

<template>
  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-xs font-medium text-ink-muted">{{ currency ?? 'KES' }}</span>
    <input
      :id="id"
      :value="text"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      class="field num pl-12"
      :class="invalid ? 'border-negative/60 ring-2 ring-negative/20' : ''"
      :placeholder="placeholder ?? '0.00'"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      @input="onInput"
      @blur="!invalid && (text = toMajorString(model))"
    >
  </div>
</template>
