export default defineApi(async (event) => {
  const { user, actor } = await requireStaff(event)
  return { id: user.id, email: user.email, name: user.name, role: { key: user.role.key, name: user.role.name }, permissions: [...actor.permissions] }
})
