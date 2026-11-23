import { createFileRoute } from '@tanstack/react-router'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { authSessions, emailOutbox, emailVerifications, platformSettings, profiles, users } from '../db/schema'
import { AGE_GATE_VERSION, hasAcceptedAdultTerms } from '../lib/age-gate'
import { createOpaqueToken, hashToken } from '../lib/crypto'
import { jsonError } from '../lib/http'

const registrationSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(72),
  displayName: z.string().trim().min(2).max(48),
  accepted18: z.boolean(),
})

export const Route = createFileRoute('/api/auth/register')({
  server: { handlers: {
    POST: async ({ request }) => {
      let body: unknown
      try { body = await request.json() } catch {
        return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON')
      }
      const parsed = registrationSchema.safeParse(body)
      if (!parsed.success) return jsonError('Check your details. Passwords must be at least 12 characters.', 422, 'VALIDATION_ERROR')
      if (!hasAcceptedAdultTerms(parsed.data.accepted18)) {
        return jsonError('You must acknowledge that you are 18 or older to create an account.', 403, 'AGE_ACKNOWLEDGEMENT_REQUIRED')
      }

      const email = parsed.data.email.toLowerCase()
      const token = createOpaqueToken()
      const verificationUrl = new URL('/verify-email', process.env.APP_URL ?? 'http://localhost:3000')
      verificationUrl.searchParams.set('token', token)
      const now = new Date()

      try {
        const db = getDb()
        const [verificationSetting] = await db.select({ value: platformSettings.value })
          .from(platformSettings).where(eq(platformSettings.key, 'email_verification')).limit(1)
        const verificationRequired = Boolean(
          verificationSetting?.value &&
          typeof verificationSetting.value === 'object' &&
          (verificationSetting.value as { required?: unknown }).required === true,
        )

        const sessionToken = createOpaqueToken()
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        const result = await db.transaction(async (tx) => {
          const existing = await tx.select({ id: users.id }).from(users)
            .where(eq(users.emailNormalized, email)).limit(1)
          if (existing.length > 0) return { duplicate: true as const }

          const [user] = await tx.insert(users).values({
            email,
            emailNormalized: email,
            passwordHash: await hash(parsed.data.password, 12),
            status: verificationRequired ? 'pending_verification' : 'active',
            ageAcknowledgedAt: now,
            ageGateVersion: AGE_GATE_VERSION,
          }).returning({ id: users.id })

          await tx.insert(profiles).values({ userId: user.id, displayName: parsed.data.displayName })
          if (verificationRequired) {
            await tx.insert(emailVerifications).values({
              userId: user.id,
              tokenHash: hashToken(token),
              expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            })
            await tx.insert(emailOutbox).values({
              recipient: email,
              templateKey: 'verify_email',
              payload: { displayName: parsed.data.displayName, verificationUrl: verificationUrl.toString() },
            })
          }
          await tx.insert(authSessions).values({
            userId: user.id,
            tokenHash: hashToken(sessionToken),
            expiresAt,
          })
          return { duplicate: false as const, userId: user.id }
        })

        if (result.duplicate) return jsonError('An account with this email already exists.', 409, 'EMAIL_ALREADY_REGISTERED')

        const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
        return new Response(JSON.stringify({ data: {
          accepted: true,
          authenticated: !verificationRequired,
          message: verificationRequired
            ? 'Account created. Complete email verification before signing in.'
            : 'Account created. You are now signed in.',
          delivery: verificationRequired ? 'queued' : 'not_required',
          user: { id: result.userId, displayName: parsed.data.displayName },
        } }), {
          status: verificationRequired ? 202 : 201,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Set-Cookie': `db_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
          },
        })
      } catch (error) {
        console.error('Registration failed', error)
        return jsonError('We could not create your account right now.', 500, 'REGISTRATION_FAILED')
      }
    },
  } },
})
