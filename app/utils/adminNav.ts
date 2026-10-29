import { BarChart3, Boxes, Home, Package, Settings, ShoppingBag, Truck, Users, Zap } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { Permission } from '#shared/permissions'

export interface NavTab { label: string, to: string, perm?: Permission, exact?: boolean }
export interface NavSection {
  key: string
  label: string
  icon: Component
  to: string
  match: string[]
  perm?: Permission[]
  tabs: NavTab[]
  plus?: { label: string, to: string, perm?: Permission }
}

/** Left rail sections; each section's tabs appear in the floating bottom pill bar. */
export const NAV: NavSection[] = [
  {
    key: 'home', label: 'Overview', icon: Home, to: '/admin', match: ['/admin'], perm: ['dashboard.view'],
    tabs: [
      { label: 'Overview', to: '/admin', exact: true },
      { label: 'Orders', to: '/admin/orders', perm: 'orders.view' },
      { label: 'Inventory', to: '/admin/inventory', perm: 'inventory.view' },
      { label: 'Reports', to: '/admin/reports/sales', perm: 'reports.sales' },
    ],
    plus: { label: 'New sale', to: '/admin/pos', perm: 'pos.sell' },
  },
  {
    key: 'pos', label: 'Point of sale', icon: Zap, to: '/admin/pos', match: ['/admin/pos', '/admin/returns'], perm: ['pos.sell'],
    tabs: [
      { label: 'Register', to: '/admin/pos', exact: true },
      { label: 'Shifts', to: '/admin/pos/shifts', perm: 'shifts.manage' },
      { label: 'Returns', to: '/admin/returns', perm: 'orders.view' },
    ],
  },
  {
    key: 'orders', label: 'Orders', icon: ShoppingBag, to: '/admin/orders', match: ['/admin/orders', '/admin/payments'], perm: ['orders.view'],
    tabs: [
      { label: 'All orders', to: '/admin/orders', exact: true },
      { label: 'Payments', to: '/admin/payments' },
      { label: 'Returns', to: '/admin/returns' },
    ],
    plus: { label: 'New manual order', to: '/admin/orders/new', perm: 'orders.manage' },
  },
  {
    key: 'products', label: 'Products', icon: Package, to: '/admin/products', match: ['/admin/products', '/admin/categories'], perm: ['catalog.view'],
    tabs: [
      { label: 'Products', to: '/admin/products' },
      { label: 'Categories', to: '/admin/categories' },
    ],
    plus: { label: 'New product', to: '/admin/products/new', perm: 'catalog.manage' },
  },
  {
    key: 'inventory', label: 'Inventory', icon: Boxes, to: '/admin/inventory', match: ['/admin/inventory'], perm: ['inventory.view'],
    tabs: [
      { label: 'Stock', to: '/admin/inventory', exact: true },
      { label: 'Movements', to: '/admin/inventory/movements' },
      { label: 'Receiving', to: '/admin/inventory/receiving' },
      { label: 'Adjustments', to: '/admin/inventory/adjustments' },
      { label: 'Stocktakes', to: '/admin/inventory/stocktakes' },
      { label: 'Import', to: '/admin/inventory/import', perm: 'inventory.import' },
    ],
    plus: { label: 'Receive stock', to: '/admin/inventory/receiving/new', perm: 'inventory.receive' },
  },
  {
    key: 'customers', label: 'Customers', icon: Users, to: '/admin/customers', match: ['/admin/customers'], perm: ['customers.view'],
    tabs: [{ label: 'Customers', to: '/admin/customers', exact: true }],
    plus: { label: 'New customer', to: '/admin/customers?new=1', perm: 'customers.manage' },
  },
  {
    key: 'purchasing', label: 'Purchasing', icon: Truck, to: '/admin/purchasing', match: ['/admin/purchasing'], perm: ['suppliers.view'],
    tabs: [
      { label: 'Purchase orders', to: '/admin/purchasing', exact: true },
      { label: 'Suppliers', to: '/admin/purchasing/suppliers' },
    ],
    plus: { label: 'New purchase order', to: '/admin/purchasing/new', perm: 'purchasing.manage' },
  },
  {
    key: 'reports', label: 'Reports', icon: BarChart3, to: '/admin/reports/sales', match: ['/admin/reports'], perm: ['reports.sales'],
    tabs: [
      { label: 'Sales', to: '/admin/reports/sales', perm: 'reports.sales' },
      { label: 'Profit', to: '/admin/reports/profit', perm: 'reports.financial' },
      { label: 'Inventory', to: '/admin/reports/inventory', perm: 'reports.inventory' },
      { label: 'Reconciliation', to: '/admin/reports/reconciliation', perm: 'reports.financial' },
    ],
  },
  {
    key: 'settings', label: 'Settings', icon: Settings, to: '/admin/settings', match: ['/admin/settings'],
    tabs: [
      { label: 'General', to: '/admin/settings', exact: true, perm: 'settings.manage' },
      { label: 'Payment methods', to: '/admin/settings/payments', perm: 'settings.manage' },
      { label: 'Staff', to: '/admin/settings/staff', perm: 'users.manage' },
      { label: 'Roles', to: '/admin/settings/roles', perm: 'users.manage' },
      { label: 'Audit log', to: '/admin/settings/audit', perm: 'audit.view' },
      { label: 'My account', to: '/admin/settings/account' },
    ],
  },
]

export function sectionFor(path: string): NavSection | undefined {
  // Longest matching prefix wins; '/admin' only matches exactly.
  let best: NavSection | undefined
  let bestLen = -1
  for (const s of NAV) {
    for (const m of s.match) {
      const hit = m === '/admin' ? path === '/admin' : path === m || path.startsWith(`${m}/`)
      if (hit && m.length > bestLen) {
        best = s
        bestLen = m.length
      }
    }
  }
  return best
}
