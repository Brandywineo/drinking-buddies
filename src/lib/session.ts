import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '../db'
import { authSessions, users } from '../db/schema'
import { hashToken } from './crypto'

export function readSessionCookie(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('db_session='))
  if (!entry) return null
  try { return decodeURIComponent(entry.slice('db_session='.length)) } catch { return null }
}

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const token = readSessionCookie(request)
  if (!token) return null
  const [session] = await getDb().select({ userId: authSessions.userId })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(
      eq(authSessions.tokenHash, hashToken(token)),
      gt(authSessions.expiresAt, new Date()),
      eq(users.status, 'active'),
    )).limit(1)
  return session?.userId ?? null
}
