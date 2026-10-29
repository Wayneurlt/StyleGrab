import type { FetchOptions } from 'ofetch'

/**
 * Client-side API call: Nuxt's `$fetch` without per-route type inference.
 * With ~100 typed server routes, inferring the response type from the URL makes TypeScript hit its
 * recursion limit, so callers state the response type they expect instead: `apiFetch<Order>(url)`.
 */
export function apiFetch<T = unknown>(url: string, options?: FetchOptions<'json'>): Promise<T> {
  return ($fetch as unknown as (u: string, o?: FetchOptions<'json'>) => Promise<T>)(url, options)
}
