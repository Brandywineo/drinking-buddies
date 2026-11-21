import { createFileRoute } from '@tanstack/react-router'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { emailVerifications, users } from '../../db/schema'
import { hashToken } from '../../lib/crypto'
import { jsonError, jsonOk } from '../../lib/http'

export const Route = createFileRoute('/api/auth/verify-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown\n        try { body = await request.json() } catch {\n          return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON')\n        }\n        const token = z.object({ token: z.string().min(20).max(200) }).safeParse(body).success\n          ? (body as { token: string }).token\n          : null
        if (!token || !z.string().min(20).max(200).safeParse(token).success) {
          return jsonError('Verification link is invalid or expired.', 400, 'INVALID_VERIFICATION_TOKEN')
        }

        try {
          const db = getDb()
          const now = new Date()
          const [verification] = await db.select({
            id: emailVerifications.id,
            userId: emailVerifications.userId,
          }).from(emailVerifications).where(and(
            eq(emailVerifications.tokenHash, hashToken(token)),
            isNull(emailVerifications.consumedAt),
            gt(emailVerifications.expiresAt, now),
          )).limit(1)

          if (!verification) return jsonError('Verification link is invalid or expired.', 400, 'INVALID_VERIFICATION_TOKEN')

          await db.transaction(async (tx) => {
            await tx.update(emailVerifications).set({ consumedAt: now, updatedAt: now }).where(eq(emailVerifications.id, verification.id))
            await tx.update(users).set({ emailVerifiedAt: now, status: 'active', updatedAt: now }).where(eq(users.id, verification.userId))
          })

          return jsonOk({ verified: true, message: 'Email verified. You can now sign in.' })
        } catch (error) {
          console.error('Email verification failed', error)
          return jsonError('We could not verify your email right now.', 500, 'VERIFICATION_FAILED')
        }
      },
    },
  },
})