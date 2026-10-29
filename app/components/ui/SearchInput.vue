<script setup lang="ts">
import { Search } from 'lucide-vue-next'

/** Debounced search box (pill style, as in the "Recent Activities" header of the reference). */
const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{ placeholder?: string, debounce?: number, label?: string }>(), { placeholder: 'Search', debounce: 300 })
const text = ref(model.value)
let t: ReturnType<typeof setTimeout> | undefined
watch(text, (v) => {
  clearTimeout(t)
  t = setTimeout(() => (model.value = v.trim()), props.debounce)
})
watch(model, (v) => {
  if (v !== text.value.trim()) text.value = v
})
</script>

<template>
  <label class="relative flex h-10 min-w-0 items-center">
    <span class="sr-only">{{ label ?? placeholder }}</span>
    <Search class="pointer-events-none absolute left-3.5 size-4 text-ink-muted" aria-hidden="true" />
    <input v-model="text" type="search" :placeholder="placeholder" class="h-10 w-full rounded-full border border-sand-200 bg-sand-50 pl-10 pr-4 text-sm outline-none placeholder:text-ink-muted focus:bg-white/85 focus:ring-2 focus:ring-ink/10">
  </label>
</template>
