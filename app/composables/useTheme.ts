export type ThemePref = 'light' | 'dark' | 'system'

/**
 * Light/dark theme. The choice lives in a cookie so the server renders the right theme (no flash).
 * "system" follows the device setting; an inline head script (nuxt.config) applies it before paint.
 */
export function useTheme() {
  const pref = useCookie<ThemePref>('sg_theme', { default: () => 'system', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const systemDark = useState('theme-system-dark', () => false)

  const isDark = computed(() => pref.value === 'dark' || (pref.value === 'system' && systemDark.value))

  function apply() {
    if (!import.meta.client) return
    document.documentElement.classList.toggle('dark', isDark.value)
  }
  function toggle() {
    pref.value = isDark.value ? 'light' : 'dark'
    apply()
  }
  return { pref, isDark, toggle, apply, systemDark }
}
