export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export const CHANNEL_LABELS: Record<string, string> = {
  WEBSITE: 'Website', POS: 'POS', WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', PHONE: 'Phone', OTHER: 'Other',
}
export const MANUAL_CHANNELS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PHONE', 'OTHER'] as const

export const ORDER_STATUS: Record<string, { label: string, tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  READY: { label: 'Ready', tone: 'accent' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

export const PAYMENT_STATUS: Record<string, { label: string, tone: Tone }> = {
  UNPAID: { label: 'Unpaid', tone: 'danger' },
  AWAITING_CONFIRMATION: { label: 'Awaiting confirmation', tone: 'warning' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'info' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
}

export const PAYMENT_RECORD_STATUS: Record<string, { label: string, tone: Tone }> = {
  PENDING_CONFIRMATION: { label: 'Awaiting confirmation', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  VOIDED: { label: 'Voided', tone: 'neutral' },
}

export const MOVEMENT_LABELS: Record<string, string> = {
  OPENING_STOCK: 'Opening stock',
  PURCHASE_RECEIPT: 'Purchase receipt',
  SALE: 'Sale',
  RETURN_TO_STOCK: 'Return to stock',
  DAMAGE: 'Damage',
  LOSS: 'Loss',
  ADJUSTMENT: 'Adjustment',
  COUNT_ADJUSTMENT: 'Count adjustment',
  RESERVATION: 'Reservation',
  RESERVATION_RELEASE: 'Reservation release',
}

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  OPENING_STOCK: 'Opening stock',
  COUNT_DISCREPANCY: 'Count discrepancy',
  DAMAGE: 'Damaged',
  LOSS: 'Lost / stolen',
  DATA_CORRECTION: 'Data correction',
  OTHER: 'Other',
}

export const PO_STATUS: Record<string, { label: string, tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ORDERED: { label: 'Ordered', tone: 'info' },
  PARTIALLY_RECEIVED: { label: 'Partially received', tone: 'warning' },
  RECEIVED: { label: 'Received', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

export const CONDITION_LABELS: Record<string, string> = {
  SALEABLE: 'Saleable — restock',
  DAMAGED: 'Damaged — write off',
  NEEDS_INSPECTION: 'Needs inspection',
}

/** Allowed fulfilment transitions. COMPLETED and CANCELLED are terminal; post-completion changes go through returns. */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'READY', 'COMPLETED', 'CANCELLED'],
  PROCESSING: ['READY', 'COMPLETED', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}
