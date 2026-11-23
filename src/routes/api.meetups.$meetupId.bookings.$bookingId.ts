import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { meetupBookings, payments } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ meetupId: z.string().uuid(), bookingId: z.string().uuid() })

export const Route = createFileRoute('/api/meetups/$meetupId/bookings/$bookingId')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to check your booking.', 401, 'UNAUTHENTICATED')
      const parsed = paramsSchema.safeParse(params)
      if (!parsed.success) return jsonError('Invalid booking.', 400, 'INVALID_BOOKING')
      const db = getDb()
      const [booking] = await db.select({
        id: meetupBookings.id, status: meetupBookings.status, expiresAt: meetupBookings.expiresAt,
      }).from(meetupBookings).where(and(
        eq(meetupBookings.id, parsed.data.bookingId),
        eq(meetupBookings.meetupId, parsed.data.meetupId),
        eq(meetupBookings.attendeeId, userId),
      )).limit(1)
      if (!booking) return jsonError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
      const [payment] = await db.select({
        status: payments.status, paidAt: payments.paidAt, metadata: payments.metadata,
      }).from(payments).where(eq(payments.bookingId, booking.id)).orderBy(desc(payments.createdAt)).limit(1)
      return jsonOk({ booking: { ...booking, status: booking.status === 'pending_payment' && booking.expiresAt <= new Date() ? 'expired' : booking.status }, payment: payment ?? null })
    },
  } },
})
