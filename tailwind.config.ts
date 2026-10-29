import type { Config } from 'tailwindcss'

/**
 * StyleGrab design tokens: black, white and gold — with light and dark themes.
 * Colours that change with the theme are CSS variables (defined in assets/css/main.css):
 * `white` is the page surface, `ink` the text, `sand` the neutral greys, tints the soft status fills.
 * `coal`/`chalk` never change: use them for surfaces that stay dark (sidebar, showcase bands).
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default <Partial<Config>>{
  content: ['./app/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        white: v('surface'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), muted: v('ink-muted'), faint: v('ink-faint') },
        coal: { DEFAULT: '#0b0b0c', soft: '#1c1c1e', line: '#2c2c2e' },
        chalk: '#f5f5f7',
        // Gold from the logo. `dark` is the text-safe shade (lighter in dark mode); DEFAULT/light are fills.
        accent: { DEFAULT: '#c29a36', light: '#e4c25a', dark: v('accent-text'), tint: v('accent-tint') },
        glass: { DEFAULT: v('surface'), strong: v('surface'), solid: v('surface'), line: v('sand-200') },
        positive: { DEFAULT: v('positive'), tint: v('positive-tint') },
        negative: { DEFAULT: v('negative'), tint: v('negative-tint') },
        caution: { DEFAULT: v('caution'), tint: v('caution-tint') },
        info: { DEFAULT: v('info'), tint: v('info-tint') },
        sand: { 50: v('sand-50'), 100: v('sand-100'), 200: v('sand-200'), 300: v('sand-300'), 400: v('sand-400'), 500: v('sand-500'), 600: v('sand-600'), 700: v('sand-700'), 800: v('sand-800'), 900: v('sand-900') },
      },
      borderRadius: { 'xl': '14px', '2xl': '18px', '3xl': '22px', '4xl': '28px' },
      boxShadow: {
        glass: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 18px 40px -26px rgb(0 0 0 / 0.3)',
        card: '0 8px 24px -18px rgb(0 0 0 / 0.35)',
        pill: '0 6px 18px -8px rgb(0 0 0 / 0.45)',
        lift: '0 2px 10px -2px rgb(0 0 0 / 0.15)',
        gold: '0 10px 30px -12px rgb(194 154 54 / 0.55)',
      },
      backdropBlur: { glass: '20px' },
      fontSize: { display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }] },
      keyframes: {
        'marquee': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        'shimmer': { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'none' } },
        'ken-burns': { from: { transform: 'scale(1.0)' }, to: { transform: 'scale(1.12)' } },
        'progress': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      },
      animation: {
        'marquee': 'marquee 40s linear infinite',
        'shimmer': 'shimmer 6s linear infinite',
        'fade-up': 'fade-up 0.8s cubic-bezier(.2,.7,.2,1) both',
        'ken-burns': 'ken-burns 12s ease-out both',
        'progress': 'progress 6.5s linear both',
      },
    },
  },
}
