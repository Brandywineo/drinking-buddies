import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { authSessions } from '../db/schema'
import { hashToken } from '../lib/crypto'
import { jsonOk } from '../lib/http'

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = readCookie(request, 'db_session')
        if (token) {
          try {
            await getDb().delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)))
          } catch (error) {
            console.error('Logout session cleanup failed', error)
          }
        }
        return new Response(JSON.stringify({ data: { loggedOut: true } }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'db_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
          },
        })
      },
    },
  },
})