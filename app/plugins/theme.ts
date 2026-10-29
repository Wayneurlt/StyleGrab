/** Applies the saved theme on the server-rendered <html> and keeps "system" in sync with the device. */
export default defineNuxtPlugin(() => {
  const { pref, isDark, apply, systemDark } = useTheme()
  useHead({ htmlAttrs: { class: computed(() => (pref.value === 'dark' ? 'dark' : '')) } })

  if (import.meta.client) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = mq.matches
    mq.addEventListener('change', (e) => {
      systemDark.value = e.matches
      apply()
    })
    watch(isDark, apply, { immediate: true })
  }
})
