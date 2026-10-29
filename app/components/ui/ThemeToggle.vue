<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'

const { isDark, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="relative flex size-10 items-center justify-center overflow-hidden rounded-full text-ink/80 transition hover:text-ink"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    :title="isDark ? 'Light mode' : 'Dark mode'"
    @click="toggle"
  >
    <ClientOnly>
      <Transition enter-from-class="rotate-90 opacity-0" leave-to-class="-rotate-90 opacity-0" enter-active-class="transition duration-300" leave-active-class="absolute transition duration-200">
        <Sun v-if="isDark" key="sun" class="size-[18px]" />
        <Moon v-else key="moon" class="size-[18px]" />
      </Transition>
      <template #fallback><Moon class="size-[18px]" /></template>
    </ClientOnly>
  </button>
</template>
