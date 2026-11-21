import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { meetupBookings, payments } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ bookingId: z.string().uuid() })

export const Route = createFileRoute('/api/bookings/$bookingId/payment')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to view this payment.', 401, 'UNAUTHENTICATED')
      const parsed = paramsSchema.safeParse(params)
      if (!parsed.success) return jsonError('Invalid booking.', 400, 'INVALID_BOOKING')
      const db = getDb()
      const [booking] = await db.select({ id: meetupBookings.id, status: meetupBookings.status })
        .from(meetupBookings).where(and(eq(meetupBookings.id, parsed.data.bookingId), eq(meetupBookings.attendeeId, userId))).limit(1)
      if (!booking) return jsonError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
      const [payment] = await db.select().from(payments).where(and(
        eq(payments.bookingId, booking.id), eq(payments.userId, userId),
      )).orderBy(desc(payments.createdAt)).limit(1)
      return jsonOk({
        bookingStatus: booking.status,
        payment: payment ? {
          id: payment.id,
          provider: payment.provider,
          status: payment.status,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          paidAt: payment.paidAt,
          receipt: typeof payment.metadata.receipt === 'string' ? payment.metadata.receipt : null,
          latePaymentReview: payment.metadata.latePaymentReview === true,
        } : null,
      })
    },
  } },
})
