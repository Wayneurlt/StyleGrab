<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="no-print pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
    <TransitionGroup enter-from-class="-translate-y-2 opacity-0" leave-to-class="opacity-0" enter-active-class="transition" leave-active-class="transition">
      <div v-for="t in toasts" :key="t.id" class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-sand-200 bg-white/90 px-4 py-3 text-sm shadow-glass backdrop-blur-xl">
        <CheckCircle2 v-if="t.kind === 'success'" class="mt-0.5 size-4 shrink-0 text-positive" />
        <XCircle v-else-if="t.kind === 'error'" class="mt-0.5 size-4 shrink-0 text-negative" />
        <Info v-else class="mt-0.5 size-4 shrink-0 text-info" />
        <p class="flex-1 text-ink">{{ t.message }}</p>
        <button type="button" class="text-ink-muted hover:text-ink" aria-label="Dismiss" @click="dismiss(t.id)"><X class="size-4" /></button>
      </div>
    </TransitionGroup>
  </div>
  <UiConfirmHost />
</template>
