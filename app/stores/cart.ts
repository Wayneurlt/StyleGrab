import { defineStore } from 'pinia'

export interface CartLine {
  variantId: string
  quantity: number
  // Display hints only; prices/availability are always revalidated by the server.
  productName: string
  variantTitle: string
  slug: string
  imageKey: string | null
  unitPrice: number
}

const STORAGE_KEY = 'sg-cart-v1'

/** Storefront cart. Kept in the browser for convenience; never the source of truth for price or stock. */
export const useCartStore = defineStore('cart', {
  state: () => ({ lines: [] as CartLine[], hydrated: false }),
  getters: {
    count: s => s.lines.reduce((n, l) => n + l.quantity, 0),
    estimatedSubtotal: s => s.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0),
  },
  actions: {
    hydrate() {
      if (this.hydrated || !import.meta.client) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) this.lines = (JSON.parse(raw) as CartLine[]).filter(l => l && typeof l.variantId === 'string' && l.quantity > 0)
      }
      catch {
        this.lines = []
      }
      this.hydrated = true
    },
    persist() {
      if (!import.meta.client) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lines))
      }
      catch { /* storage unavailable — cart lives for this page view only */ }
    },
    add(line: CartLine) {
      const existing = this.lines.find(l => l.variantId === line.variantId)
      if (existing) existing.quantity = Math.min(20, existing.quantity + line.quantity)
      else this.lines.push(line)
      this.persist()
    },
    setQuantity(variantId: string, quantity: number) {
      const l = this.lines.find(x => x.variantId === variantId)
      if (!l) return
      if (quantity <= 0) this.lines = this.lines.filter(x => x.variantId !== variantId)
      else l.quantity = Math.min(20, quantity)
      this.persist()
    },
    remove(variantId: string) {
      this.lines = this.lines.filter(x => x.variantId !== variantId)
      this.persist()
    },
    clear() {
      this.lines = []
      this.persist()
    },
  },
})
