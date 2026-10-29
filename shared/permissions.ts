/** Permission catalogue. Enforcement happens on the server; the UI only uses these to hide unavailable actions. */
export const PERMISSIONS = {
  'dashboard.view': 'View the dashboard',
  'catalog.view': 'View products and categories',
  'catalog.manage': 'Create and edit products, variants, categories and images',
  'catalog.price': 'Change selling prices and costs',
  'inventory.view': 'View stock levels and movements',
  'inventory.receive': 'Receive stock (goods receipts)',
  'inventory.adjust': 'Create stock adjustments',
  'inventory.adjust.approve': 'Approve stock adjustments above the threshold',
  'inventory.stocktake': 'Run stocktakes and record counts',
  'inventory.stocktake.finalize': 'Finalize stocktakes (posts adjustments)',
  'inventory.import': 'Import products and opening stock from CSV',
  'pos.sell': 'Record POS sales',
  'pos.discount': 'Apply discounts up to the configured limit',
  'pos.discount.override': 'Apply discounts above the configured limit',
  'pos.price.override': 'Override unit selling prices',
  'shifts.manage': 'Open and close cash shifts, record pay-ins/outs',
  'shifts.view.all': 'View shifts of all cashiers',
  'orders.view': 'View orders and sales',
  'orders.manage': 'Create manual orders and change fulfilment status',
  'orders.cancel': 'Cancel orders',
  'payments.record': 'Record payments received',
  'payments.verify': 'Verify or reject recorded payments',
  'payments.void': 'Void payment records entered in error',
  'returns.create': 'Process returns, exchanges and refunds',
  'customers.view': 'View customers',
  'customers.manage': 'Create and edit customers',
  'customers.notes': 'View and edit private customer notes',
  'suppliers.view': 'View suppliers and purchase orders',
  'purchasing.manage': 'Manage suppliers and purchase orders',
  'reports.sales': 'View sales reports',
  'reports.inventory': 'View inventory reports and valuation',
  'reports.financial': 'View profit, COGS and reconciliation reports',
  'users.manage': 'Manage staff accounts and roles',
  'settings.manage': 'Change system settings and payment methods',
  'audit.view': 'View the audit log',
} as const

export type Permission = keyof typeof PERMISSIONS
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export const DEFAULT_ROLES: { key: string, name: string, description: string, permissions: Permission[] }[] = [
  { key: 'owner', name: 'Owner / Administrator', description: 'Full access', permissions: ALL_PERMISSIONS },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Runs day-to-day operations, approves adjustments and refunds',
    permissions: ALL_PERMISSIONS.filter(p => p !== 'users.manage' && p !== 'settings.manage'),
  },
  {
    key: 'cashier',
    name: 'Cashier',
    description: 'POS sales, customer lookup, receipts',
    permissions: ['dashboard.view', 'catalog.view', 'inventory.view', 'pos.sell', 'pos.discount', 'shifts.manage', 'orders.view', 'payments.record', 'customers.view', 'customers.manage'],
  },
  {
    key: 'inventory',
    name: 'Inventory Staff',
    description: 'Receiving, counts and adjustments within limits',
    permissions: ['dashboard.view', 'catalog.view', 'inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.stocktake', 'suppliers.view', 'reports.inventory'],
  },
  {
    key: 'viewer',
    name: 'Read-only',
    description: 'Views permitted reports without modifying anything',
    permissions: ['dashboard.view', 'catalog.view', 'inventory.view', 'orders.view', 'reports.sales', 'reports.inventory'],
  },
]
