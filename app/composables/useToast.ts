export interface Toast { id: number, kind: 'success' | 'error' | 'info', message: string }

let seq = 0

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])
  function push(kind: Toast['kind'], message: string, ms = kind === 'error' ? 6000 : 3500) {
    const id = ++seq
    toasts.value = [...toasts.value, { id, kind, message }].slice(-4)
    if (import.meta.client) setTimeout(() => dismiss(id), ms)
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }
  return {
    toasts,
    dismiss,
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  }
}
