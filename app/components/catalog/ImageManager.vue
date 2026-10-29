<script setup lang="ts">
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from 'lucide-vue-next'

interface Img { id: string, key: string, alt: string, isPrimary: boolean, sortOrder: number }

const props = defineProps<{ productId: string, images: Img[] }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const { confirm } = useConfirm()
const { pending, run } = useAction()

const MAX = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const list = ref<Img[]>([])
watch(() => props.images, v => (list.value = [...v].sort((a, b) => a.sortOrder - b.sortOrder).map(i => ({ ...i }))), { immediate: true })
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function onFiles(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  if (!files.length) return
  const bad = files.find(f => !TYPES.includes(f.type) || f.size > MAX)
  if (bad) {
    toast.error(`${bad.name}: only JPEG, PNG or WebP up to 5 MB`)
    return
  }
  if (list.value.length + files.length > 12) {
    toast.error('A product can have at most 12 images')
    return
  }
  uploading.value = true
  try {
    for (let i = 0; i < files.length; i += 6) {
      const fd = new FormData()
      for (const f of files.slice(i, i + 6)) fd.append('file', f)
      await apiFetch(`/api/admin/products/${props.productId}/images`, { method: 'POST', body: fd })
    }
    toast.success(files.length === 1 ? 'Image uploaded' : `${files.length} images uploaded`)
    emit('changed')
  }
  catch (err) {
    toast.error(apiError(err))
    emit('changed')
  }
  finally {
    uploading.value = false
  }
}

async function save(primaryId?: string) {
  // String(...) keeps TypeScript from expanding every typed route (it otherwise hits its recursion limit).
  await run(() => apiFetch<{ ok: boolean }>(`/api/admin/products/${props.productId}/images`, {
    method: 'PUT',
    body: { order: list.value.map(i => i.id), primaryId: primaryId ?? list.value.find(i => i.isPrimary)?.id, alts: Object.fromEntries(list.value.map(i => [i.id, i.alt])) },
  }), { success: 'Images updated' })
  emit('changed')
}

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= list.value.length) return
  const copy = [...list.value]
  ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  list.value = copy
  save()
}

async function remove(img: Img) {
  if (!(await confirm({ title: 'Remove image?', message: 'The image file will be deleted.', confirmLabel: 'Remove', danger: true }))) return
  await run(() => apiFetch<{ ok: boolean }>(`/api/admin/products/${props.productId}/images/${img.id}`, { method: 'DELETE' }), { success: 'Image removed' })
  emit('changed')
}
</script>

<template>
  <UiCard title="Images" subtitle="JPEG, PNG or WebP, up to 5 MB each. The primary image is shown first.">
    <template #actions>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" aria-label="Upload images" @change="onFiles">
      <UiButton variant="light" size="sm" :icon="Upload" :loading="uploading" @click="fileInput?.click()">Upload</UiButton>
    </template>
    <UiEmpty v-if="!list.length" title="No images yet" message="Upload product photos so customers can see what they're buying." />
    <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <li v-for="(img, i) in list" :key="img.id" class="rounded-2xl bg-sand-50 p-2">
        <div class="relative">
          <UiProductImage :image-key="img.key" :alt="img.alt" rounded="rounded-xl" />
          <span v-if="img.isPrimary" class="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">Primary</span>
        </div>
        <label :for="`alt-${img.id}`" class="sr-only">Alt text</label>
        <input :id="`alt-${img.id}`" v-model="img.alt" class="field mt-2 h-8 text-xs" placeholder="Alt text" maxlength="150" @change="save()">
        <div class="mt-1 flex items-center justify-between">
          <div class="flex">
            <UiIconButton :icon="ArrowLeft" label="Move earlier" size="sm" :class="i === 0 ? 'invisible' : ''" @click="move(i, -1)" />
            <UiIconButton :icon="ArrowRight" label="Move later" size="sm" :class="i === list.length - 1 ? 'invisible' : ''" @click="move(i, 1)" />
          </div>
          <div class="flex">
            <UiIconButton v-if="!img.isPrimary" :icon="Star" label="Make primary" size="sm" :class="pending ? 'pointer-events-none opacity-50' : ''" @click="save(img.id)" />
            <UiIconButton :icon="Trash2" label="Remove image" size="sm" @click="remove(img)" />
          </div>
        </div>
      </li>
    </ul>
  </UiCard>
</template>
