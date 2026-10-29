// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  srcDir: 'app/',
  serverDir: 'server/',
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  typescript: { strict: true, typeCheck: false },
  alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      titleTemplate: '%s · StyleGrab',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#141311' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap' },
      ],
      // Apply the saved (or device) theme before first paint so dark mode never flashes white.
      script: [{
        tagPosition: 'head',
        innerHTML: `(function(){try{var m=document.cookie.match(/(?:^|; )sg_theme=([^;]*)/);var p=m?decodeURIComponent(m[1]).replace(/"/g,''):'system';if(p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`,
      }],
    },
  },
  runtimeConfig: {
    // Server-only. Populated from NUXT_* / process env at runtime; never shipped to the client.
    uploadDir: process.env.UPLOAD_DIR || './storage/uploads',
    uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024),
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    },
  },
  routeRules: {
    '/admin/**': { ssr: false },
  },
  hooks: {
    // Images committed in storage/uploads are published as static files at /media/<key>, so hosts that
    // don't ship the project folder with the server (Vercel, Netlify…) still serve them from their CDN.
    // Images uploaded later on a running server fall through to the /media/[key] route.
    'nitro:config'(config) {
      // Nuxt types this hook's config loosely here, so describe the one field we set.
      const nitro = config as { publicAssets?: { dir: string, baseURL?: string, maxAge?: number }[] }
      nitro.publicAssets ||= []
      nitro.publicAssets.push({ dir: fileURLToPath(new URL('./storage/uploads', import.meta.url)), baseURL: '/media', maxAge: 60 * 60 * 24 * 365 })
    },
  },
  eslint: { config: { stylistic: false } },
})
