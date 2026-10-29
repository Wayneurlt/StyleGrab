<script setup lang="ts">
import { ChevronDown, Store } from 'lucide-vue-next'
import type { NavSection } from '~/utils/adminNav'

/**
 * Main admin navigation.
 * Expanded: logo + labels; sections with sub-pages open like an accordion (the current section opens itself).
 * Collapsed: icon rail; hovering or focusing a section shows a fly-out with its sub-pages.
 */
const props = defineProps<{ sections: NavSection[], currentKey?: string, collapsed?: boolean }>()
const route = useRoute()

const open = ref<Set<string>>(new Set(props.currentKey ? [props.currentKey] : []))
watch(() => props.currentKey, (k) => {
  if (k) open.value = new Set([...open.value, k])
})
function toggle(key: string) {
  const next = new Set(open.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  open.value = next
}

function tabActive(t: { to: string, exact?: boolean }) {
  const path = t.to.split('?')[0]!
  return t.exact ? route.path === path : route.path === path || route.path.startsWith(`${path}/`)
}

// Fly-out for the collapsed rail (fixed-positioned so the scrolling list never clips it).
const fly = ref<{ section: NavSection, top: number } | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | undefined
function showFly(e: Event, s: NavSection) {
  if (!props.collapsed) return
  clearTimeout(hideTimer)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  fly.value = { section: s, top: r.top }
}
function hideFly() {
  hideTimer = setTimeout(() => (fly.value = null), 120)
}
watch(() => [props.collapsed, route.fullPath], () => (fly.value = null))
// Keep the fly-out on screen near the bottom of the viewport.
const flyTop = computed(() => (fly.value ? Math.max(8, Math.min(fly.value.top, window.innerHeight - 60 - fly.value.section.tabs.length * 36)) : 0))
</script>

<template>
  <div class="flex h-full flex-col bg-coal text-chalk">
    <!-- Brand -->
    <NuxtLink to="/admin" class="flex h-20 shrink-0 items-center justify-center border-b border-chalk/10 px-4" aria-label="StyleGrab — overview">
      <img v-if="collapsed" src="/logo-mark-light.png" alt="StyleGrab" class="h-8 w-auto">
      <img v-else src="/logo-lockup-light.png" alt="StyleGrab" class="h-14 w-auto">
    </NuxtLink>

    <div v-if="$slots.top" class="shrink-0 px-3.5 pt-4"><slot name="top" /></div>

    <!-- Sections -->
    <nav class="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden py-4" :class="collapsed ? 'px-3' : 'px-3.5'" aria-label="Main">
      <p v-if="!collapsed" class="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-chalk/40">Workspace</p>
      <ul class="space-y-1">
        <li v-for="s in sections" :key="s.key" @mouseenter="showFly($event, s)" @mouseleave="hideFly">
          <div class="group relative flex items-center">
            <NuxtLink
              :to="s.to"
              class="relative flex h-11 flex-1 items-center rounded-xl text-sm font-medium transition"
              :class="[
                collapsed ? 'justify-center' : 'gap-3 px-3',
                currentKey === s.key ? 'bg-chalk/[0.08] text-accent-light' : 'text-chalk/70 hover:bg-chalk/[0.06] hover:text-chalk',
              ]"
              :aria-label="collapsed ? s.label : undefined"
              :aria-current="currentKey === s.key ? 'page' : undefined"
              @focus="showFly($event, s)"
              @blur="hideFly"
            >
              <span v-if="currentKey === s.key" class="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent-light" aria-hidden="true" />
              <component :is="s.icon" class="size-[18px] shrink-0" aria-hidden="true" />
              <span v-if="!collapsed" class="truncate">{{ s.label }}</span>
            </NuxtLink>
            <button
              v-if="!collapsed && s.tabs.length > 1"
              type="button"
              class="absolute right-1 flex size-9 items-center justify-center rounded-lg text-chalk/50 transition hover:bg-chalk/10 hover:text-chalk"
              :aria-expanded="open.has(s.key)"
              :aria-controls="`nav-${s.key}`"
              :aria-label="`${open.has(s.key) ? 'Collapse' : 'Expand'} ${s.label}`"
              @click="toggle(s.key)"
            >
              <ChevronDown class="size-4 transition-transform duration-200" :class="open.has(s.key) ? 'rotate-180' : ''" />
            </button>
          </div>

          <!-- Sub-pages (accordion) -->
          <div
            v-if="!collapsed && s.tabs.length > 1"
            :id="`nav-${s.key}`"
            class="grid transition-[grid-template-rows] duration-300 ease-out"
            :class="open.has(s.key) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
          >
            <ul class="overflow-hidden">
              <li v-for="t in s.tabs" :key="t.to" class="relative ml-[1.35rem] border-l border-chalk/10 pl-3 first:mt-1 last:mb-1">
                <NuxtLink
                  :to="t.to"
                  :tabindex="open.has(s.key) ? 0 : -1"
                  class="flex h-9 items-center rounded-lg px-3 text-[13px] transition"
                  :class="tabActive(t) ? 'bg-accent/15 font-medium text-accent-light' : 'text-chalk/55 hover:bg-chalk/[0.05] hover:text-chalk'"
                  :aria-current="tabActive(t) ? 'page' : undefined"
                >{{ t.label }}</NuxtLink>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </nav>

    <!-- Footer -->
    <div class="shrink-0 border-t border-chalk/10 p-3">
      <NuxtLink
        to="/"
        class="flex h-10 items-center rounded-xl text-[13px] text-chalk/60 transition hover:bg-chalk/[0.06] hover:text-chalk"
        :class="collapsed ? 'justify-center' : 'gap-3 px-3'"
        :aria-label="collapsed ? 'View storefront' : undefined"
      >
        <Store class="size-4 shrink-0" aria-hidden="true" />
        <span v-if="!collapsed">View storefront</span>
      </NuxtLink>
    </div>

    <!-- Collapsed fly-out -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0 -translate-x-1" leave-to-class="opacity-0" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
        <div
          v-if="collapsed && fly"
          class="fixed left-[84px] z-[60] min-w-[12rem] rounded-2xl border border-accent/30 bg-coal p-1.5 text-chalk shadow-pill"
          :style="{ top: `${flyTop}px` }"
          @mouseenter="showFly($event, fly.section)"
          @mouseleave="hideFly"
        >
          <p class="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-accent-light">{{ fly.section.label }}</p>
          <NuxtLink
            v-for="t in fly.section.tabs"
            :key="t.to"
            :to="t.to"
            class="flex h-9 items-center rounded-lg px-3 text-[13px] transition"
            :class="tabActive(t) ? 'bg-accent/15 text-accent-light' : 'text-chalk/70 hover:bg-chalk/[0.07] hover:text-chalk'"
          >{{ t.label }}</NuxtLink>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
