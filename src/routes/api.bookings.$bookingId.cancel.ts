import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { marketplaceRefunds, meetupBookings, meetups, payments } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ bookingId: z.string().uuid() })

export const Route = createFileRoute('/api/bookings/$bookingId/cancel')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to cancel this booking.', 401, 'UNAUTHENTICATED')
      const parsed = paramsSchema.safeParse(params)
      if (!parsed.success) return jsonError('Invalid booking.', 400, 'INVALID_BOOKING')
      const db = getDb()
      const [booking] = await db.select().from(meetupBookings).where(and(
        eq(meetupBookings.id, parsed.data.bookingId), eq(meetupBookings.attendeeId, userId),
      )).limit(1)
      if (!booking) return jsonError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
      if (!['pending_payment', 'confirmed'].includes(booking.status)) return jsonError('This booking cannot be cancelled.', 409, 'BOOKING_NOT_CANCELLABLE')
      const [meetup] = await db.select().from(meetups).where(eq(meetups.id, booking.meetupId)).limit(1)
      if (!meetup || meetup.startsAt <= new Date()) return jsonError('Bookings cannot be cancelled after the meetup starts.', 409, 'CANCELLATION_CLOSED')

      const [payment] = await db.select().from(payments).where(and(
        eq(payments.bookingId, booking.id), eq(payments.status, 'succeeded'),
      )).limit(1)
      const policy = booking.refundPolicySnapshot
      const refundBeforeHours = Number(policy.refundBeforeHours ?? 0)
      const refundPercentage = Number(policy.refundPercentage ?? 0)
      const eligible = Boolean(payment && Number.isInteger(refundBeforeHours) && Number.isInteger(refundPercentage)
        && refundPercentage > 0 && refundPercentage <= 100
        && meetup.startsAt.getTime() - Date.now() >= refundBeforeHours * 60 * 60 * 1000)
      if (!eligible || !payment) {
        await db.update(meetupBookings).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(meetupBookings.id, booking.id))
        return jsonOk({ bookingId: booking.id, status: 'cancelled', refund: null, message: 'This cancellation is not eligible for a refund under the policy saved with the booking.' })
      }

      const refundAmountMinor = Math.round(booking.grossAmountMinor * refundPercentage / 100)
      const hostDebitMinor = Math.round(booking.hostNetMinor * refundPercentage / 100)
      if (refundAmountMinor <= 0) return jsonError('The saved refund policy calculates no refundable amount.', 409, 'NO_REFUND_DUE')
      const [existing] = await db.select().from(marketplaceRefunds).where(eq(marketplaceRefunds.idempotencyKey, `refund:${booking.id}`)).limit(1)
      if (existing) return jsonOk({ bookingId: booking.id, status: 'cancelled', refund: existing, reused: true })
      const result = await db.transaction(async (tx) => {
        const [refund] = await tx.insert(marketplaceRefunds).values({
          bookingId: booking.id, paymentId: payment.id, attendeeId: userId, hostId: booking.hostId,
          refundAmountMinor, hostDebitMinor, currency: booking.currency,
          idempotencyKey: `refund:${booking.id}`,
          metadata: { refundPercentage, refundBeforeHours, originalReceipt: payment.metadata.receipt ?? null },
        }).returning()
        await tx.update(meetupBookings).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(meetupBookings.id, booking.id))
        return refund
      })
      return jsonOk({ bookingId: booking.id, status: 'cancelled', refund: result, message: 'Refund request submitted for admin review.' }, 201)
    },
  } },
})
