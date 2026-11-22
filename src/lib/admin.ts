import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users } from '../db/schema'
import { getAuthenticatedUserId } from './session'

export async function getAdminUserId(request: Request): Promise<string | null> {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return null
  const allowed = new Set((process.env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
  if (!allowed.size) return null
  const [user] = await getDb().select({ email: users.emailNormalized }).from(users).where(eq(users.id, userId)).limit(1)
  return user && allowed.has(user.email.toLowerCase()) ? userId : null
}
