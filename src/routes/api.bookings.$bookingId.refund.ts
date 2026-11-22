import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { marketplaceRefunds, meetupBookings } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ bookingId: z.string().uuid() })

export const Route = createFileRoute('/api/bookings/$bookingId/refund')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to view this refund.', 401, 'UNAUTHENTICATED')
      const parsed = paramsSchema.safeParse(params)
      if (!parsed.success) return jsonError('Invalid booking.', 400, 'INVALID_BOOKING')
      const [booking] = await getDb().select({ id: meetupBookings.id }).from(meetupBookings).where(and(
        eq(meetupBookings.id, parsed.data.bookingId), eq(meetupBookings.attendeeId, userId),
      )).limit(1)
      if (!booking) return jsonError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
      const [refund] = await getDb().select().from(marketplaceRefunds)
        .where(eq(marketplaceRefunds.bookingId, booking.id))
        .orderBy(desc(marketplaceRefunds.createdAt)).limit(1)
      return jsonOk({ refund: refund ? {
        id: refund.id, amountMinor: refund.refundAmountMinor, currency: refund.currency,
        status: refund.status, failureReason: refund.failureReason,
        requestedAt: refund.createdAt, processedAt: refund.processedAt,
      } : null })
    },
  } },
})
