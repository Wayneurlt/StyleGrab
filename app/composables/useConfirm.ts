export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  /** When set, the user must type a reason; it is returned instead of `true`. */
  requireReason?: string
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve?: (v: string | boolean) => void
}

/** Promise-based confirmation dialog for destructive or sensitive actions. */
export function useConfirm() {
  const state = useState<ConfirmState>('confirm', () => ({ open: false, title: '' }))
  function confirm(opts: ConfirmOptions): Promise<string | boolean> {
    return new Promise((resolve) => {
      state.value = { ...opts, open: true, resolve }
    })
  }
  function settle(value: string | boolean) {
    state.value.resolve?.(value)
    state.value = { ...state.value, open: false, resolve: undefined }
  }
  return { state, confirm, settle }
}
