/** Client-side guard for the admin area. The server enforces authentication and permissions independently. */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin')) return
  const { load, me } = useStaff()
  await load()
  if (to.path === '/admin/login') {
    if (me.value) return navigateTo(typeof to.query.next === 'string' && to.query.next.startsWith('/admin') ? to.query.next : '/admin')
    return
  }
  if (!me.value) return navigateTo({ path: '/admin/login', query: { next: to.fullPath } })
})
