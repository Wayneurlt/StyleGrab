<script setup lang="ts">
const { state, settle } = useConfirm()
const reason = ref('')
const open = computed({ get: () => state.value.open, set: v => !v && settle(false) })
watch(() => state.value.open, (v) => {
  if (v) reason.value = ''
})
function ok() {
  if (state.value.requireReason) {
    if (reason.value.trim().length < 3) return
    settle(reason.value.trim())
  }
  else settle(true)
}
</script>

<template>
  <UiModal v-model:open="open" :title="state.title" size="sm">
    <p v-if="state.message" class="text-sm text-ink-soft">{{ state.message }}</p>
    <div v-if="state.requireReason" class="mt-4">
      <UiField id="confirm-reason" :label="state.requireReason" required>
        <textarea id="confirm-reason" v-model="reason" rows="3" class="field" />
      </UiField>
    </div>
    <template #footer>
      <UiButton variant="light" @click="settle(false)">Cancel</UiButton>
      <UiButton :variant="state.danger ? 'danger' : 'dark'" :disabled="!!state.requireReason && reason.trim().length < 3" @click="ok">{{ state.confirmLabel ?? 'Confirm' }}</UiButton>
    </template>
  </UiModal>
</template>
