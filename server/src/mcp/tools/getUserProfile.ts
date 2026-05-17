interface ToolContext {
  userId: string
  email?: string
}

export async function getUserProfile(
  ctx: ToolContext
): Promise<{ userId: string; email?: string }> {
  return { userId: ctx.userId, email: ctx.email }
}
