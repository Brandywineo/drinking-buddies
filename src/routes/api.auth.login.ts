import { createFileRoute } from '@tanstack/react-router'
import { compare } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { authSessions, profiles, users } from '../../db/schema'
import { createOpaqueToken, hashToken } from '../../lib/crypto'
import { jsonError, jsonOk } from '../../lib/http'

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(72),
})
const SESSION_DAYS = 30

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try { body = await request.json() } catch {
          return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON')
        }
        const parsed = loginSchema.safeParse(body)
        if (!parsed.success) return jsonError('Email or password is incorrect.', 401, 'INVALID_CREDENTIALS')

        try {
          const db = getDb()
          const email = parsed.data.email.toLowerCase()
          const [user] = await db.select({
            id: users.id,
            passwordHash: users.passwordHash,
            status: users.status,
            emailVerifiedAt: users.emailVerifiedAt,
            displayName: profiles.displayName,
          }).from(users).leftJoin(profiles, eq(profiles.userId, users.id))
            .where(eq(users.emailNormalized, email)).limit(1)

          if (!user?.passwordHash || !(await compare(parsed.data.password, user.passwordHash))) {
            return jsonError('Email or password is incorrect.', 401, 'INVALID_CREDENTIALS')
          }
          if (user.status !== 'active' || !user.emailVerifiedAt) {
            return jsonError('Verify your email before signing in.', 403, 'EMAIL_NOT_VERIFIED')
          }

          const token = createOpaqueToken()
          const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
          await db.insert(authSessions).values({
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt,
          })

          const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
          return new Response(JSON.stringify({
            data: { user: { id: user.id, displayName: user.displayName } },
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `db_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`,
            },
          })
        } catch (error) {
          console.error('Login failed', error)
          return jsonError('We could not sign you in right now.', 500, 'LOGIN_FAILED')
        }
      },
    },
  },
})