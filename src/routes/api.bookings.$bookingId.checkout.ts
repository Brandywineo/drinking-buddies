import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { meetupBookings, payments, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'
import { initiateStkPush, normalizeMpesaPhone } from '../lib/daraja'

const paramsSchema = z.object({ bookingId: z.string().uuid() })
const bodySchema = z.object({ phone: z.string().min(9).max(20) }).strict()

export const Route = createFileRoute('/api/bookings/$bookingId/checkout')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to pay for this booking.', 401, 'UNAUTHENTICATED')
        const parsedParams = paramsSchema.safeParse(params)
        if (!parsedParams.success) return jsonError('Invalid booking.', 400, 'INVALID_BOOKING')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = bodySchema.safeParse(raw)
        if (!parsed.success) return jsonError('Enter your M-PESA phone number.', 400, 'INVALID_PHONE')

        const phone = normalizeMpesaPhone(parsed.data.phone)
        const db = getDb()
        const [booking] = await db.select().from(meetupBookings).where(and(
          eq(meetupBookings.id, parsedParams.data.bookingId),
          eq(meetupBookings.attendeeId, userId),
        )).limit(1)
        if (!booking) return jsonError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
        if (booking.status !== 'pending_payment' || booking.expiresAt <= new Date()) {
          return jsonError('This booking reservation has expired or is no longer payable.', 409, 'BOOKING_NOT_PAYABLE')
        }
        if (booking.currency !== 'KES') return jsonError('M-PESA checkout currently supports KES only.', 409, 'UNSUPPORTED_CURRENCY')

        const [user] = await db.select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
          .from(users).where(eq(users.id, userId)).limit(1)
        if (!user?.phoneVerifiedAt || !user.phoneE164 || normalizeMpesaPhone(user.phoneE164) !== phone) {
          return jsonError('Use the M-PESA number verified on your account.', 403, 'VERIFIED_MPESA_NUMBER_REQUIRED')
        }

        const [existing] = await db.select().from(payments).where(and(
          eq(payments.bookingId, booking.id),
          eq(payments.provider, 'daraja'),
          eq(payments.status, 'pending'),
        )).limit(1)
        if (existing && typeof existing.metadata.checkoutRequestId === 'string') {
          return jsonOk({ paymentId: existing.id, status: existing.status, checkoutRequestId: existing.metadata.checkoutRequestId, reused: true })
        }

        const attemptKey = `booking:${booking.id}:daraja:${crypto.randomUUID()}`
        const [payment] = await db.insert(payments).values({
          userId,
          bookingId: booking.id,
          provider: 'daraja',
          amountMinor: booking.grossAmountMinor,
          currency: booking.currency,
          status: 'pending',
          idempotencyKey: attemptKey,
          metadata: { phone, purpose: 'meetup_booking' },
        }).returning()
        if (!payment) return jsonError('Could not create payment request.', 500, 'PAYMENT_CREATE_FAILED')

        try {
          const stk = await initiateStkPush({
            phone,
            amountMinor: booking.grossAmountMinor,
            accountReference: booking.id.replace(/-/g, '').slice(0, 12),
            description: 'Meetup ticket',
          })
          const now = new Date()
          await db.transaction(async (tx) => {
            await tx.update(payments).set({
              providerReference: stk.checkoutRequestId,
              metadata: {
                phone,
                purpose: 'meetup_booking',
                checkoutRequestId: stk.checkoutRequestId,
                merchantRequestId: stk.merchantRequestId,
                environment: stk.environment,
                customerMessage: stk.customerMessage,
                initiatedAt: now.toISOString(),
              },
              updatedAt: now,
            }).where(eq(payments.id, payment.id))
            await tx.update(meetupBookings).set({
              expiresAt: new Date(now.getTime() + 20 * 60 * 1000),
              updatedAt: now,
            }).where(and(eq(meetupBookings.id, booking.id), eq(meetupBookings.status, 'pending_payment')))
          })
          return jsonOk({ paymentId: payment.id, status: 'pending', checkoutRequestId: stk.checkoutRequestId, customerMessage: stk.customerMessage, reused: false }, 201)
        } catch (error) {
          await db.update(payments).set({
            status: 'failed',
            metadata: { phone, purpose: 'meetup_booking', initiationError: error instanceof Error ? error.message.slice(0, 300) : 'Daraja request failed' },
            updatedAt: new Date(),
          }).where(eq(payments.id, payment.id))
          throw error
        }
      } catch (error) {
        console.error('Daraja STK Push initialization failed', error)
        return jsonError('We could not start M-PESA checkout. Please try again.', 502, 'MPESA_CHECKOUT_FAILED')
      }
    },
  } },
})
