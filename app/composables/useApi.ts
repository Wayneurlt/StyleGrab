import type { FetchError } from 'ofetch'

/** Human-readable message from an API error (server messages are written to be shown to users). */
export function apiError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = e as FetchError<{ message?: string, statusMessage?: string }>
  if (err?.statusCode === 401) return 'Your session has ended. Please sign in again.'
  return err?.data?.message || err?.statusMessage || (e instanceof Error && !('statusCode' in e) ? fallback : fallback)
}

export function apiErrorCode(e: unknown): string | undefined {
  return (e as FetchError<{ data?: { code?: string } }>)?.data?.data?.code
}

export function newKey(): string {
  return crypto.randomUUID()
}

/**
 * Runs an async action with pending state, a success toast, and an error toast.
 * Returns the result or undefined when it failed.
 */
export function useAction() {
  const pending = ref(false)
  const toast = useToast()
  async function run<T>(fn: () => Promise<T>, opts: { success?: string, error?: string } = {}): Promise<T | undefined> {
    if (pending.value) return undefined
    pending.value = true
    try {
      const res = await fn()
      if (opts.success) toast.success(opts.success)
      return res
    }
    catch (e) {
      toast.error(apiError(e, opts.error))
      if ((e as FetchError)?.statusCode === 401 && import.meta.client && location.pathname.startsWith('/admin')) navigateTo('/admin/login')
      return undefined
    }
    finally {
      pending.value = false
    }
  }
  return { pending, run }
}
