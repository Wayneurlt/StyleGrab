<script setup lang="ts">
import { Bell, ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Store, X } from 'lucide-vue-next'
import { NAV, sectionFor } from '~/utils/adminNav'

const route = useRoute()
const { me, can, canAny, logout } = useStaff()

const sections = computed(() => NAV.filter(s => !s.perm || canAny(...s.perm)).map(s => ({ ...s, tabs: s.tabs.filter(t => !t.perm || can(t.perm)) })).filter(s => s.tabs.length))
const current = computed(() => sectionFor(route.path))
const tabs = computed(() => sections.value.find(s => s.key === current.value?.key)?.tabs ?? [])
const plus = computed(() => (current.value?.plus && (!current.value.plus.perm || can(current.value.plus.perm)) ? current.value.plus : null))
const initials = computed(() => (me.value?.name ?? '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase())
const hidesChrome = computed(() => route.meta.chrome === false)

function tabActive(t: { to: string, exact?: boolean }) {
  const path = t.to.split('?')[0]!
  return t.exact ? route.path === path : route.path === path || route.path.startsWith(`${path}/`)
}

// Sidebar state is remembered per browser. Until someone chooses, it starts collapsed on narrower screens
// so page content keeps its room.
const sidebar = useCookie<'expanded' | 'collapsed'>('sg_sidebar', {
  default: () => (import.meta.client && window.innerWidth < 1280 ? 'collapsed' : 'expanded'),
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
})
const collapsed = computed(() => sidebar.value === 'collapsed')
function toggleSidebar() {
  sidebar.value = collapsed.value ? 'expanded' : 'collapsed'
}
function onKey(e: KeyboardEvent) {
  // Ctrl/⌘ + \ toggles the sidebar.
  if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
    e.preventDefault()
    toggleSidebar()
  }
  else if (e.key === 'Escape') {
    mobileNav.value = false
    bellOpen.value = false
    userOpen.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Notifications: things that need someone's attention, from real records.
const { data: alerts, refresh: refreshAlerts } = useFetch('/api/admin/dashboard', {
  key: 'admin-alerts', server: false, lazy: true,
  transform: d => ({ pendingPayments: d.pendingPayments.count, pendingAdjustments: d.pendingAdjustments, low: d.stock.low, out: d.stock.out, openOrders: d.openOrders }),
  immediate: false,
})
onMounted(() => can('dashboard.view') && refreshAlerts())
watch(() => route.path, () => can('dashboard.view') && refreshAlerts())
const alertCount = computed(() => (alerts.value ? alerts.value.pendingPayments + alerts.value.pendingAdjustments + alerts.value.out : 0))

const bellOpen = ref(false)
const userOpen = ref(false)
const mobileNav = ref(false)
watch(() => route.fullPath, () => {
  bellOpen.value = false
  userOpen.value = false
  mobileNav.value = false
})
// Close a menu when focus or a click leaves it.
function closeOnLeave(e: FocusEvent, close: () => void) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) close()
}
</script>

<template>
  <div class="sg-backdrop min-h-screen">
    <!-- Desktop sidebar: fixed, full height, flush to the left edge -->
    <aside
      class="no-print fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 ease-out lg:block"
      :class="collapsed ? 'w-[76px]' : 'w-64'"
    >
      <AdminSidebar :sections="sections" :current-key="current?.key" :collapsed="collapsed" />
    </aside>

    <!-- Everything right of the sidebar fills the remaining width -->
    <div class="sg-print-full flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ease-out" :class="collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'">
      <!-- Top bar -->
      <header class="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-sand-200/80 bg-sand-50/85 px-3 backdrop-blur-xl sm:gap-3 sm:px-5 lg:px-6">
        <button type="button" class="flex size-10 items-center justify-center rounded-xl text-ink hover:bg-white lg:hidden" aria-label="Open navigation" @click="mobileNav = true"><Menu class="size-5" /></button>
        <NuxtLink to="/admin" class="shrink-0 lg:hidden" aria-label="StyleGrab — overview"><UiLogo variant="mark" alt="" class="h-8" /></NuxtLink>
        <button
          type="button"
          class="hidden size-10 shrink-0 items-center justify-center rounded-xl text-ink-soft transition hover:bg-white hover:text-ink lg:flex"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :title="`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+\\)`"
          @click="toggleSidebar"
        >
          <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" class="size-5" />
        </button>

        <AdminCommandBar class="hidden w-full max-w-xl md:block" />

        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
          <UiThemeToggle />
          <!-- Notifications -->
          <div class="relative" @focusout="closeOnLeave($event, () => (bellOpen = false))">
            <button type="button" class="relative flex size-10 items-center justify-center rounded-full border border-sand-200 bg-white text-ink shadow-lift transition hover:border-accent/50" :aria-label="`Notifications${alertCount ? ` (${alertCount})` : ''}`" :aria-expanded="bellOpen" @click="bellOpen = !bellOpen">
              <Bell class="size-[18px]" />
              <span v-if="alertCount" class="absolute right-2 top-2 size-2 rounded-full bg-negative ring-2 ring-white" />
            </button>
            <div v-if="bellOpen" class="absolute right-0 top-12 z-40 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-sand-200 bg-white p-2 text-sm shadow-glass">
              <p class="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Needs attention</p>
              <template v-if="alerts">
                <NuxtLink v-if="alerts.pendingPayments" to="/admin/payments?status=PENDING_CONFIRMATION" class="flex justify-between gap-3 rounded-xl px-2 py-2 hover:bg-sand-50"><span>Payments awaiting confirmation</span><b class="num">{{ alerts.pendingPayments }}</b></NuxtLink>
                <NuxtLink v-if="alerts.pendingAdjustments" to="/admin/inventory/adjustments?status=PENDING_APPROVAL" class="flex justify-between gap-3 rounded-xl px-2 py-2 hover:bg-sand-50"><span>Adjustments to approve</span><b class="num">{{ alerts.pendingAdjustments }}</b></NuxtLink>
                <NuxtLink v-if="alerts.out" to="/admin/inventory?filter=out" class="flex justify-between gap-3 rounded-xl px-2 py-2 hover:bg-sand-50"><span>Out-of-stock variants</span><b class="num">{{ alerts.out }}</b></NuxtLink>
                <NuxtLink v-if="alerts.low" to="/admin/inventory?filter=low" class="flex justify-between gap-3 rounded-xl px-2 py-2 hover:bg-sand-50"><span>Low-stock variants</span><b class="num">{{ alerts.low }}</b></NuxtLink>
                <NuxtLink v-if="alerts.openOrders" to="/admin/orders?status=OPEN" class="flex justify-between gap-3 rounded-xl px-2 py-2 hover:bg-sand-50"><span>Open orders</span><b class="num">{{ alerts.openOrders }}</b></NuxtLink>
                <p v-if="!alertCount && !alerts.low && !alerts.openOrders" class="px-2 py-3 text-ink-muted">All caught up.</p>
              </template>
              <p v-else class="px-2 py-3 text-ink-muted">Nothing to show.</p>
            </div>
          </div>

          <!-- User menu -->
          <div class="relative" @focusout="closeOnLeave($event, () => (userOpen = false))">
            <button type="button" class="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition hover:bg-white sm:pr-3" :aria-expanded="userOpen" aria-haspopup="menu" @click="userOpen = !userOpen">
              <span class="flex size-9 items-center justify-center rounded-full bg-coal text-sm font-semibold text-accent-light ring-2 ring-accent/50">{{ initials }}</span>
              <span class="hidden min-w-0 text-left leading-tight sm:block">
                <span class="block max-w-[10rem] truncate text-sm font-medium">{{ me?.name }}</span>
                <span class="block max-w-[10rem] truncate text-[11px] text-ink-muted">{{ me?.role.name }}</span>
              </span>
              <ChevronDown class="hidden size-4 text-ink-muted sm:block" />
            </button>
            <div v-if="userOpen" role="menu" class="absolute right-0 top-12 z-40 w-[min(15rem,calc(100vw-1.5rem))] rounded-2xl border border-sand-200 bg-white p-1.5 text-sm shadow-glass">
              <div class="px-3 py-2">
                <p class="truncate font-medium">{{ me?.name }}</p>
                <p class="truncate text-xs text-ink-muted">{{ me?.role.name }} · {{ me?.email }}</p>
              </div>
              <NuxtLink role="menuitem" to="/admin/settings/account" class="block rounded-xl px-3 py-2 hover:bg-sand-50">My account</NuxtLink>
              <NuxtLink role="menuitem" to="/" class="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-sand-50"><Store class="size-4" />View storefront</NuxtLink>
              <button role="menuitem" type="button" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-negative hover:bg-negative-tint" @click="logout"><LogOut class="size-4" />Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Section tabs -->
      <div v-if="!hidesChrome && (tabs.length > 1 || plus)" class="no-print sticky top-16 z-20 flex items-center gap-3 border-b border-sand-200/80 bg-sand-50/85 px-3 backdrop-blur-xl sm:px-5 lg:px-6">
        <nav class="scrollbar-none -mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Section">
          <NuxtLink
            v-for="t in tabs"
            :key="t.to"
            :to="t.to"
            class="flex h-12 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-medium transition"
            :class="tabActive(t) ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'"
            :aria-current="tabActive(t) ? 'page' : undefined"
          >{{ t.label }}</NuxtLink>
        </nav>
        <NuxtLink v-if="plus" :to="plus.to" class="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-accent-light shadow-pill transition hover:scale-105" :aria-label="plus.label" :title="plus.label"><Plus class="size-4" /></NuxtLink>
      </div>

      <main class="min-w-0 flex-1" :class="hidesChrome ? '' : 'px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-7'">
        <slot />
      </main>
    </div>

    <!-- Mobile navigation drawer -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity duration-150" leave-active-class="transition-opacity duration-150">
        <div v-if="mobileNav" class="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm lg:hidden" @click.self="mobileNav = false">
          <div class="relative h-full w-[min(18rem,85vw)] shadow-glass">
            <button type="button" class="absolute right-2 top-2 z-10 rounded-full p-2 text-white/70 hover:text-white" aria-label="Close navigation" @click="mobileNav = false"><X class="size-5" /></button>
            <AdminSidebar :sections="sections" :current-key="current?.key">
              <template #top><AdminCommandBar /></template>
            </AdminSidebar>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
