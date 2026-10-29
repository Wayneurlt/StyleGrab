<script setup lang="ts">
/** Date range with presets (today / 7 days / this month / custom). Dates are in the business timezone. */
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })
const { today, daysAgo } = useFormat()

const presets = computed(() => [
  { value: 'today', label: 'Today', from: today(), to: today() },
  { value: '7d', label: '7 days', from: daysAgo(6), to: today() },
  { value: 'month', label: 'This month', from: `${today().slice(0, 7)}-01`, to: today() },
])
const preset = ref(presets.value.find(p => p.from === from.value && p.to === to.value)?.value ?? 'custom')
watch(preset, (v) => {
  const p = presets.value.find(x => x.value === v)
  if (p) {
    from.value = p.from
    to.value = p.to
  }
})
const tabs = computed(() => [...presets.value.map(p => ({ value: p.value, label: p.label })), { value: 'custom', label: 'Custom' }])
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UiTabs v-model="preset" :tabs="tabs" label="Date range" />
    <div v-if="preset === 'custom'" class="flex items-center gap-2">
      <label class="sr-only" for="range-from">From</label>
      <input id="range-from" v-model="from" type="date" :max="to" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-3 text-sm">
      <span class="text-sm text-ink-muted">to</span>
      <label class="sr-only" for="range-to">To</label>
      <input id="range-to" v-model="to" type="date" :min="from" :max="today()" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-3 text-sm">
    </div>
  </div>
</template>
