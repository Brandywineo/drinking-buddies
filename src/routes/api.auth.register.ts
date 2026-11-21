import { createFileRoute } from '@tanstack/react-router'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { emailOutbox, emailVerifications, profiles, users } from '../../db/schema'
import { AGE_GATE_VERSION, hasAcceptedAdultTerms } from '../../lib/age-gate'
import { createOpaqueToken, hashToken } from '../../lib/crypto'
import { jsonError, jsonOk } from '../../lib/http'

const registrationSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(72),
  displayName: z.string().trim().min(2).max(48),
  accepted18: z.boolean(),
})

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON')
        }

        const parsed = registrationSchema.safeParse(body)
        if (!parsed.success) {
          return jsonError('Check your details. Passwords must be at least 12 characters.', 422, 'VALIDATION_ERROR')
        }
        if (!hasAcceptedAdultTerms(parsed.data.accepted18)) {
          return jsonError('You must acknowledge that you are 18 or older to create an account.', 403, 'AGE_ACKNOWLEDGEMENT_REQUIRED')
        }

        const email = parsed.data.email.toLowerCase()
        const token = createOpaqueToken()
        const tokenHash = hashToken(token)
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24)
        const verificationUrl = new URL('/api/auth/verify-email', process.env.APP_URL ?? 'http://localhost:3000')
        verificationUrl.searchParams.set('token', token)

        try {
          const db = getDb()
          const result = await db.transaction(async (tx) => {
            const existing = await tx.select({ id: users.id }).from(users).where(eq(users.emailNormalized, email)).limit(1)
            if (existing.length > 0) return { duplicate: true as const }

            const [user] = await tx.insert(users).values({
              email,
              emailNormalized: email,
              passwordHash: await hash(parsed.data.password, 12),
              status: 'pending_verification',
              ageAcknowledgedAt: new Date(),
              ageGateVersion: AGE_GATE_VERSION,
            }).returning({ id: users.id })

            await tx.insert(profiles).values({
              userId: user.id,
              displayName: parsed.data.displayName,
            })
            await tx.insert(emailVerifications).values({
              userId: user.id,
              tokenHash,
              expiresAt,
            })
            await tx.insert(emailOutbox).values({
              recipient: email,
              templateKey: 'verify_email',
              payload: { displayName: parsed.data.displayName, verificationUrl: verificationUrl.toString() },
            })
            return { duplicate: false as const, userId: user.id }
          })

          if (result.duplicate) {
            return jsonError('An account with this email already exists.', 409, 'EMAIL_ALREADY_REGISTERED')
          }

          return jsonOk({
            accepted: true,
            message: 'Account created. Complete email verification before signing in.',
            delivery: 'queued',
          }, 202)
        } catch (error) {
          console.error('Registration failed', error)
          return jsonError('We could not create your account right now.', 500, 'REGISTRATION_FAILED')
        }
      },
    },
  },
})