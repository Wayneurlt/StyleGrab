<script setup lang="ts">
import { X } from 'lucide-vue-next'

const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{ title: string, description?: string, size?: 'sm' | 'md' | 'lg' | 'xl', persistent?: boolean }>(), { size: 'md' })
const panel = ref<HTMLElement | null>(null)
const titleId = useId()
let previouslyFocused: HTMLElement | null = null

function close() {
  if (!props.persistent) open.value = false
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') close()
  if (e.key === 'Tab' && panel.value) {
    // Keep focus inside the dialog.
    const els = panel.value.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')
    if (!els.length) return
    const first = els[0]!
    const last = els[els.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    }
    else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(open, async (v) => {
  if (!import.meta.client) return
  if (v) {
    previouslyFocused = document.activeElement as HTMLElement
    await nextTick()
    const target = panel.value?.querySelector<HTMLElement>('[autofocus],input,select,textarea,button:not([data-close])')
    target?.focus()
  }
  else previouslyFocused?.focus?.()
})

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center bg-sand-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-4" @mousedown.self="close">
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-4xl border border-sand-200 bg-white/95 shadow-glass backdrop-blur-glass sm:rounded-4xl"
          :class="{ sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size]"
        >
          <header class="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <h2 :id="titleId" class="text-lg font-semibold tracking-tight">{{ title }}</h2>
              <p v-if="description" class="mt-1 text-sm text-ink-muted">{{ description }}</p>
            </div>
            <button v-if="!persistent" data-close type="button" class="rounded-full p-2 text-ink-muted hover:bg-white/70 hover:text-ink" aria-label="Close" @click="open = false">
              <X class="size-4" />
            </button>
          </header>
          <div class="scrollbar-thin overflow-y-auto px-6 py-3"><slot /></div>
          <footer v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-sand-200 px-6 py-4"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
