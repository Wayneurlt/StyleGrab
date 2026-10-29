<script setup lang="ts">
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Categories' })

const { can } = useStaff()
const { run, pending } = useAction()
const { confirm } = useConfirm()
const toast = useToast()
const showArchived = ref(false)
const { data, error, status, refresh } = useFetch('/api/admin/categories', { server: false, query: computed(() => ({ archived: showArchived.value ? '1' : undefined })) })

type Cat = NonNullable<typeof data.value>[number]
const rows = computed(() => {
  const list = data.value ?? []
  const out: { cat: Cat, depth: number, siblings: Cat[] }[] = []
  const walk = (pid: string | null, depth: number) => {
    const sibs = list.filter(c => c.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    for (const c of sibs) {
      out.push({ cat: c, depth, siblings: sibs })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  // Orphans whose parent is hidden (archived) still need to be listed.
  for (const c of list) if (!out.some(r => r.cat.id === c.id)) out.push({ cat: c, depth: 1, siblings: [c] })
  return out
})

// ---- create / edit ----
const editOpen = ref(false)
const editing = ref<Cat | null>(null)
const form = reactive({ name: '', code: '', description: '', parentId: '' as string, isVisible: true })
function openEdit(c: Cat | null, parentId = '') {
  editing.value = c
  Object.assign(form, c
    ? { name: c.name, code: c.code, description: c.description ?? '', parentId: c.parentId ?? '', isVisible: c.isVisible }
    : { name: '', code: '', description: '', parentId, isVisible: true })
  editOpen.value = true
}
async function saveCategory() {
  const body = { name: form.name, code: form.code, description: form.description || null, parentId: form.parentId || null, isVisible: form.isVisible }
  const ok = await run(() => editing.value
    ? apiFetch(`/api/admin/categories/${editing.value.id}`, { method: 'PUT', body })
    : apiFetch('/api/admin/categories', { method: 'POST', body }), { success: editing.value ? 'Category updated' : 'Category created' })
  if (ok) {
    editOpen.value = false
    refresh()
  }
}

async function move(r: { cat: Cat, siblings: Cat[] }, dir: -1 | 1) {
  const ids = r.siblings.map(s => s.id)
  const i = ids.indexOf(r.cat.id)
  const j = i + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
  if (await run(() => apiFetch('/api/admin/categories/reorder', { method: 'POST', body: { ids } }))) refresh()
}

async function toggleArchive(c: Cat) {
  if (!c.isArchived && !(await confirm({ title: `Archive ${c.name}?`, message: 'It will be hidden from the storefront and category pickers. Products and sales history are kept.', confirmLabel: 'Archive', danger: true }))) return
  if (await run(() => apiFetch(`/api/admin/categories/${c.id}`, { method: 'PUT', body: { isArchived: !c.isArchived } }), { success: c.isArchived ? 'Category restored' : 'Category archived' })) refresh()
}

async function uploadImage(c: Cat, e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    toast.error('Use a JPEG, PNG or WebP image up to 5 MB')
    return
  }
  const fd = new FormData()
  fd.append('file', file)
  if (await run(() => apiFetch(`/api/admin/categories/${c.id}/image`, { method: 'POST', body: fd }), { success: 'Image updated' })) refresh()
}

// ---- attributes ----
const attrOpen = ref(false)
const attrCat = ref<Cat | null>(null)
const attrRows = ref<{ name: string, code: string, options: string, isRequired: boolean }[]>([])
function openAttrs(c: Cat) {
  attrCat.value = c
  attrRows.value = c.attributes.map(a => ({ name: a.name, code: a.code, options: a.options.join(', '), isRequired: a.isRequired }))
  attrOpen.value = true
}
function autoCode(row: { name: string, code: string }) {
  if (!row.code) row.code = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
async function saveAttrs() {
  if (!attrCat.value) return
  const attributes = attrRows.value.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), code: (r.code || r.name).trim(), options: r.options.split(',').map(s => s.trim()).filter(Boolean), isRequired: r.isRequired }))
  const ok = await run(() => apiFetch(`/api/admin/categories/${attrCat.value!.id}/attributes`, { method: 'PUT', body: { attributes } }), { success: 'Attributes saved' })
  if (ok) {
    attrOpen.value = false
    refresh()
  }
}
const parentChoices = computed(() => (data.value ?? []).filter(c => !c.isArchived && c.id !== editing.value?.id))
</script>

<template>
  <div>
    <UiPageHeader title="Categories" subtitle="Organise products and define which variant attributes apply to each category." :crumbs="[{ label: 'Catalogue' }, { label: 'Categories' }]">
      <label class="flex items-center gap-2 text-sm text-ink-soft"><input v-model="showArchived" type="checkbox" class="size-4 accent-ink">Show archived</label>
      <UiButton v-if="can('catalog.manage')" :icon="Plus" @click="openEdit(null)">New category</UiButton>
    </UiPageHeader>

    <section class="glass-card p-5">
      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="6" height="h-14" />
      <UiEmpty v-else-if="!rows.length" title="No categories yet" message="Create a category such as Scarves or Shoes." />
      <ul v-else class="space-y-1.5">
        <li v-for="r in rows" :key="r.cat.id" class="flex flex-wrap items-center gap-3 rounded-2xl bg-sand-50 px-3 py-2.5" :class="r.cat.isArchived ? 'opacity-60' : ''" :style="{ marginLeft: `${r.depth * 28}px` }">
          <UiProductImage :image-key="r.cat.imageKey" :alt="r.cat.name" class="size-10 shrink-0" rounded="rounded-xl" />
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ r.cat.name }} <span class="ml-1 font-mono text-xs text-ink-muted">{{ r.cat.code }}</span></p>
            <p class="text-xs text-ink-muted">
              {{ r.cat._count.products }} products
              <template v-if="r.cat.attributes.length"> · {{ r.cat.attributes.map(a => a.name).join(', ') }}</template>
              <template v-else-if="r.depth > 0"> · inherits parent attributes</template>
            </p>
          </div>
          <UiBadge v-if="!r.cat.isVisible" tone="neutral">Hidden</UiBadge>
          <UiBadge v-if="r.cat.isArchived" tone="danger">Archived</UiBadge>
          <div v-if="can('catalog.manage')" class="flex items-center">
            <UiIconButton :icon="ArrowUp" label="Move up" size="sm" :class="r.siblings[0]?.id === r.cat.id ? 'invisible' : ''" @click="move(r, -1)" />
            <UiIconButton :icon="ArrowDown" label="Move down" size="sm" :class="r.siblings.at(-1)?.id === r.cat.id ? 'invisible' : ''" @click="move(r, 1)" />
            <label class="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-ink-soft hover:bg-sand-100" :title="`Upload image for ${r.cat.name}`">
              <ImagePlus class="size-4" aria-hidden="true" />
              <span class="sr-only">Upload image for {{ r.cat.name }}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="uploadImage(r.cat, $event)">
            </label>
            <UiIconButton :icon="SlidersHorizontal" label="Edit attributes" size="sm" @click="openAttrs(r.cat)" />
            <UiIconButton :icon="Plus" label="Add subcategory" size="sm" @click="openEdit(null, r.cat.id)" />
            <UiIconButton :icon="Pencil" label="Edit category" size="sm" @click="openEdit(r.cat)" />
            <UiButton size="sm" variant="ghost" @click="toggleArchive(r.cat)">{{ r.cat.isArchived ? 'Restore' : 'Archive' }}</UiButton>
          </div>
        </li>
      </ul>
    </section>

    <UiModal v-model:open="editOpen" :title="editing ? `Edit ${editing.name}` : 'New category'">
      <form id="cat-form" class="space-y-4" @submit.prevent="saveCategory">
        <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <UiField id="c-name" label="Name" required><input id="c-name" v-model="form.name" class="field" maxlength="80" required></UiField>
          <UiField id="c-code" label="Code" required hint="Used in SKUs, e.g. SC"><input id="c-code" v-model="form.code" class="field uppercase" maxlength="6" pattern="[A-Za-z0-9]+" required></UiField>
        </div>
        <UiField id="c-parent" label="Parent category">
          <select id="c-parent" v-model="form.parentId" class="field">
            <option value="">None (top level)</option>
            <option v-for="c in parentChoices" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </UiField>
        <UiField id="c-desc" label="Description"><textarea id="c-desc" v-model="form.description" rows="3" class="field" maxlength="1000" /></UiField>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.isVisible" type="checkbox" class="size-4 accent-ink">Visible on the storefront</label>
      </form>
      <template #footer>
        <UiButton variant="light" @click="editOpen = false">Cancel</UiButton>
        <UiButton type="submit" form="cat-form" :loading="pending" :disabled="!form.name || !form.code">Save</UiButton>
      </template>
    </UiModal>

    <UiModal v-model:open="attrOpen" :title="`Attributes — ${attrCat?.name ?? ''}`" description="Variants of products in this category (and its subcategories) use these attributes. Leave options empty for free text." size="lg">
      <div class="space-y-2">
        <div v-for="(a, i) in attrRows" :key="i" class="grid gap-2 rounded-2xl bg-sand-50 p-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto] sm:items-end">
          <UiField :id="`a-name-${i}`" label="Name"><input :id="`a-name-${i}`" v-model="a.name" class="field h-9" maxlength="40" @blur="autoCode(a)"></UiField>
          <UiField :id="`a-code-${i}`" label="Code"><input :id="`a-code-${i}`" v-model="a.code" class="field h-9 font-mono text-xs" maxlength="30"></UiField>
          <UiField :id="`a-opt-${i}`" label="Options (comma separated)"><input :id="`a-opt-${i}`" v-model="a.options" class="field h-9" placeholder="e.g. Silk, Cotton, Satin"></UiField>
          <label class="flex h-9 items-center gap-2 text-sm"><input v-model="a.isRequired" type="checkbox" class="size-4 accent-ink">Required</label>
          <UiIconButton :icon="Trash2" label="Remove attribute" size="sm" @click="attrRows.splice(i, 1)" />
        </div>
        <UiButton variant="light" size="sm" :icon="Plus" @click="attrRows.push({ name: '', code: '', options: '', isRequired: false })">Add attribute</UiButton>
        <p class="text-xs text-ink-muted">Removing an attribute does not change existing variants' recorded values.</p>
      </div>
      <template #footer>
        <UiButton variant="light" @click="attrOpen = false">Cancel</UiButton>
        <UiButton :loading="pending" @click="saveAttrs">Save attributes</UiButton>
      </template>
    </UiModal>
  </div>
</template>
