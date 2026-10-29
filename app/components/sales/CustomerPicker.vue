<script setup lang="ts">
import { UserPlus, UserRound, X } from 'lucide-vue-next'

export interface PickedCustomer { id: string, name: string, phone: string | null, email?: string | null }

/** Find an existing customer (name / phone / email) or create one. Null means walk-in / no customer. */
const model = defineModel<PickedCustomer | null>({ required: true })
withDefaults(defineProps<{ emptyLabel?: string }>(), { emptyLabel: 'Walk-in customer' })
const { can } = useStaff()
const toast = useToast()

const q = ref('')
const open = ref(false)
const results = ref<PickedCustomer[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(timer)
  if (v.trim().length < 2) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    try {
      const r = await apiFetch<{ items: { id: string, name: string, phone: string | null, email: string | null }[] }>('/api/admin/customers', { query: { q: v.trim(), status: 'active', pageSize: 6 } })
      results.value = r.items
    }
    catch (e) {
      toast.error(apiError(e))
    }
  }, 250)
})

function pick(c: PickedCustomer) {
  model.value = { id: c.id, name: c.name, phone: c.phone, email: c.email }
  q.value = ''
  open.value = false
}

const creating = ref(false)
const form = reactive({ name: '', phone: '', email: '' })
const { pending, run } = useAction()
function startCreate() {
  const t = q.value.trim()
  form.name = /\d{4,}/.test(t) ? '' : t
  form.phone = /\d{4,}/.test(t) ? t : ''
  form.email = ''
  creating.value = true
}
async function create() {
  const c = await run(() => apiFetch<{ id: string, name: string, phone: string | null, email: string | null }>('/api/admin/customers', { method: 'POST', body: { name: form.name, phone: form.phone || null, email: form.email || null } }), { success: 'Customer created' })
  if (c) {
    pick({ id: c.id, name: c.name, phone: c.phone, email: c.email })
    creating.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="model" class="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white/70 px-3 py-2">
      <span class="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{{ model.name.slice(0, 1).toUpperCase() }}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ model.name }}</p>
        <p class="truncate text-xs text-ink-muted">{{ model.phone ?? model.email ?? 'No contact on file' }}</p>
      </div>
      <UiIconButton :icon="X" label="Remove customer" size="sm" @click="model = null" />
    </div>
    <div v-else class="relative" @focusout="(e: FocusEvent) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (open = false)">
      <label class="relative flex items-center">
        <span class="sr-only">Find customer by name, phone or email</span>
        <UserRound class="pointer-events-none absolute left-3.5 size-4 text-ink-muted" aria-hidden="true" />
        <input v-model="q" type="search" class="field pl-10" :placeholder="`${emptyLabel} — search to attach a customer`" autocomplete="off" @focus="open = true">
      </label>
      <div v-if="open && q.trim().length >= 2" class="absolute inset-x-0 top-12 z-40 rounded-2xl border border-sand-200 bg-white/95 p-1.5 text-sm shadow-glass backdrop-blur-xl">
        <button v-for="c in results" :key="c.id" type="button" class="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-sand-50" @mousedown.prevent="pick(c)">
          <span class="font-medium">{{ c.name }}</span>
          <span class="text-xs text-ink-muted">{{ c.phone ?? c.email ?? '' }}</span>
        </button>
        <p v-if="!results.length" class="px-3 py-2 text-ink-muted">No matching customers.</p>
        <button v-if="can('customers.manage')" type="button" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium hover:bg-sand-50" @mousedown.prevent="startCreate">
          <UserPlus class="size-4" />Create new customer
        </button>
      </div>
    </div>

    <UiModal v-model:open="creating" title="New customer" size="sm">
      <form id="new-customer-form" class="space-y-3" @submit.prevent="create">
        <UiField id="nc-name" label="Name" required><input id="nc-name" v-model="form.name" class="field" required maxlength="120"></UiField>
        <UiField id="nc-phone" label="Phone" hint="Used to find this customer again"><input id="nc-phone" v-model="form.phone" class="field" type="tel" maxlength="30"></UiField>
        <UiField id="nc-email" label="Email"><input id="nc-email" v-model="form.email" class="field" type="email" maxlength="120"></UiField>
      </form>
      <template #footer>
        <UiButton variant="light" @click="creating = false">Cancel</UiButton>
        <UiButton type="submit" form="new-customer-form" :loading="pending" :disabled="!form.name.trim()">Create</UiButton>
      </template>
    </UiModal>
  </div>
</template>
