import AOS from 'aos'
import 'aos/dist/aos.css'

/**
 * Scroll-reveal animations (elements with `data-aos`). Disabled for users who prefer reduced motion.
 * Re-scans the page after every client-side navigation so new content animates too.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Subtle, Apple-like reveals: short travel, smooth easing, once per element.
  AOS.init({ duration: 700, easing: 'ease-out-cubic', once: true, offset: 40, disable: reduce })
  nuxtApp.hook('page:finish', () => {
    setTimeout(() => AOS.refreshHard(), 50)
  })
})
