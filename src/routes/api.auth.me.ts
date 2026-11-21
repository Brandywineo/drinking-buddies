import { createFileRoute } from '@tanstack/react-router'
import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '../db'
import { authSessions, profiles, users } from '../db/schema'
import { hashToken } from '../lib/crypto'
import { jsonError, jsonOk } from '../lib/http'

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = readCookie(request, 'db_session')
        if (!token) return jsonError('You are not signed in.', 401, 'UNAUTHENTICATED')

        try {
          const db = getDb()
          const [session] = await db.select({
            userId: authSessions.userId,
            displayName: profiles.displayName,
            email: users.email,
          }).from(authSessions)
            .innerJoin(users, eq(users.id, authSessions.userId))
            .leftJoin(profiles, eq(profiles.userId, users.id))
            .where(and(
              eq(authSessions.tokenHash, hashToken(token)),
              gt(authSessions.expiresAt, new Date()),
              eq(users.status, 'active'),
            )).limit(1)

          if (!session) return jsonError('Your session has expired.', 401, 'SESSION_EXPIRED')
          return new Response(JSON.stringify({ data: { user: { id: session.userId, email: session.email, displayName: session.displayName } } }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
        } catch (error) {
          console.error('Session lookup failed', error)
          return jsonError('We could not load your session.', 500, 'SESSION_LOOKUP_FAILED')
        }
      },
    },
  },
})