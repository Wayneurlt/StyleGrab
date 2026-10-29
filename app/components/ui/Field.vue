<script setup lang="ts">
/** Label + control + hint/error wrapper. Pass the control in the default slot with the same `id`. */
defineProps<{ label: string, id: string, error?: string | null, hint?: string, required?: boolean }>()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="label block">{{ label }}<span v-if="required" class="text-negative" aria-hidden="true"> *</span></label>
    <slot />
    <p v-if="error" :id="`${id}-error`" class="text-xs font-medium text-negative" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="`${id}-hint`" class="text-xs text-ink-muted">{{ hint }}</p>
  </div>
</template>
